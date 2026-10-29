import { BusinessEntity, RelicProfile, BrandingConfig, LogoPlacement } from "@/types/axiom";

/**
 * Resolved business identity for a given entity, used by document templates
 * (invoice/PO/proposal) and outbound email. Wallflower RELIC's values come
 * from the settings biz_* fields (with the historic hardcoded logo/website/
 * footer as defaults); Relic's come from settings.relic_profile.
 */
export interface EntityProfile {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  website?: string;
  logoUrl?: string;   // empty → templates fall back to the name as text
  appLogoUrl?: string; // sidebar header logo (empty → sidebar emblem fallback)
  footer: string;
  fromName: string;
  fromEmail: string;
  accent: string;     // medium brand color (labels, borders, buttons, gold for Relic)
  onAccent: string;   // legible text color on an accent-filled button/surface
  accentDark: string; // dark bar/button bg with legible light text on it
  invoiceBarBg: string;   // invoice "Items" bar background
  invoiceBarText: string; // legible text color on invoiceBarBg
  branding?: BrandingConfig; // logo library + per-placement assignments
}

// Placements a logo can be assigned to. Keep in sync with LogoPlacement.
export const LOGO_PLACEMENTS: { key: LogoPlacement; label: string; defaultWidth: number }[] = [
  { key: "po", label: "Purchase Orders", defaultWidth: 180 },
  { key: "invoice", label: "Invoices", defaultWidth: 150 },
  { key: "proposal", label: "Proposals", defaultWidth: 220 },
  { key: "email", label: "Email", defaultWidth: 150 },
];

/**
 * Resolve the logo for one placement from an entity's branding: the assigned
 * library logo at its chosen width, falling back to the entity's single
 * `logoUrl`. `width` is undefined when no assignment sets one, so each template
 * can apply its own default (and height-based templates keep their look).
 */
export function logoForPlacement(
  profile: EntityProfile | undefined,
  placement: LogoPlacement
): { url: string; width?: number } {
  const b = profile?.branding;
  const assign = b?.assignments?.[placement];
  const chosen = assign?.logo_id
    ? (b?.logos || []).find((l) => l.id === assign.logo_id)
    : undefined;
  return {
    url: chosen?.url || profile?.logoUrl || "",
    width: assign?.width,
  };
}

// Only the settings fields the resolver needs.
interface SettingsLike {
  biz_name?: string;
  biz_email?: string;
  biz_phone?: string;
  biz_address?: string;
  biz_city?: string;
  biz_state?: string;
  biz_zip?: string;
  biz_website?: string;
  accent_color?: string;
  logo_url?: string;
  terms_text?: string;
  deposit_percent?: number;
  app_logo_url?: string;
  branding?: BrandingConfig | null;
  relic_profile?: RelicProfile | null;
}

// The `biz` shape the proposal/estimate-proposal templates accept, carrying
// optional entity branding overrides (logo/footer/website).
export interface ProposalBizInfo {
  biz_name?: string;
  biz_address?: string;
  biz_city?: string;
  biz_state?: string;
  biz_zip?: string;
  biz_phone?: string;
  biz_email?: string;
  terms_text?: string;
  deposit_percent?: number;
  logo_url?: string;
  logo_width?: number;
  website?: string;
  footer?: string;
  accent?: string;
  accent_dark?: string;
}

// Last-resort sender if an entity has no domain configured. relicbuilt.com is
// always a verified Resend domain.
const DEFAULT_FROM_EMAIL = "notifications@relicbuilt.com";

// Every entity sends from its OWN domain: the mailbox we've always used
// (`notifications@`) on the company's own domain, so a Wallflower email comes
// from wallflower-relic.com and a Relic email from relicbuilt.com. The domain
// is pulled from the entity's configured email/website. This requires the
// domain to be verified in Resend (Wallflower + Relic both are); an unverified
// domain would bounce, so callers fall back to DEFAULT_FROM_EMAIL when the
// source is empty. Forward-compatible with Relicon tenants on their own domain.
function notificationsAddressFor(...sources: (string | undefined)[]): string | undefined {
  for (const src of sources) {
    if (!src) continue;
    const domain = (src.includes("@") ? src.split("@")[1] : src)
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/.*$/, "")
      .trim()
      .toLowerCase();
    if (domain) return `notifications@${domain}`;
  }
  return undefined;
}

