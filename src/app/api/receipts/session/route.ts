import { NextRequest, NextResponse } from "next/server";
import {
  issueReceiptsSession,
  lockedOut,
  pinMatches,
  pinMembers,
  receiptsDb,
  recordPinResult,
} from "@/lib/receipts-session";

// GET  /api/receipts/session          → { members: [names] } for the PIN picker
// POST /api/receipts/session { name, pin } → { token, name }
// PINs are checked here and never sent to the browser.

export async function GET() {
  const members = await pinMembers(receiptsDb());
  return NextResponse.json({ members: members.map((m) => m.name) });
}

export async function POST(req: NextRequest) {
  const { name, pin } = (await req.json().catch(() => ({}))) as { name?: string; pin?: string };
  if (!name || !pin) return NextResponse.json({ error: "Pick your name and enter your PIN." }, { status: 400 });
  if (lockedOut(name)) {
    return NextResponse.json({ error: "Too many wrong PINs. Try again in 15 minutes." }, { status: 429 });
  }
  const member = (await pinMembers(receiptsDb())).find((m) => m.name === name);
  const ok = !!member?.pin && pinMatches(pin, member.pin);
  recordPinResult(name, ok);
  if (!ok) return NextResponse.json({ error: "Incorrect PIN" }, { status: 401 });
  return NextResponse.json({ token: issueReceiptsSession(member!.name), name: member!.name });
}
