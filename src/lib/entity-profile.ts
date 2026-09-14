import { BusinessEntity, RelicProfile } from "@/types/axiom";

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
  footer: string;
  fromName: string;
  fromEmail: string;
  accent: string;     // medium brand color (labels, borders, gold for Relic)
  accentDark: string; // dark bar/button bg with legible light text on it
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
  terms_text?: string;
  deposit_percent?: number;
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
  website?: string;
  footer?: string;
  accent?: string;
  accent_dark?: string;
}

// Shared transactional sender (relicbuilt.com is the verified Resend domain).
// A Relic-specific from_email only works once its domain is verified in Resend.
const DEFAULT_FROM_EMAIL = "notifications@relicbuilt.com";

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
      footer,
      fromName: rp.from_name || name,
      fromEmail: rp.from_email || DEFAULT_FROM_EMAIL,
      accent: rp.accent_color || "#b8963c",   // RELIC gold
      accentDark: "#1a1a1a",                    // near-black bars, matches the logo
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
    website: "wallflower-relic.com",
    logoUrl: "https://relicbuilt.com/wr-logo-black.png",
    footer: "Wallflower RELIC  ·  (402) 235-8179  ·  wallflower-relic.com",
    fromName: "Wallflower RELIC",
    fromEmail: DEFAULT_FROM_EMAIL,
    accent: "#5b642e",     // Wallflower olive (unchanged)
    accentDark: "#454d23",
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
  if (entity !== "relic") return base; // Wallflower: template defaults apply
  const p = resolveEntityProfile("relic", settings);
  return {
    biz_name: p.name,
    biz_address: p.address,
    biz_city: p.city,
    biz_state: p.state,
    biz_zip: p.zip,
    biz_phone: p.phone,
    biz_email: p.email,
    terms_text: s.terms_text,
    deposit_percent: s.deposit_percent,
    logo_url: p.logoUrl,
    footer: p.footer,
    website: p.website,
    accent: p.accent,
    accent_dark: p.accentDark,
  };
}
