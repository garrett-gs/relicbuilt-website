import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveEntityProfile } from "@/lib/entity-profile";
import { logProposalEvent, ipFromHeaders } from "@/lib/audit";
import { notifyWallflowerStatus } from "@/lib/wallflower-status";
import { notifyNexusApproval } from "@/lib/notify-nexus-approval";
import { notifyNexusBuildLink } from "@/lib/notify-nexus-build-link";
import type { Estimate } from "@/types/axiom";

export const runtime = "nodejs";
export const maxDuration = 60;

function money(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);
}

interface LineItem { quantity?: number; unit_price?: number }
interface LaborItem { cost?: number }
function calcTotal(est: { line_items?: LineItem[]; labor_items?: LaborItem[]; markup_percent?: number; adjustment?: number }) {
  const mat = (est.line_items || []).reduce((s, li) => s + (li.quantity || 0) * (li.unit_price || 0), 0);
  const lab = (est.labor_items || []).reduce((s, li) => s + (li.cost || 0), 0);
  const subtotal = mat + lab;
  const markup = subtotal * ((est.markup_percent || 0) / 100);
  return Math.round((subtotal + markup + (est.adjustment || 0)) * 100) / 100;
}

/**
 * One signature approves every build grouped under a master project. Each build
 * is marked approved and spun up as its own Axiom project (status "accepted",
 * so they land in the pipeline). For RELIC builds we also create a single
 * combined deposit invoice for the grand total and route the client to pay it.
 * Wallflower builds are invoiced/paid in Nexus.
 */
