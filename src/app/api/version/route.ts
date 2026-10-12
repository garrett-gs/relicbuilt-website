// Deploy-version probe for the in-app "update available" banner.
//
// The client (src/components/axiom/UpdateBanner.tsx) snapshots whatever this
// returns on first load, then polls it. When the value changes, a newer deploy
// is live and the banner offers a hard reload. The value just has to be stable
// across all function instances of one deploy and change on the next — Vercel's
// per-commit SHA is exactly that (this app auto-deploys on every push to main),
// with the deployment id as a fallback and "dev" locally (banner never fires).
//
// force-dynamic + no-store so neither Vercel's CDN nor the browser can hand back
// a stale version string; the client also cache-busts the request itself.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const VERSION =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.VERCEL_DEPLOYMENT_ID ||
  "dev";

export async function GET() {
  return NextResponse.json(
    { version: VERSION },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}