export function resolveEntityProfile(
  entity: BusinessEntity | undefined,
  settings: SettingsLike | null | undefined
): EntityProfile {
  const s = settings || {};

  if (entity === "relic") {
    const rp = s.relic_profile || {};
    const name = rp.name || "RELIC";
    const footer =
      rp.footer ||
      [name, rp.phone, rp.website].filter(Boolean).join("  ·  ");
    return {
      name,
      email: rp.email,
      phone: rp.phone,
      address: rp.address,
      city: rp.city,
      state: rp.state,
      zip: rp.zip,
      website: rp.website || "",
      logoUrl: rp.logo_url || "",
      appLogoUrl: rp.app_logo_url || "",
      footer,
      fromName: rp.from_name || name,
      // Relic's own domain (relicbuilt.com): an explicit from_email wins, else
      // notifications@ on the domain from its email/website.
      fromEmail:
        rp.from_email ||
        notificationsAddressFor(rp.email, rp.website) ||
        DEFAULT_FROM_EMAIL,
      accent: rp.accent_color || "#b8963c",   // RELIC gold
      onAccent: "#1a1a1a",                      // dark text, legible on gold
      accentDark: "#1a1a1a",                    // near-black bars, matches the logo
      invoiceBarBg: rp.accent_color || "#b8963c", // gold Items bar
      invoiceBarText: "#1a1a1a",                  // dark text, legible on gold
      branding: rp.branding,
    };
  }

  // Wallflower RELIC (default)
  const name = s.biz_name || "Wallflower RELIC";
  return {
    name,
    email: s.biz_email,
    phone: s.biz_phone,
    address: s.biz_address,
    city: s.biz_city,
    state: s.biz_state,
    zip: s.biz_zip,
    website: s.biz_website || "wallflower-relic.com",
    logoUrl: s.logo_url || "https://axiom.relicbuilt.com/wr-logo-black.png",
    appLogoUrl: s.app_logo_url || "",
    footer: "Wallflower RELIC  ·  (402) 235-8179  ·  wallflower-relic.com",
    fromName: "Wallflower RELIC",
    // Wallflower's own domain (wallflower-relic.com): notifications@ on the
    // domain from its business email/website.
    fromEmail:
      notificationsAddressFor(s.biz_email, s.biz_website) || DEFAULT_FROM_EMAIL,
    accent: s.accent_color || "#5b642e",     // Wallflower default olive, now settings-driven
    onAccent: "#ffffff",   // white text on olive (unchanged)
    accentDark: "#454d23",
    invoiceBarBg: "#454d23",   // dark olive Items bar (unchanged)
    invoiceBarText: "#ffffff", // white text (unchanged)
    branding: s.branding || undefined,
  };
}

/**
 * Build the `biz` object the proposal templates consume for a given entity.
 * Wallflower keeps the templates' historic defaults (no logo/footer/website
 * overrides, so its proposal wording is unchanged); Relic supplies its own
 * identity and branding.
 */
export function proposalBiz(
  entity: BusinessEntity | undefined,
  settings: SettingsLike | null | undefined
): ProposalBizInfo {
  const s = settings || {};
  const base: ProposalBizInfo = {
    biz_name: s.biz_name,
    biz_address: s.biz_address,
    biz_city: s.biz_city,
    biz_state: s.biz_state,
    biz_zip: s.biz_zip,
    biz_phone: s.biz_phone,
    biz_email: s.biz_email,
    terms_text: s.terms_text,
    deposit_percent: s.deposit_percent,
  };
  // The proposal logo assignment (library logo + width) applies to both
  // entities. For Wallflower we only override the logo URL when a logo is
  // explicitly assigned, so an unconfigured proposal keeps its historic logo.
  const pForLogo = resolveEntityProfile(entity, settings);
  const proposalAssign = pForLogo.branding?.assignments?.proposal;
  const assignedLogoUrl = proposalAssign?.logo_id
    ? (pForLogo.branding?.logos || []).find((l) => l.id === proposalAssign.logo_id)?.url
    : undefined;

  if (entity !== "relic") {
    // Wallflower: template defaults apply, plus any proposal logo/size override.
    return { ...base, logo_url: assignedLogoUrl, logo_width: proposalAssign?.width };
  }
  const p = resolveEntityProfile("relic", settings);
  return {
    biz_name: p.name,
    biz_address: p.address,
    biz_city: p.city,
    biz_state: p.state,
    biz_zip: p.zip,
    biz_phone: p.phone,
    biz_email: p.email,
    // Relic's own terms take precedence; fall back to the shared settings terms.
    terms_text: (s.relic_profile?.terms) || s.terms_text,
    deposit_percent: s.deposit_percent,
    logo_url: assignedLogoUrl || p.logoUrl,
    logo_width: proposalAssign?.width,
    footer: p.footer,
    website: p.website,
    accent: p.accent,
    accent_dark: p.accentDark,
  };
}
