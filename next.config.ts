import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep @sparticuz/chromium out of the serverless bundle — Next's
  // bundler tree-shakes the binary files otherwise, and Puppeteer
  // can't find Chromium at runtime on Vercel. puppeteer-core has
  // optional native deps that don't need to be webpacked either.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  // serverExternalPackages alone isn't enough — Next's file tracer also
  // has to be told to include the chromium binary tarballs in each PDF
  // route's deployment bundle, otherwise /var/task/node_modules/@sparticuz/
  // chromium/bin is empty at runtime and Chromium fails to launch with
  // "input directory does not exist". List every route that calls
  // renderHtmlToPdf so each function gets its own copy of the binary.
  outputFileTracingIncludes: {
    "/api/send-proposal-email": ["./node_modules/@sparticuz/chromium/bin/**/*"],
    "/api/approve-estimate-proposal": ["./node_modules/@sparticuz/chromium/bin/**/*"],
    "/api/audit-trail/[estimate_id]": ["./node_modules/@sparticuz/chromium/bin/**/*"],
  },
  // /axiom/parts moved to /axiom/parts-studio when the tool got its own
  // top-level nav section. Redirect old bookmarks so nobody hits a 404.
  async redirects() {
    const redirects: {
      source: string;
      destination: string;
      permanent: boolean;
      has?: { type: "host"; value: string }[];
    }[] = [
      {
        source: "/axiom/parts",
        destination: "/axiom/parts-studio",
        permanent: true,
      },
    ];

    // The public marketing pages that should hand off to the Axiom dashboard.
    // Every other route (/build, /proposal, /approve, /pay, /client, /api, …)
    // must keep working, so it is deliberately not listed here.
    const marketingRoutes = ["/", "/about", "/shop", "/contact", "/work"];

    // Wallflower site (axiom.wallflower-relic.com): the whole deployment is
    // locked to Wallflower, so the marketing pages (which belong to
    // relicbuilt.com) redirect to the dashboard. Temporary (307) so the method
    // is preserved and nothing is cached. Entity-gated, so RELIC / local dev
    // (where the var is unset) are never affected.
    if (process.env.NEXT_PUBLIC_AXIOM_ENTITY === "wallflower_relic") {
      for (const source of marketingRoutes) {
        redirects.push({ source, destination: "/axiom/dashboard", permanent: false });
      }
    }

    // RELIC site: axiom.relicbuilt.com is the Axiom entry point, but it shares
    // the RELIC deployment with the relicbuilt.com marketing site — so this is
    // host-gated, not entity-gated: only requests arriving on axiom.relicbuilt.com
    // redirect to the dashboard; relicbuilt.com keeps serving marketing. Inert
    // on the Wallflower deployment and local dev, where that host never occurs.
    for (const source of marketingRoutes) {
      redirects.push({
        source,
        has: [{ type: "host", value: "axiom.relicbuilt.com" }],
        destination: "/axiom/dashboard",
        permanent: false,
      });
    }

    return redirects;
  },
};

export default nextConfig;
