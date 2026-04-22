"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Building2, User, Stethoscope, Sparkles, AlertCircle } from "lucide-react";

interface Message {
  id: string;
  threadId: string;
  senderId: string;
  content: string;
  createdAt: string;
}

interface MessageSidebarProps {
  scanId: string;
  patientId: string;
  clinicId: string;
  senderId: string;
}

export default function MessageSidebar({ scanId, patientId, clinicId, senderId }: MessageSidebarProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchMessages() {
      try {
        const res = await fetch(`/api/messages?scanId=${scanId}`);
        if (!res.ok) throw new Error("Failed to fetch messages");
        const data = await res.json();
        setMessages(data.messages || []);
      } catch (err) {
        console.error(err);
        setError("Failed to load messages.");
      } finally {
        setIsLoading(false);
      }
    }
    fetchMessages();
  }, [scanId]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isTyping]);

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (error) setError(null);

    const content = textareaRef.current?.value.trim();
    if (!content) return;

    // Optimistic message
    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: Message = {
      id: tempId,
      threadId: "temp-thread",
      senderId,
      content,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticMessage]);

    if (textareaRef.current) {
      textareaRef.current.value = "";
      textareaRef.current.style.height = 'auto'; // Reset height
    }

    try {
      setIsTyping(true);
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scanId, patientId, clinicId, senderId, content }),
      });

      if (!res.ok) throw new Error("Failed to send message");

      const data = await res.json();

      // Replace optimistic message with actual message from server and add AI response
      setMessages((prev) => {
        const next = prev.map((msg) => (msg.id === tempId ? data.message : msg));
        if (data.aiMessage) {
          next.push(data.aiMessage);
        }
        return next;
      });
    } catch (err) {
      console.error(err);
      // Remove the optimistic message
      setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
      setError("Message failed to send. Please try again.");
    } finally {
      setIsTyping(false);
    }
  }, [scanId, patientId, clinicId, senderId, error]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  return (
    <div className="flex flex-col h-full w-full max-w-sm bg-gradient-to-b from-zinc-950 to-zinc-900 border-l border-zinc-800/50 text-white shadow-2xl relative overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-white/5 bg-white/5 backdrop-blur-md z-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/20 text-blue-400 rounded-xl shadow-[0_0_15px_rgba(59,130,246,0.3)]">
            <Stethoscope size={20} />
          </div>
          <div>
            <h2 className="font-bold text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-cyan-300">
              Clinic Consult
            </h2>
            <p className="text-[11px] text-zinc-400 font-medium tracking-wide flex items-center gap-1">
              ID: <span className="font-mono text-zinc-300">{scanId.slice(0, 8)}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-6 custom-scrollbar relative z-0">
        {/* Subtle background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>

        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-zinc-500">
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: "linear" }}>
              <Sparkles className="text-blue-500/50" size={24} />
            </motion.div>
            <span className="text-sm font-medium">Connecting to Clinic...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-zinc-500">
            <div className="w-16 h-16 rounded-full bg-zinc-800/50 flex items-center justify-center shadow-inner">
              <Building2 size={32} className="text-zinc-600" />
            </div>
            <p className="text-sm text-center">No messages yet.<br />The Clinic is ready to assist.</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((msg) => {
              const isMe = msg.senderId === senderId;
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.2 }}
                  className={`flex flex-col max-w-[90%] ${isMe ? "self-end items-end" : "self-start items-start"}`}
                >
                  <div className={`flex items-end gap-2 mb-1 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 shadow-lg ${isMe ? "bg-blue-600/20 text-blue-400" : "bg-cyan-500/20 text-cyan-400"
                      }`}>
                      {isMe ? <User size={14} /> : <Building2 size={14} />}
                    </div>
                    <div
                      className={`px-4 py-3 rounded-2xl text-[14px] leading-relaxed shadow-md backdrop-blur-sm break-words ${isMe
                        ? "bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-br-sm border border-blue-500/30"
                        : "bg-zinc-800/80 text-zinc-100 rounded-bl-sm border border-zinc-700/50"
                        }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                  <span className={`text-[10px] text-zinc-500 font-medium px-10`}>
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}

        {isTyping && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col max-w-[85%] self-start items-start"
          >
            <div className="flex items-end gap-2 mb-1">
              <div className="w-7 h-7 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0 shadow-lg">
                <Building2 size={14} />
              </div>
              <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-zinc-800/80 border border-zinc-700/50 backdrop-blur-sm flex items-center gap-1.5 h-11">
                <motion.div className="w-1.5 h-1.5 bg-cyan-400 rounded-full" animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0 }} />
                <motion.div className="w-1.5 h-1.5 bg-cyan-400 rounded-full" animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }} />
                <motion.div className="w-1.5 h-1.5 bg-cyan-400 rounded-full" animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }} />
              </div>
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-zinc-950/90 backdrop-blur-xl border-t border-white/5 relative z-10 shadow-[0_-10px_20px_rgba(0,0,0,0.2)]">
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="text-xs text-red-400 mb-3 px-1 font-medium flex items-center gap-1.5 bg-red-500/10 p-2 rounded-lg border border-red-500/20"
            >
              <AlertCircle size={14} /> {error}
            </motion.div>
          )}
        </AnimatePresence>
        <form onSubmit={handleSubmit} className="relative flex items-end gap-2">
          <div className="relative flex-1 bg-zinc-900/80 rounded-2xl border border-zinc-700/50 shadow-inner overflow-hidden focus-within:border-blue-500/50 focus-within:bg-zinc-800/80 transition-all">
            <textarea
              ref={textareaRef}
              onKeyDown={handleKeyDown}
              placeholder="Message the Clinic..."
              className="w-full bg-transparent text-sm text-zinc-100 p-3.5 pr-10 resize-none focus:outline-none placeholder-zinc-500 max-h-32 min-h-[52px] custom-scrollbar"
              rows={1}
              onChange={(e) => {
                e.target.style.height = 'auto';
                e.target.style.height = e.target.scrollHeight + 'px';
              }}
            />
          </div>
          <button
            type="submit"
            disabled={isTyping}
            className="w-[52px] h-[52px] rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 hover:from-blue-400 hover:to-blue-600 text-white flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            <Send size={20} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </button>
        </form>
      </div>
    </div>
  );
}
