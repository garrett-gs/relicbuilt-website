import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const EVENTS = {
  approval_sent:    { subject: (p: string) => `Action Required — ${p}`,              label: "sent you an approval request" },
  comment_sent:     { subject: (p: string) => `New Message — ${p}`,                  label: "sent you a message" },
  stage_changed:    { subject: (p: string) => `Project Update — ${p}`,               label: "updated your project status" },
  approval_response:{ subject: (p: string) => `Client Responded — ${p}`,             label: "responded to an approval request" },
  client_comment:   { subject: (p: string) => `New Client Message — ${p}`,           label: "left you a message" },
};

type EventKey = keyof typeof EVENTS;

function buildHtml(opts: {
  event: EventKey;
  project_name: string;
  from_name: string;
  message?: string;
  portal_url: string;
  extra?: string;
}) {
  const { event, project_name, from_name, message, portal_url, extra } = opts;
  const ev = EVENTS[event];
  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#111">
      <div style="background:#fff;padding:20px 32px;border-bottom:3px solid #c4a24d;margin-bottom:24px">
        <img src="https://relicbuilt.com/logo-full.png" alt="RELIC" style="height:48px;width:auto;display:block;" />
      </div>
      <div style="padding:0 32px 32px">
        <h2 style="font-size:18px;margin:0 0 8px">${project_name}</h2>
        <p style="color:#555;margin:0 0 20px"><strong>${from_name}</strong> ${ev.label}.</p>
        ${message ? `<div style="background:#f5f5f5;border-left:3px solid #c4a24d;padding:12px 16px;margin-bottom:20px;font-size:14px;color:#333">${message}</div>` : ""}
        ${extra ? `<p style="font-size:14px;color:#555;margin-bottom:20px">${extra}</p>` : ""}
        <a href="${portal_url}" style="display:inline-block;background:#c4a24d;color:#fff;text-decoration:none;padding:10px 24px;font-size:14px">View in Portal →</a>
        <p style="margin-top:32px;font-size:11px;color:#aaa">RELIC Custom Fabrications &nbsp;·&nbsp; relicbuilt.com</p>
      </div>
    </div>
  `;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      event,
      project_name,
      from_name,
      message,
      portal_url,
      extra,
      to_client,
      client_email,
      client_name,
    } = body as {
      event: EventKey;
      project_name: string;
      from_name: string;
      message?: string;
      portal_url: string;
      extra?: string;
      to_client?: boolean;
      client_email?: string;
      client_name?: string;
    };

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) return NextResponse.json({ error: "RESEND_API_KEY not set" }, { status: 500 });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_AXIOM_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_AXIOM_SUPABASE_ANON_KEY!
    );

    // Load settings to get team members
    const { data: settings } = await supabase.from("settings").select("biz_name,team_members").limit(1).single();
    const bizName = settings?.biz_name || "RELIC";
    const teamMembers: Array<{ name: string; email: string; notifications?: { portal_updates?: boolean } }> =
      settings?.team_members || [];

    const ev = EVENTS[event];
    if (!ev) return NextResponse.json({ error: "Unknown event" }, { status: 400 });

    const html = buildHtml({ event, project_name, from_name, message, portal_url, extra });
    const subject = ev.subject(project_name);

    const sends: Promise<Response>[] = [];

    const sendEmail = (to: string) =>
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: `${bizName} <notifications@relicbuilt.com>`, to: [to], subject, html }),
      });

    // Notify team members who have portal_updates on
    const notifyTeam = ["approval_response", "client_comment"].includes(event);
    const notifyClient = to_client && client_email;

    const teamToNotify = teamMembers.filter((m) => m.notifications?.portal_updates && m.email);
    console.log("[notify-portal] event:", event, "| notifyTeam:", notifyTeam, "| notifyClient:", !!notifyClient, "| client_email:", client_email, "| team eligible:", teamToNotify.map((m) => m.email));

    if (notifyTeam) {
      teamToNotify.forEach((m) => sends.push(sendEmail(m.email)));
    }

    if (notifyClient && client_email) {
      const clientHtml = buildHtml({
        event,
        project_name,
        from_name: bizName,
        message,
        portal_url,
        extra: `Hi ${client_name || "there"} — you have an update on your project.`,
      });
      sends.push(
        fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: `${bizName} <notifications@relicbuilt.com>`, to: [client_email], subject, html: clientHtml }),
        })
      );
    }

    const results = await Promise.all(sends);
    const statuses = await Promise.all(results.map(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) })));
    console.log("[notify-portal] send results:", JSON.stringify(statuses));
    return NextResponse.json({ ok: true, sent: sends.length, statuses });
  } catch (err) {
    console.error("notify-portal error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
