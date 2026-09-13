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
  relic_profile?: RelicProfile | null;
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
  };
}
