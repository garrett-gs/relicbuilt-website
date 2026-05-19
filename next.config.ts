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
};

export default nextConfig;
