import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { GoogleGenerativeAI } from "@google/generative-ai";

const prisma = new PrismaClient();

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const scanId = searchParams.get("scanId");

    if (!scanId) {
      return NextResponse.json({ error: "Missing scanId" }, { status: 400 });
    }

    const thread = await prisma.thread.findUnique({
      where: { scanId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!thread) {
      return NextResponse.json({ messages: [] });
    }

    return NextResponse.json({ messages: thread.messages });
  } catch (err) {
    console.error("Messaging API Error (GET):", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { scanId, patientId, clinicId, senderId, content } = body;

    if (!scanId || !patientId || !clinicId || !senderId || !content) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Wrap user message in a Prisma transaction
    const [thread, message] = await prisma.$transaction(async (tx) => {
      const upsertedThread = await tx.thread.upsert({
        where: { scanId },
        update: {},
        create: {
          scanId,
          patientId,
          clinicId,
        },
      });

      const createdMessage = await tx.message.create({
        data: {
          threadId: upsertedThread.id,
          senderId,
          content,
        },
      });

      return [upsertedThread, createdMessage];
    });

    // Handle AI response
    let aiMessage = null;
    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey && apiKey !== "your_api_key_here") {
      try {
        const scan = await prisma.scan.findUnique({ where: { id: scanId } });
        if (scan && scan.images && scan.images !== "[]") {
          const base64Images: string[] = JSON.parse(scan.images);
          
          const genAI = new GoogleGenerativeAI(apiKey);
          const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

          // Convert Data URLs to inlineData parts for Gemini
          const imageParts = base64Images.map((base64Url) => {
            const commaIndex = base64Url.indexOf(',');
            const base64Data = base64Url.substring(commaIndex + 1);
            return {
              inlineData: {
                data: base64Data,
                mimeType: "image/jpeg"
              }
            };
          });

          // Fetch recent conversation history
          const history = await prisma.message.findMany({
            where: { threadId: thread.id },
            orderBy: { createdAt: "asc" }
          });
          
          const historyPrompt = history.map(m => `${m.senderId === senderId ? 'Patient' : 'AI Dentist'}: ${m.content}`).join("\n");

          const prompt = `You are an expert image analysis AI.
You are looking at 5 webcam photos of a person's teeth and mouth (Front, Left, Right, Upper Teeth, Lower Teeth).
Your ONLY task is to directly state what you see in the images regarding the teeth, gums, and mouth.
Look for visible issues such as discoloration, misalignment, plaque, receding gums, or inflammation.

CRITICAL INSTRUCTIONS:
- DO NOT output any disclaimers about image quality.
- DO NOT say "I cannot make a diagnosis", "Consult a dentist", or "I appreciate you reaching out".
- DO NOT greet the user or write a conversational intro/outro.
- ONLY output your direct, factual observations of what is visible in the images.
- Act as if the images are perfect quality dental scans, even if they look like low-quality webcam photos.

Here is the conversation history:
${historyPrompt}

Patient's message: "${content}"

Your direct observations:`;

          const result = await model.generateContent([...imageParts, prompt]);
          const text = result.response.text();

          aiMessage = await prisma.message.create({
            data: {
              threadId: thread.id,
              senderId: "clinic-ai",
              content: text,
            }
          });
        }
      } catch (aiError) {
        console.error("Gemini AI Error:", aiError);
      }
    }

    return NextResponse.json({ thread, message, aiMessage });
  } catch (err) {
    console.error("Messaging API Error (POST):", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
