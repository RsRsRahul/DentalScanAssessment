"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { Camera, CheckCircle2, Loader2, RefreshCw, Smile, ArrowLeftToLine, ArrowRightToLine, ArrowUpFromLine, ArrowDownToLine } from "lucide-react";
import MessageSidebar from "./MessageSidebar";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { motion, AnimatePresence } from "framer-motion";

export default function ScanningFlow() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [camReady, setCamReady] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const [capturedImages, setCapturedImages] = useState<string[]>(Array(5).fill(""));
  const [currentStep, setCurrentStep] = useState(0);

  // Status & Guidance
  const [ringColor, setRingColor] = useState<"text-red-500" | "text-amber-500" | "text-green-500">("text-red-500");
  const [guidanceText, setGuidanceText] = useState("Center your face");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);

  // Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [scanId, setScanId] = useState<string | null>(null);

  // References for the loop
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const reqAnimRef = useRef<number | null>(null);
  const countdownStartRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef<number>(-1);
  const stepRef = useRef(0);

  const VIEWS = [
    { label: "Front View", instruction: "Smile and look straight at the camera.", icon: Smile },
    { label: "Left View", instruction: "Turn your head to the left.", icon: ArrowLeftToLine },
    { label: "Right View", instruction: "Turn your head to the right.", icon: ArrowRightToLine },
    { label: "Upper Teeth", instruction: "Tilt your head back and open wide.", icon: ArrowUpFromLine },
    { label: "Lower Teeth", instruction: "Tilt your head down and open wide.", icon: ArrowDownToLine },
  ];

  const [isInitialized, setIsInitialized] = useState(false);

  // Load Model & Camera
  const startScan = useCallback(async () => {
    setHasStarted(true);
    setIsModelLoading(true);
    setCamError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCamReady(true);
      }

      const filesetResolver = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
      );
      const faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: "GPU"
        },
        outputFaceBlendshapes: false,
        runningMode: "VIDEO",
        numFaces: 1
      });

      faceLandmarkerRef.current = faceLandmarker;
      setIsModelLoading(false);
    } catch (err: any) {
      console.error("Initialization Error", err);
      let errorMessage = "Failed to access camera.";
      
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        errorMessage = "Camera API is not available. If testing on mobile, you must use HTTPS (e.g., via ngrok) or localhost. HTTP IP addresses block camera access.";
      } else if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        errorMessage = "Camera permission was denied. Please tap the 'aA' or lock icon in your browser's address bar, go to Website Settings, and allow Camera access.";
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        errorMessage = "No camera found on this device.";
      } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
        errorMessage = "Camera is already in use by another application.";
      } else {
        errorMessage = err.message || "An unknown error occurred while accessing the camera.";
      }
      
      setCamError(errorMessage);
      setIsModelLoading(false);
    }
  }, []);

  // Load from Local Storage on Mount
  useEffect(() => {
    const saved = localStorage.getItem("dentalScanState");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.capturedImages) setCapturedImages(parsed.capturedImages);
        if (parsed.currentStep !== undefined) setCurrentStep(parsed.currentStep);
        
        const hasCapturedAny = parsed.capturedImages && parsed.capturedImages.some((img: string) => img !== "");
        if (parsed.hasStarted || hasCapturedAny || parsed.currentStep > 0) {
          startScan();
        }
      } catch (e) {
        console.error("Failed to parse local storage", e);
      }
    }
    setIsInitialized(true);
  }, [startScan]);

  // Save to Local Storage on Change
  useEffect(() => {
    // Only save if we have initialized and actually started scanning
    if (isInitialized && hasStarted && currentStep < 5) {
      localStorage.setItem("dentalScanState", JSON.stringify({ capturedImages, currentStep, hasStarted: true }));
    }
  }, [capturedImages, currentStep, isInitialized, hasStarted]);

  // Keep stepRef in sync so the loop closure has latest step
  useEffect(() => {
    stepRef.current = currentStep;
  }, [currentStep]);

  // Handle Upload on Complete
  useEffect(() => {
    if (currentStep === 5 && !isUploading && !scanId) {
      setIsUploading(true);
      fetch("/api/scans/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: capturedImages })
      })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setScanId(data.scanId);
            // Clear cache upon successful upload
            localStorage.removeItem("dentalScanState");
          }
        })
        .catch(err => console.error("Upload error:", err))
        .finally(() => setIsUploading(false));
    }
  }, [currentStep, isUploading, scanId, capturedImages]);

  useEffect(() => {
    return () => {
      if (reqAnimRef.current) cancelAnimationFrame(reqAnimRef.current);
    };
  }, []);

  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    setFlash(true);
    setTimeout(() => setFlash(false), 300);

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.8);

      setCapturedImages((prev) => {
        const newImages = [...prev];
        newImages[stepRef.current] = dataUrl;

        let nextStep = stepRef.current + 1;
        if (newImages.filter(Boolean).length === 5) {
          nextStep = 5;
        } else {
          while (nextStep < 5 && newImages[nextStep]) {
            nextStep++;
          }
          if (nextStep === 5) {
            for (let i = 0; i < 5; i++) {
              if (!newImages[i]) {
                nextStep = i;
                break;
              }
            }
          }
        }
        setCurrentStep(nextStep);
        return newImages;
      });
    }
  }, []);

  // Frame Processing Loop
  useEffect(() => {
    if (!camReady || isModelLoading || currentStep >= 5) return;

    function processFrame() {
      const video = videoRef.current;
      const faceLandmarker = faceLandmarkerRef.current;

      if (!video || !faceLandmarker || video.videoWidth === 0) {
        reqAnimRef.current = requestAnimationFrame(processFrame);
        return;
      }

      if (video.currentTime !== lastVideoTimeRef.current) {
        lastVideoTimeRef.current = video.currentTime;
        const results = faceLandmarker.detectForVideo(video, performance.now());

        const step = stepRef.current;
        let newColor: "text-red-500" | "text-amber-500" | "text-green-500" = "text-red-500";
        let newGuidance = "Looking for face...";

        if (results.faceLandmarks && results.faceLandmarks.length > 0) {
          const landmarks = results.faceLandmarks[0];

          const nose = landmarks[1];
          const leftEar = landmarks[234];
          const rightEar = landmarks[454];
          const topHead = landmarks[10];
          const chin = landmarks[152];
          const upperLip = landmarks[13];
          const lowerLip = landmarks[14];

          const faceCenterX = (leftEar.x + rightEar.x) / 2;
          const faceCenterY = (topHead.y + chin.y) / 2;

          // Note: Video is mirrored via CSS (`scale-x-[-1]`). 
          const yaw = nose.x - faceCenterX;
          const pitch = nose.y - faceCenterY;

          const faceWidth = Math.abs(rightEar.x - leftEar.x);
          const mouthWidth = Math.abs(landmarks[308].x - landmarks[78].x);
          const mouthOpenness = lowerLip.y - upperLip.y;

          const normMouthWidth = mouthWidth / faceWidth;
          const normMouthOpen = mouthOpenness / faceWidth;

          let poseCorrect = false;

          switch (step) {
            case 0: // Front View
              if (yaw > 0.05) newGuidance = "Turn slightly right";
              else if (yaw < -0.05) newGuidance = "Turn slightly left";
              else if (pitch > 0.06) newGuidance = "Look slightly up";
              else if (pitch < -0.06) newGuidance = "Look slightly down";
              else { poseCorrect = true; newGuidance = "Hold this pose!"; }
              break;
            case 1: // Left View (User's left)
              if (yaw < 0.06) newGuidance = "Turn your head more left";
              else if (yaw > 0.16) newGuidance = "Too far left, turn back slightly";
              else { poseCorrect = true; newGuidance = "Perfect left view!"; }
              break;
            case 2: // Right View (User's right)
              if (yaw > -0.06) newGuidance = "Turn your head more right";
              else if (yaw < -0.16) newGuidance = "Too far right, turn back slightly";
              else { poseCorrect = true; newGuidance = "Perfect right view!"; }
              break;
            case 3: // Upper Teeth (Tilt up)
              if (pitch > -0.03) newGuidance = "Tilt your head further back";
              else { poseCorrect = true; newGuidance = "Perfect angle!"; }
              break;
            case 4: // Lower Teeth (Tilt down)
              if (pitch < 0.03) newGuidance = "Tilt your chin further down";
              else { poseCorrect = true; newGuidance = "Perfect angle!"; }
              break;
          }

          if (poseCorrect) {
            const isTeethVisible = normMouthOpen > 0.06 && normMouthWidth > 0.33;

            if (!isTeethVisible) {
              newColor = "text-amber-500";
              newGuidance = "Great! Now smile wide and show your teeth!";
            } else {
              newColor = "text-green-500";
              newGuidance = "Hold still! Capturing...";
            }
          }
        }

        setRingColor((prev) => (prev !== newColor ? newColor : prev));
        setGuidanceText((prev) => (prev !== newGuidance ? newGuidance : prev));

        if (newColor === "text-green-500") {
          if (!countdownStartRef.current) {
            countdownStartRef.current = performance.now();
            setCountdown(3);
          } else {
            const elapsed = performance.now() - countdownStartRef.current;
            const remaining = Math.ceil(3 - elapsed / 1000);

            if (remaining <= 0) {
              handleCapture();
              countdownStartRef.current = null;
              setCountdown(null);
            } else {
              setCountdown((prev) => (prev !== remaining ? remaining : prev));
            }
          }
        } else {
          if (countdownStartRef.current) {
            countdownStartRef.current = null;
            setCountdown(null);
          }
        }
      }

      reqAnimRef.current = requestAnimationFrame(processFrame);
    }

    reqAnimRef.current = requestAnimationFrame(processFrame);

    return () => {
      if (reqAnimRef.current) cancelAnimationFrame(reqAnimRef.current);
    };
  }, [camReady, isModelLoading, currentStep, handleCapture]);

  const ActiveIcon = currentStep < 5 ? VIEWS[currentStep].icon : Smile;

  return (
    <div className="flex flex-col items-center bg-black min-h-screen text-white">
      {/* Header */}
      <div className="p-4 w-full bg-zinc-900 border-b border-zinc-800 flex justify-between z-10">
        <h1 className="font-bold text-blue-400">DentalScan AI</h1>
        <span className="text-xs text-zinc-500">Step {Math.min(currentStep + 1, 5)}/5</span>
      </div>

      {/* Main Viewport */}
      <div className="relative w-full max-w-md aspect-[3/4] bg-zinc-950 overflow-hidden flex items-center justify-center">
        {!hasStarted && currentStep < 5 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900 z-30 p-6 text-center">
            <Camera size={64} className="text-blue-500 mb-6" />
            <h2 className="text-2xl font-bold mb-2">Ready to Scan?</h2>
            <p className="text-sm text-zinc-400 mb-8">
              We'll use an AI model to guide you through 5 angles of your mouth. Please grant camera access when prompted.
            </p>
            <button 
              onClick={startScan}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-full shadow-lg shadow-blue-500/30 transition-all transform hover:scale-105 active:scale-95"
            >
              Start Camera
            </button>
          </div>
        ) : camError && currentStep < 5 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900 z-30 p-6 text-center">
            <div className="w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mb-4">
              <span className="text-2xl font-bold">!</span>
            </div>
            <h2 className="text-xl font-bold mb-2">Camera Error</h2>
            <p className="text-sm text-zinc-400 mb-6">{camError}</p>
            <button 
              onClick={startScan}
              className="bg-zinc-800 hover:bg-zinc-700 text-white font-semibold py-2 px-6 rounded-full transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : isModelLoading && currentStep < 5 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20">
            <Loader2 size={40} className="text-blue-500 animate-spin mb-4" />
            <p className="text-sm font-medium">Loading AI Model...</p>
            <p className="text-xs text-zinc-500 mt-2 max-w-[200px] text-center">Please accept camera permissions. The model might take a moment to load.</p>
          </div>
        ) : null}

        {currentStep < 5 ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover grayscale opacity-80 scale-x-[-1]"
            />

            {/* Reference Image Overlay (Picture-in-Picture) */}
            <div className="absolute top-4 right-4 w-20 h-24 bg-black/70 backdrop-blur-sm border border-zinc-700 rounded-lg flex flex-col items-center justify-center shadow-lg z-20">
              <ActiveIcon size={32} className="text-zinc-400 mb-2" />
              <span className="text-[10px] text-zinc-300 font-medium text-center px-1">
                {VIEWS[currentStep].label}
              </span>
            </div>

            {/* Guidance Overlay Ring */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
              <svg
                viewBox="0 0 100 150"
                className={`w-3/4 h-1/2 transition-colors duration-300 ease-in-out ${ringColor}`}
                style={{ fill: 'none', strokeWidth: 2, stroke: 'currentColor' }}
              >
                <ellipse cx="50" cy="75" rx="40" ry="60" className="opacity-80 drop-shadow-md" strokeDasharray="4 4" />
              </svg>
            </div>

            {/* Countdown Overlay */}
            <AnimatePresence>
              {countdown !== null && (
                <motion.div
                  key={countdown}
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.5 }}
                  transition={{ duration: 0.3 }}
                  className="absolute inset-0 flex items-center justify-center pointer-events-none z-30"
                >
                  <span className="text-9xl font-black text-white drop-shadow-[0_0_15px_rgba(0,0,0,0.8)]">
                    {countdown}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Flash Effect */}
            <AnimatePresence>
              {flash && (
                <motion.div
                  initial={{ opacity: 1 }}
                  animate={{ opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="absolute inset-0 bg-white z-40 pointer-events-none"
                />
              )}
            </AnimatePresence>

            {/* Dynamic Suggestion Overlays */}
            <div className="absolute top-6 left-0 right-28 text-center pointer-events-none px-4 z-20">
              <div className="inline-block bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-zinc-700">
                <p className={`text-sm font-semibold transition-colors duration-300 ${ringColor}`}>
                  {guidanceText}
                </p>
              </div>
            </div>

            {/* Bottom Instruction Overlay */}
            <div className="absolute bottom-6 left-0 right-0 p-4 text-center pointer-events-none z-20">
              <p className="text-sm font-medium text-white/90 drop-shadow-md bg-black/40 inline-block px-4 py-2 rounded-lg backdrop-blur-sm">
                {VIEWS[currentStep].instruction}
              </p>
            </div>
          </>
        ) : (
          <div className="flex flex-col h-full w-full bg-black relative">
            {isUploading ? (
              <div className="text-center p-10 flex flex-col items-center justify-center h-full">
                <Loader2 size={48} className="text-blue-500 mx-auto mb-4 animate-spin" />
                <h2 className="text-xl font-bold">Uploading Scan...</h2>
                <p className="text-zinc-400 mt-2">Please wait</p>
              </div>
            ) : scanId ? (
              <MessageSidebar
                scanId={scanId}
                patientId="patient-456"
                clinicId="clinic-123"
                senderId="patient-456"
              />
            ) : (
              <div className="text-center p-10 flex flex-col items-center justify-center h-full">
                <CheckCircle2 size={48} className="text-red-500 mx-auto mb-4" />
                <h2 className="text-xl font-bold">Upload Failed</h2>
                <p className="text-zinc-400 mt-2">Could not save scan results.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Thumbnails */}
      <div className="flex gap-2 p-4 overflow-x-auto w-full border-t border-zinc-900">
        {VIEWS.map((v, i) => (
          <div
            key={i}
            onClick={() => {
              if (capturedImages[i] && currentStep < 5) {
                const newImages = [...capturedImages];
                newImages[i] = "";
                setCapturedImages(newImages);
                setCurrentStep(i);
              }
            }}
            className={`relative w-16 h-20 rounded border-2 shrink-0 ${capturedImages[i] && currentStep < 5 ? 'cursor-pointer group' : ''} ${i === currentStep ? 'border-blue-500 bg-blue-500/10' : 'border-zinc-800'}`}
          >
            {capturedImages[i] ? (
              <>
                <img src={capturedImages[i]} className="w-full h-full object-cover" />
                {currentStep < 5 && (
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-opacity rounded">
                    <RefreshCw size={16} className="text-white mb-1" />
                    <span className="text-[10px] text-white">Retake</span>
                  </div>
                )}
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-[10px] text-zinc-700 text-center px-1 bg-zinc-900/50">
                <v.icon size={16} className="mb-1 opacity-50" />
                {v.label}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
