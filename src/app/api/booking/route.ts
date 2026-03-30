import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, phone, date, time, notes } = body;

    if (!name || !email || !date || !time) {
      return NextResponse.json(
        { error: "Name, email, date, and time are required" },
        { status: 400 }
      );
    }

    // TODO: Save to Supabase bookings table
    // TODO: Send confirmation email via Resend
    // TODO: Check for conflicting bookings
    console.log("Booking submission:", {
      name,
      email,
      phone,
      date,
      time,
      notes,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
