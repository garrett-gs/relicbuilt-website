import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Sends Wallflower RELIC's signed W-9 to a customer as a courtesy, with a
// personalized cover, and records the send on the customer + activity log.
// The W-9 itself is our own fixed tax document (served auto-dated at /api/w9);
// what's personalized here is the cover email, not the form.
export const runtime = "nodejs";

function escape(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function POST(req: NextRequest) {
  try {
    const { customer_id } = await req.json();
    if (!customer_id) {
      return NextResponse.json({ error: "customer_id required" }, { status: 400 });
    }

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_AXIOM_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_AXIOM_SUPABASE_ANON_KEY!
    );

    const { data: customer, error: custErr } = await supabase
      .from("customers")
      .select("id,name,email,company_id,company_name,notes")
      .eq("id", customer_id)
      .single();
    if (custErr || !customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const toEmail = (customer.email || "").trim();
    if (!toEmail) {
      return NextResponse.json(
        { error: "This customer has no email on file. Add one first." },
        { status: 400 }
      );
    }

    // Resolve a company name for personalization ("for <Company>'s records").
    let companyName = (customer.company_name || "").trim();
    if (!companyName && customer.company_id) {
      const { data: co } = await supabase
        .from("companies")
        .select("name")
        .eq("id", customer.company_id)
        .single();
      if (co?.name) companyName = co.name.trim();
    }

    const { data: settings } = await supabase
      .from("settings")
      .select("biz_name,biz_phone,biz_email")
      .limit(1)
      .single();
    const bizName = settings?.biz_name || "Wallflower RELIC";
    const bizPhone = settings?.biz_phone || "";

    const origin =
      req.headers.get("origin") || `https://${req.headers.get("host") || "relicbuilt.com"}`;
    const w9Url = `${origin}/api/w9`;

    const firstName = (customer.name || "").trim().split(/\s+/)[0] || "there";
    const forWhom = companyName ? `${escape(companyName)}'s records` : "your records";

    const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#222;background:#fff;">
  <div style="padding:20px 32px;border-bottom:3px solid #5b642e;">
    <img src="https://relicbuilt.com/wr-logo-black.png" alt="${escape(bizName)}" style="height:36px;display:block;" />
  </div>
  <div style="padding:32px;">
    <h2 style="margin:0 0 18px;font-size:22px;color:#111;">Our W-9</h2>
    <p style="font-size:15px;color:#333;margin:0 0 18px;">Hi ${escape(firstName)},</p>
    <p style="font-size:14px;color:#555;margin:0 0 24px;line-height:1.6;">
      Here's our W-9 for ${forWhom}, in case it's handy for your files.
    </p>

    <div style="text-align:center;margin:28px 0;">
      <a href="${w9Url}" style="display:inline-block;background:#5b642e;color:#0a0a0a;padding:16px 32px;text-decoration:none;font-weight:bold;letter-spacing:0.08em;font-size:14px;text-transform:uppercase;">
        Download Our W-9
      </a>
    </div>

    <p style="font-size:13px;color:#888;margin:0 0 8px;text-align:center;line-height:1.6;">
      It opens as our signed PDF, dated the day you grab it. Nothing needed on your end.
    </p>

    <p style="font-size:13px;color:#888;margin:24px 0 0;line-height:1.6;">
      Questions? Just reply to this email or call ${bizPhone ? escape(bizPhone) : "us"}.
    </p>
  </div>
  <div style="padding:16px 32px;border-top:1px solid #eee;font-size:11px;color:#999;text-align:center;">
    ${escape(bizName)}
  </div>
</div>
    `.trim();

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${bizName} <notifications@relicbuilt.com>`,
        to: [toEmail],
        subject: `${bizName} W-9 for your records`,
        html,
        reply_to: settings?.biz_email || "garrett@relicbuilt.com",
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: err.message || `Resend returned ${res.status}` },
        { status: 500 }
      );
    }

    // Record the send on the customer (comms log) and the activity trail.
    const stamp = new Date().toISOString();
    const noteText = `Sent our W-9 to ${toEmail}${companyName ? ` (${companyName})` : ""} — courtesy.`;
    const notes = [...(Array.isArray(customer.notes) ? customer.notes : []), { text: noteText, created_at: stamp }];
    await supabase.from("customers").update({ notes, updated_at: stamp }).eq("id", customer.id);
    await supabase.from("activity_log").insert({
      action: "sent",
      entity: "customer",
      entity_id: customer.id,
      label: `Sent W-9 to ${customer.name || toEmail}`,
      meta: { document: "W-9", channel: "email", recipient: toEmail, company: companyName || null },
    });

    return NextResponse.json({ ok: true, sentTo: toEmail });
  } catch (err) {
    console.error("[send-w9] failed:", err);
    return NextResponse.json({ error: "Could not send W-9" }, { status: 500 });
  }
}
