import type { SupabaseClient } from "@supabase/supabase-js";
import { renderHtmlToPdf } from "@/lib/render-pdf";
import { generateEstimateProposalHtml } from "@/lib/proposal-html";
import { proposalBiz } from "@/lib/entity-profile";
import type { Estimate, Settings, InternalClientProfile, BusinessEntity } from "@/types/axiom";

/**
 * Render an internal build's client-facing proposal as a print-ready PDF,
 * BRANDED as the internal client (their name + logo) — Relic stays back-of-
 * house — and upload it to the public `portal-images` bucket. Returns a stable,
 * non-expiring public link (or null on any failure).
 *
 * Best-effort: never throws. A render/upload failure must not break "Send to
 * Nexus"; the caller simply skips the document push.
 */
export async function generateInternalBuildDoc(args: {
  supabase: SupabaseClient;
  estimate: Estimate;
  settings: Settings | null;
  internal: InternalClientProfile;
  totals: { materialTotal: number; laborTotal: number; markupAmount: number; total: number };
  clientCompany?: string;
  clientAddress?: string;
}): Promise<{ name: string; url: string } | null> {
  try {
    // Start from the normal proposal branding (terms, deposit, structure) and
    // re-brand the visible identity as the internal client so the END customer
    // sees their name + logo, not Relic's.
    const base = proposalBiz(args.estimate.entity as BusinessEntity, args.settings);
    const biz = {
      ...base,
      biz_name: args.internal.name || base.biz_name,
      logo_url: args.internal.logo_url || base.logo_url,
      // A freshly uploaded internal logo has no assigned width; let the template
      // use its default rather than Relic's assigned proposal-logo width.
      logo_width: args.internal.logo_url ? undefined : base.logo_width,
    };

    const html = generateEstimateProposalHtml({
      estimate: args.estimate,
      biz,
      totals: args.totals,
      hideAcceptance: true, // a print/record copy, not a sign-off surface
      clientCompany: args.clientCompany,
      clientAddress: args.clientAddress,
    });

    const pdf = await renderHtmlToPdf(html);

    const safeNum = (args.estimate.estimate_number || args.estimate.id).replace(/[^A-Za-z0-9._-]/g, "_");
    const path = `internal-build-docs/${args.estimate.id}/${Date.now()}-${safeNum}.pdf`;
    const { error } = await args.supabase.storage
      .from("portal-images")
      .upload(path, pdf, { contentType: "application/pdf", upsert: false });
    if (error) {
      console.error("[internal-build-doc] upload failed:", error.message);
      return null;
    }
    const { data: pub } = args.supabase.storage.from("portal-images").getPublicUrl(path);
    const label = `${args.internal.name || "Build"} — ${args.estimate.estimate_number || "Proposal"}`;
    return { name: `${label}.pdf`, url: pub.publicUrl };
  } catch (e) {
    console.error("[internal-build-doc] render failed:", e);
    return null;
  }
}
