import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { scanId, recipientId } = body;

    if (!scanId || !recipientId) {
      return NextResponse.json({ error: "Missing scanId or recipientId" }, { status: 400 });
    }

    const notification = await prisma.notification.create({
      data: {
        scanId,
        recipientId,
        type: "SCAN_COMPLETED",
      },
    });

    console.log("Notifying clinic:", recipientId);

    return NextResponse.json({ success: true, notificationId: notification.id });
  } catch (err) {
    console.error("Notification API Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
