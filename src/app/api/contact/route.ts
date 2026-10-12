import { NextRequest, NextResponse } from "next/server";
import { notifyNewIntake } from "@/lib/notify-new-intake";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, phone, subject, message, type } = body;

    if (!name || !email) {
      return NextResponse.json(
        { error: "Name and email are required" },
        { status: 400 }
      );
    }

    // Every inbound request (new-client / estimate request / general inquiry)
    // alerts the owner immediately and drops onto the daily reminders until
    // handled. Best-effort — a notification failure never fails the form.
    const kindLabel = type === "new-client" ? "New Client" : "Website";
    await notifyNewIntake({
      kind: "estimate_request",
      title: `${name}${type ? ` (${kindLabel})` : ""}`,
      clientName: name,
      clientEmail: email,
      clientPhone: phone || null,
      summary: [subject ? `Subject: ${subject}` : "", message || ""]
        .filter(Boolean)
        .join("\n"),
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
