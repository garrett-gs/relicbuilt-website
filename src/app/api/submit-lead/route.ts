import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, phone, description, budget_range, inspiration_photos } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_AXIOM_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_AXIOM_SUPABASE_ANON_KEY!
    );

    const { data: lead, error } = await supabase
      .from("leads")
      .insert({
        name: name.trim(),
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        description: description?.trim() || null,
        budget_range: budget_range || null,
        inspiration_photos: inspiration_photos || [],
        status: "new",
        source: "web",
      })
      .select()
      .single();

    if (error) {
      console.error("submit-lead error:", error);
      return NextResponse.json({ error: "Failed to submit" }, { status: 500 });
    }

    // Notify team via email
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      const photoCount = (inspiration_photos || []).length;
      const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#222;">
  <div style="padding:16px 24px;border-bottom:3px solid #c4a24d;">
    <img src="https://relicbuilt.com/logo-full.png" alt="RELIC" style="height:40px;object-fit:contain;display:block;" />
  </div>
  <div style="padding:24px;">
    <h2 style="margin:0 0 16px;font-size:18px;color:#111;">New Lead Submitted</h2>
    <table style="font-size:14px;border-collapse:collapse;width:100%;">
      <tr><td style="padding:4px 0;color:#777;width:120px;">Name:</td><td style="padding:4px 0;font-weight:600;">${name}</td></tr>
      ${email ? `<tr><td style="padding:4px 0;color:#777;">Email:</td><td style="padding:4px 0;">${email}</td></tr>` : ""}
      ${phone ? `<tr><td style="padding:4px 0;color:#777;">Phone:</td><td style="padding:4px 0;">${phone}</td></tr>` : ""}
      ${budget_range ? `<tr><td style="padding:4px 0;color:#777;">Budget:</td><td style="padding:4px 0;">${budget_range}</td></tr>` : ""}
      ${photoCount > 0 ? `<tr><td style="padding:4px 0;color:#777;">Photos:</td><td style="padding:4px 0;">${photoCount} uploaded</td></tr>` : ""}
    </table>
    ${description ? `<p style="margin:16px 0 0;font-size:14px;color:#555;line-height:1.6;border-left:3px solid #c4a24d;padding-left:12px;">${description}</p>` : ""}
    <p style="margin-top:24px;"><a href="https://relicbuilt.com/axiom/leads" style="background:#c4a24d;color:#fff;text-decoration:none;padding:10px 24px;font-size:14px;font-weight:bold;">View in Axiom →</a></p>
  </div>
</div>`;

      // Load team members to notify
      const { data: settings } = await supabase
        .from("settings")
        .select("team_members,biz_email")
        .limit(1)
        .single();

      const teamEmails: string[] = [];
      if (settings?.team_members) {
        for (const m of settings.team_members) {
          if (m.email && m.notifications?.portal_updates !== false) {
            teamEmails.push(m.email);
          }
        }
      }
      if (settings?.biz_email && !teamEmails.includes(settings.biz_email)) {
        teamEmails.push(settings.biz_email);
      }

      for (const to of teamEmails) {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "RELIC Custom Fabrications <notifications@relicbuilt.com>",
            to: [to],
            subject: `New Lead: ${name}`,
            html,
          }),
        });
      }
    }

    return NextResponse.json({ ok: true, id: lead.id });
  } catch (err) {
    console.error("submit-lead error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
