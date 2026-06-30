// Daily digest of every assignee's open tasks. Vercel Cron hits this once a
// day (see vercel.json). Tasks are grouped by `assignee` (a free-text name on
// the task row); the assignee's email is resolved against settings.team_members.
// Tasks without an assignee, or assignees we can't resolve to an email, are
// skipped silently — we don't want the digest to block on missing data.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { formatDueDate } from "@/lib/utils";

type Task = {
  id: string;
  title: string;
  description?: string;
  status: "todo" | "in_progress" | "done";
  priority: "high" | "medium" | "low";
  assignee?: string;
  due_date?: string;
  custom_work_id?: string;
};

type TeamMember = { name: string; email: string };

const PRIORITY_ORDER: Record<Task["priority"], number> = { high: 0, medium: 1, low: 2 };
const STATUS_LABEL: Record<Task["status"], string> = { todo: "To Do", in_progress: "In Progress", done: "Done" };

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildEmailHtml(opts: {
  recipientName: string;
  bizName: string;
  tasks: Task[];
  projectNames: Record<string, string>;
  siteUrl: string;
}): string {
  const { recipientName, bizName, tasks, projectNames, siteUrl } = opts;
  const rows = tasks.map((t) => {
    const due = t.due_date ? formatDueDate(t.due_date) : null;
    const dueCell = due
      ? `<span style="color:${due.soon ? "#ea580c" : "#555"};font-size:13px">${due.text}</span>`
      : `<span style="color:#999;font-size:13px">—</span>`;
    const projectName = t.custom_work_id ? projectNames[t.custom_work_id] : null;
    const titleLine = `<strong>${escapeHtml(t.title)}</strong>` +
      (projectName ? `<div style="color:#666;font-size:12px;margin-top:2px">${escapeHtml(projectName)}</div>` : "");
    return `
      <tr style="border-bottom:1px solid #eee">
        <td style="padding:10px 12px;vertical-align:top">${titleLine}</td>
        <td style="padding:10px 12px;vertical-align:top;text-transform:uppercase;font-size:11px;letter-spacing:.04em;color:#666">${STATUS_LABEL[t.status]}</td>
        <td style="padding:10px 12px;vertical-align:top;text-transform:uppercase;font-size:11px;letter-spacing:.04em;color:#666">${t.priority}</td>
        <td style="padding:10px 12px;vertical-align:top">${dueCell}</td>
      </tr>
    `;
  }).join("");

  return `
    <div style="font-family:sans-serif;max-width:640px;margin:0 auto;color:#111">
      <div style="background:#fff;padding:20px 32px;border-bottom:3px solid #5b642e;margin-bottom:24px">
        <img src="https://relicbuilt.com/logo-full.png" alt="RELIC" style="height:48px;width:auto;display:block;" />
      </div>
      <div style="padding:0 32px 32px">
        <h2 style="font-size:18px;margin:0 0 8px">Good morning${recipientName ? `, ${escapeHtml(recipientName)}` : ""}</h2>
        <p style="color:#555;margin:0 0 20px">You have <strong>${tasks.length}</strong> open task${tasks.length === 1 ? "" : "s"}.</p>
        <table style="width:100%;border-collapse:collapse;border:1px solid #eee">
          <thead>
            <tr style="background:#fafafa">
              <th align="left" style="padding:10px 12px;font-size:11px;letter-spacing:.04em;color:#666;text-transform:uppercase">Task</th>
              <th align="left" style="padding:10px 12px;font-size:11px;letter-spacing:.04em;color:#666;text-transform:uppercase">Status</th>
              <th align="left" style="padding:10px 12px;font-size:11px;letter-spacing:.04em;color:#666;text-transform:uppercase">Priority</th>
              <th align="left" style="padding:10px 12px;font-size:11px;letter-spacing:.04em;color:#666;text-transform:uppercase">Due</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="margin:24px 0 0">
          <a href="${siteUrl}/axiom/my-tasks" style="display:inline-block;background:#5b642e;color:#fff;text-decoration:none;padding:10px 24px;font-size:14px">Open my tasks →</a>
        </p>
        <p style="margin-top:32px;font-size:11px;color:#aaa">${escapeHtml(bizName)} &nbsp;·&nbsp; relicbuilt.com</p>
      </div>
    </div>
  `;
}

async function runDigest() {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return { ok: false, error: "RESEND_API_KEY not set" };

  const supabase = createClient(
    process.env.NEXT_PUBLIC_AXIOM_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_AXIOM_SUPABASE_ANON_KEY!
  );

  const [tasksRes, settingsRes, projectsRes] = await Promise.all([
    supabase.from("tasks").select("id,title,description,status,priority,assignee,due_date,custom_work_id").neq("status", "done"),
    supabase.from("settings").select("biz_name,team_members").limit(1).single(),
    supabase.from("custom_work").select("id,project_name"),
  ]);

  const tasks = (tasksRes.data || []) as Task[];
  const teamMembers = (settingsRes.data?.team_members || []) as TeamMember[];
  const bizName = settingsRes.data?.biz_name || "RELIC";
  const projectNames: Record<string, string> = {};
  for (const p of (projectsRes.data || []) as { id: string; project_name: string }[]) {
    projectNames[p.id] = p.project_name;
  }

  // Resolve assignee names → emails. Match case-insensitively, trimmed.
  const emailByName = new Map<string, { name: string; email: string }>();
  for (const m of teamMembers) {
    if (!m.name || !m.email) continue;
    emailByName.set(m.name.trim().toLowerCase(), { name: m.name, email: m.email });
  }

  // Group open tasks by assignee.
  const grouped = new Map<string, Task[]>();
  for (const t of tasks) {
    const key = (t.assignee || "").trim().toLowerCase();
    if (!key) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(t);
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://relicbuilt.com";
  const sendResults: Array<{ assignee: string; email?: string; status: number | "skipped"; reason?: string }> = [];

  for (const [key, list] of grouped) {
    const member = emailByName.get(key);
    if (!member) {
      sendResults.push({ assignee: key, status: "skipped", reason: "no matching team member email" });
      continue;
    }
    list.sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority] ?? 9;
      const pb = PRIORITY_ORDER[b.priority] ?? 9;
      if (pa !== pb) return pa - pb;
      const da = a.due_date || "9999-12-31";
      const db = b.due_date || "9999-12-31";
      return da.localeCompare(db);
    });

    const html = buildEmailHtml({
      recipientName: member.name,
      bizName,
      tasks: list,
      projectNames,
      siteUrl,
    });
    const subject = `Your open tasks (${list.length}) — ${bizName}`;

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${bizName} <notifications@relicbuilt.com>`,
        to: [member.email],
        subject,
        html,
      }),
    });
    sendResults.push({ assignee: member.name, email: member.email, status: r.status });
  }

  return { ok: true, totalAssignees: grouped.size, sent: sendResults.filter((r) => r.status !== "skipped").length, results: sendResults };
}

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  const result = await runDigest();
  const status = result.ok ? 200 : 500;
  return NextResponse.json(result, { status });
}