export async function POST(req: NextRequest) {
  try {
    const { token, signatureName } = await req.json();
    if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });
    if (!signatureName || typeof signatureName !== "string" || signatureName.trim().length < 2) {
      return NextResponse.json({ error: "Please enter your name to sign." }, { status: 400 });
    }
    const signed = signatureName.trim();

    const supabase = createClient(
      process.env.NEXT_PUBLIC_AXIOM_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_AXIOM_SUPABASE_ANON_KEY!
    );

    const { data: master, error: mErr } = await supabase
      .from("master_projects")
      .select("*")
      .eq("proposal_token", token)
      .single();
    if (mErr || !master) {
      return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
    }

    const { data: estimatesRaw } = await supabase
      .from("estimates")
      .select("*")
      .eq("master_project_id", master.id)
      .order("created_at", { ascending: true });
    const builds = (estimatesRaw || []) as Estimate[];
    if (builds.length === 0) {
      return NextResponse.json({ error: "No builds are linked to this proposal." }, { status: 400 });
    }

    // Already approved? — idempotent, route to an unpaid combined deposit if one exists.
    if (master.proposal_status === "approved") {
      let payUrl: string | null = null;
      const cwIds = builds.map((b) => b.custom_work_id).filter(Boolean) as string[];
      if (cwIds.length > 0) {
        const { data: dep } = await supabase
          .from("invoices")
          .select("id,status")
          .in("custom_work_id", cwIds)
          .eq("invoice_type", "deposit")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (dep?.id && dep.status !== "paid") payUrl = `/pay/${dep.id}`;
      }
      return NextResponse.json({ already_approved: true, project_name: master.name, pay_url: payUrl });
    }

    // Expiration
    if (master.proposal_expires_at && Date.now() > new Date(master.proposal_expires_at).getTime()) {
      return NextResponse.json({ error: "This proposal has expired. Please contact us for an updated quote." }, { status: 410 });
    }

    const { data: settings } = await supabase
      .from("settings")
      .select("biz_name,biz_phone,biz_email,biz_address,biz_city,biz_state,biz_zip,deposit_percent,terms_text,team_members,relic_profile")
      .limit(1)
      .single();

    const nowIso = new Date().toISOString();
    const signedDateLong = new Date().toLocaleDateString("en-US", { dateStyle: "long" });

    // ── Approve each build + spin up its project ──────────────────────
    const projectResults: { name: string; projectId: string | null; total: number; entity?: string }[] = [];
    let grandTotal = 0;
    const firstEntity = builds[0]?.entity;

    for (const estimate of builds) {
      const total = calcTotal(estimate);
      grandTotal += total;

      if (estimate.proposal_status !== "approved") {
        await supabase.from("estimates").update({
          proposal_status: "approved",
          proposal_approved_at: nowIso,
          status: "accepted",
          notes: [estimate.notes || "", `Signed by ${signed} on ${signedDateLong} (combined proposal: ${master.name})`].filter(Boolean).join("\n"),
          updated_at: nowIso,
        }).eq("id", estimate.id);

        await notifyWallflowerStatus(supabase, { estimateId: estimate.id }, "accepted");
        await notifyNexusApproval(supabase, estimate, signed, total);
        await notifyNexusBuildLink({
          estimateId: estimate.id,
          estimateNumber: estimate.estimate_number,
          proposalToken: estimate.proposal_token || "",
          event: "approved",
          status: "approved",
          estimateAmount: total,
          approvedAt: nowIso,
          approvedBy: signed,
        });
      }

      // Create the project if one isn't linked yet.
      let projectId: string | null = (estimate.custom_work_id as string | null) ?? null;
      if (!projectId) {
        try {
          const carried = (estimate.images || estimate.proposal_images || []) as string[];
          const { data: proj } = await supabase
            .from("custom_work")
            .insert({
              entity: estimate.entity || "wallflower_relic",
              project_name: estimate.project_name || estimate.estimate_number,
              client_name: estimate.client_name || "",
              client_email: estimate.client_email || null,
              client_phone: estimate.client_phone || null,
              customer_id: estimate.customer_id || null,
              master_project_id: master.id,
              quoted_amount: total,
              project_description: estimate.notes || null,
              inspiration_images: Array.isArray(carried) && carried.length ? carried : undefined,
              start_date: estimate.start_date || null,
              due_date: estimate.due_date || null,
              status: "accepted",
            })
            .select("id")
            .single();
          if (proj?.id) {
            projectId = proj.id;
            await supabase.from("estimates").update({ custom_work_id: proj.id }).eq("id", estimate.id);
          }
        } catch (e) {
          console.error("[approve-master] create project failed:", e);
        }
      }
      projectResults.push({ name: estimate.project_name || estimate.estimate_number, projectId, total, entity: estimate.entity });
    }

    // ── Relic: one combined deposit invoice for the grand total ───────
    // Wallflower builds are paid in Nexus — no invoice here.
    let payUrl: string | null = null;
    const relicBuilds = projectResults.filter((p) => p.entity === "relic");
    if (relicBuilds.length > 0) {
      try {
        const relicTotal = relicBuilds.reduce((s, p) => s + p.total, 0);
        const depPct = Number(builds.find((b) => b.entity === "relic")?.deposit_percent ?? settings?.deposit_percent ?? 50);
        const depositAmount = Math.round(relicTotal * (depPct / 100) * 100) / 100;
        const invNum = `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
        const anchorProject = relicBuilds.find((p) => p.projectId)?.projectId || null;
        const anchorEstimateId = builds.find((b) => b.entity === "relic")?.id || null;
        const { data: inv } = await supabase
          .from("invoices")
          .insert({
            entity: "relic",
            invoice_number: invNum,
            invoice_type: "deposit",
            custom_work_id: anchorProject,
            estimate_id: anchorEstimateId,
            client_name: builds.find((b) => b.client_name)?.client_name || "",
            client_email: builds.find((b) => b.client_email)?.client_email || null,
            client_phone: builds.find((b) => b.client_phone)?.client_phone || null,
            description: `Deposit (${depPct}%) — ${master.name}`,
            subtotal: depositAmount,
            delivery_fee: 0,
            discount: 0,
            tax_rate: 0,
            line_items: relicBuilds.map((p) => ({
              item_number: "",
              description: `Deposit — ${depPct}% of ${p.name} (${money(p.total)})`,
              quantity: 1,
              unit_price: Math.round(p.total * (depPct / 100) * 100) / 100,
              unit: "ea",
            })),
            status: "unpaid",
            issued_date: nowIso.split("T")[0],
            notes: `Combined deposit — ${depPct}% across ${relicBuilds.length} ${relicBuilds.length === 1 ? "build" : "builds"} under ${master.name}. Balance ${100 - depPct}% due on completion.`,
            payments: [],
          })
          .select("id")
          .single();
        if (inv?.id) payUrl = `/pay/${inv.id}`;
      } catch (e) {
        console.error("[approve-master] combined deposit invoice failed:", e);
      }
    }

    // ── Mark the master proposal approved ─────────────────────────────
    await supabase.from("master_projects").update({
      proposal_status: "approved",
      proposal_approved_at: nowIso,
      proposal_signed_by: signed,
      updated_at: nowIso,
    }).eq("id", master.id);

    // ── Internal notification: tell the team the client signed ────────
    try {
      const resendKey = process.env.RESEND_API_KEY;
      if (resendKey) {
        const teamMembers = (settings?.team_members || []) as Array<{ email?: string; notifications?: { portal_updates?: boolean } }>;
        const recipients = new Set<string>();
        if (settings?.biz_email) recipients.add(settings.biz_email.trim());
        for (const m of teamMembers) if (m.notifications?.portal_updates && m.email) recipients.add(m.email.trim());
        if (recipients.size === 0) recipients.add("garrett@relicbuilt.com");

        const origin = req.headers.get("origin") || `https://${req.headers.get("host") || "relicbuilt.com"}`;
        const acceptedAt = new Date().toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" });
        const profile = resolveEntityProfile(firstEntity, settings);
        const logo = profile.logoUrl || "https://relicbuilt.com/wr-logo-black.png";
        const rows = projectResults.map((p) => `<tr><td style="padding:6px 0;color:#444;">${esc(p.name)}</td><td style="padding:6px 0;text-align:right;font-family:monospace;">${money(p.total)}</td></tr>`).join("");

        const internalHtml = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#111;background:#fff;">
  <div style="padding:18px 28px;border-bottom:3px solid ${profile.accent};"><img src="${logo}" alt="${esc(profile.name)}" style="width:240px;max-width:60%;height:auto;display:block;" /></div>
  <div style="padding:28px;">
    <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:0.14em;color:#888;">Combined Proposal Approved</p>
    <h2 style="margin:0 0 18px;font-size:20px;color:#111;">${esc(master.name)}</h2>
    <table style="width:100%;font-size:14px;border-collapse:collapse;margin-bottom:12px;">
      <tr><td style="padding:6px 0;color:#666;">Signed by:</td><td style="padding:6px 0;text-align:right;font-weight:600;">${esc(signed)}</td></tr>
      <tr><td style="padding:6px 0;color:#666;">Signed at:</td><td style="padding:6px 0;text-align:right;">${esc(acceptedAt)}</td></tr>
    </table>
    <table style="width:100%;font-size:14px;border-collapse:collapse;margin-bottom:8px;border-top:1px solid #eee;">
      ${rows}
      <tr><td style="padding:10px 0 0;font-weight:bold;border-top:1px solid #eee;">Grand total</td><td style="padding:10px 0 0;text-align:right;font-weight:bold;font-family:monospace;border-top:1px solid #eee;">${money(grandTotal)}</td></tr>
    </table>
    <p style="margin:16px 0 20px;font-size:13px;color:#555;">${relicBuilds.length > 0 ? "A combined deposit invoice was created — the client was routed to the Stripe pay link." : "Payment is handled in Nexus."} ${projectResults.length} ${projectResults.length === 1 ? "project" : "projects"} landed in the pipeline.</p>
    <a href="${origin}/axiom/projects" style="display:inline-block;background:${profile.accent};color:${profile.onAccent};padding:12px 24px;text-decoration:none;font-weight:bold;letter-spacing:0.06em;font-size:13px;text-transform:uppercase;">Open Projects →</a>
  </div>
</div>`.trim();

        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: `${profile.fromName} <${profile.fromEmail}>`,
            to: Array.from(recipients),
            subject: `Proposal Approved — ${master.name}`,
            html: internalHtml,
            reply_to: builds.find((b) => b.client_email)?.client_email || settings?.biz_email || "garrett@relicbuilt.com",
          }),
        });
      }
    } catch (err) {
      console.error("[approve-master-proposal] internal email failed:", err);
    }

    // Audit: a signed event per build.
    for (const estimate of builds) {
      try {
        await logProposalEvent({
          supabase,
          estimateId: estimate.id,
          eventType: "signed",
          signerName: signed,
          signerEmail: estimate.client_email || null,
          ipAddress: ipFromHeaders(req.headers),
          userAgent: req.headers.get("user-agent") || null,
          metadata: { master_project_id: master.id, master_proposal_token: token, combined: true, grand_total: grandTotal },
        });
      } catch { /* best-effort */ }
    }

    return NextResponse.json({
      success: true,
      project_name: master.name,
      projects: projectResults.map((p) => p.name),
      total_amount: grandTotal,
      biz_name: settings?.biz_name || "RELIC",
      pay_url: payUrl,
    });
  } catch (err) {
    console.error("[approve-master-proposal] error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

function esc(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
