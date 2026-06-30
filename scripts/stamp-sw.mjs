// Stamps a unique BUILD_VERSION into public/sw.js so each production deploy
// ships a byte-different service worker. That's what lets the browser notice a
// new version and auto-update the installed PWA (see PwaRegistrar).
//
// Runs as the `prebuild` step. Only stamps in CI/Vercel builds — local builds
// are left untouched so the working tree stays clean (the service worker isn't
// even registered on localhost).

import { readFileSync, writeFileSync } from "node:fs";

const SW_PATH = "public/sw.js";

const isCI = process.env.VERCEL || process.env.CI || process.env.GITHUB_ACTIONS;
if (!isCI) {
  console.log("[stamp-sw] local build — leaving sw.js unchanged");
  process.exit(0);
}

const version =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  String(Date.now());

const sw = readFileSync(SW_PATH, "utf8");
const stamped = sw.replace(
  /const BUILD_VERSION = "[^"]*";/,
  `const BUILD_VERSION = "${version}";`,
);

if (stamped === sw) {
  console.warn("[stamp-sw] BUILD_VERSION marker not found — sw.js unchanged");
} else {
  writeFileSync(SW_PATH, stamped);
  console.log(`[stamp-sw] BUILD_VERSION = ${version}`);
}
