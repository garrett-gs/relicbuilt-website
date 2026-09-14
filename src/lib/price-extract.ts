/**
 * Pull product name + price from a public product URL.
 *
 * Strategy, most reliable first:
 *   1. JSON-LD Product schema (schema.org) embedded in the page.
 *   2. Common price meta tags (product:price:amount, og:price:amount, itemprop).
 *   3. AI extraction from the page text (only if a price wasn't found above).
 *
 * Only public pages work — anything behind a login is invisible to a fetch.
 * The outbound fetch carries a generic browser UA and NOTHING about the user.
 */

export interface ExtractedProduct {
  name?: string;
  price?: number;
  currency?: string;
  sku?: string;
  unit?: string;
  url: string;
  method: "structured-data" | "meta-tag" | "ai" | "none";
}

export type ExtractResult =
  | { ok: true; product: ExtractedProduct }
  | { ok: false; error: string };

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// Reject non-http(s) and obvious internal/private hosts to avoid SSRF.
function validateUrl(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const h = u.hostname.toLowerCase();
  if (
    h === "localhost" ||
    h === "0.0.0.0" ||
    h === "::1" ||
    /^127\./.test(h) ||
    /^10\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^169\.254\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(h) ||
    h.endsWith(".local") ||
    h.endsWith(".internal")
  ) {
    return null;
  }
  return u;
}

function parsePrice(v: unknown): number | undefined {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^0-9.]/g, ""));
    if (isFinite(n) && n > 0) return n;
  }
  return undefined;
}

// Walk arbitrary JSON-LD looking for a Product with an offer price.
function fromJsonLd(html: string): ExtractedProduct | null {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const candidates: Record<string, unknown>[] = [];
  for (const b of blocks) {
    try {
      const parsed = JSON.parse(b[1].trim());
      const arr = Array.isArray(parsed) ? parsed : parsed["@graph"] ? parsed["@graph"] : [parsed];
      for (const node of arr) if (node && typeof node === "object") candidates.push(node as Record<string, unknown>);
    } catch {
      /* skip malformed block */
    }
  }
  for (const node of candidates) {
    const type = node["@type"];
    const isProduct = type === "Product" || (Array.isArray(type) && type.includes("Product"));
    if (!isProduct) continue;
    const offersRaw = node.offers as Record<string, unknown> | Record<string, unknown>[] | undefined;
    const offer = Array.isArray(offersRaw) ? offersRaw[0] : offersRaw;
    const price = offer ? parsePrice(offer.price ?? offer.lowPrice) : undefined;
    if (price === undefined) continue;
    return {
      name: typeof node.name === "string" ? node.name : undefined,
      price,
      currency: offer && typeof offer.priceCurrency === "string" ? offer.priceCurrency : "USD",
      sku: typeof node.sku === "string" ? node.sku : typeof node.mpn === "string" ? node.mpn : undefined,
      url: "",
      method: "structured-data",
    };
  }
  return null;
}

function metaContent(html: string, keys: string[]): string | undefined {
  for (const k of keys) {
    const re = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${k}["'][^>]*content=["']([^"']+)["']`, "i");
    const m = html.match(re);
    if (m) return m[1];
  }
  return undefined;
}

function fromMeta(html: string): ExtractedProduct | null {
  const priceStr = metaContent(html, ["product:price:amount", "og:price:amount", "price", "twitter:data1"]);
  const price = parsePrice(priceStr);
  if (price === undefined) return null;
  const name =
    metaContent(html, ["og:title", "twitter:title"]) ||
    (html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim());
  return {
    name,
    price,
    currency: metaContent(html, ["product:price:currency", "og:price:currency"]) || "USD",
    url: "",
    method: "meta-tag",
  };
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fromAi(html: string, url: string): Promise<ExtractedProduct | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const text = htmlToText(html).slice(0, 8000);
  const title = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() || "";
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content:
              `Extract the single main product's details from this page. Respond with ONLY a JSON object ` +
              `{"name": string, "price": number (USD, no symbol), "sku": string|null, "unit": string|null}. ` +
              `If there is no clear price, use null for price.\n\nPage title: ${title}\n\nPage text:\n${text}`,
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const raw = (data.content?.[0]?.text || "").match(/\{[\s\S]*\}/)?.[0];
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const price = parsePrice(parsed.price);
    if (price === undefined) return null;
    return {
      name: typeof parsed.name === "string" ? parsed.name : undefined,
      price,
      currency: "USD",
      sku: typeof parsed.sku === "string" ? parsed.sku : undefined,
      unit: typeof parsed.unit === "string" ? parsed.unit : undefined,
      url,
      method: "ai",
    };
  } catch {
    return null;
  }
}

export async function extractProductFromUrl(rawUrl: string): Promise<ExtractResult> {
  const u = validateUrl((rawUrl || "").trim());
  if (!u) return { ok: false, error: "Enter a valid public http(s) product URL." };

  let html: string;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(u.toString(), {
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);
    if (!res.ok) return { ok: false, error: `The site returned ${res.status}. It may block automated requests.` };
    html = (await res.text()).slice(0, 2_000_000);
  } catch {
    return { ok: false, error: "Couldn't reach that page (timeout or blocked)." };
  }

  const found = fromJsonLd(html) || fromMeta(html) || (await fromAi(html, u.toString()));
  if (!found || found.price === undefined) {
    return { ok: false, error: "Couldn't find a price on that page. It may be behind a login or rendered by scripts." };
  }
  found.url = u.toString();
  if (!found.unit) found.unit = "ea";
  return { ok: true, product: found };
}
