import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep @sparticuz/chromium out of the serverless bundle — Next's
  // bundler tree-shakes the binary files otherwise, and Puppeteer
  // can't find Chromium at runtime on Vercel. puppeteer-core has
  // optional native deps that don't need to be webpacked either.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
};

export default nextConfig;
