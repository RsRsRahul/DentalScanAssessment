import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { images } = body;

    // Save the actual base64 images as a JSON string
    const scan = await prisma.scan.create({
      data: {
        status: "completed",
        images: images ? JSON.stringify(images) : "[]",
      },
    });

    const scanId = scan.id;
    const recipientId = "clinic-123"; // Mocked for demonstration

    // Non-blocking fire-and-forget notification
    const host = req.headers.get("host");
    const protocol = process.env.NODE_ENV === "development" ? "http" : "https";
    
    void (async () => {
      try {
        await fetch(`${protocol}://${host}/api/notifications/scan-completed`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scanId, recipientId }),
        });
      } catch (e) {
        console.error("Failed to fire notification:", e);
      }
    })();

    return NextResponse.json({ success: true, scanId });
  } catch (err) {
    console.error("Upload API Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
