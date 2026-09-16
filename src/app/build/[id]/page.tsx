"use client";

import { useEffect } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";

/**
 * Nexus-facing build-portal entry: /build/<estimate_id>?token=<proposal_token>.
 *
 * This is the canonical URL Axiom hands Nexus (documented in their webhook).
 * It resolves to the live proposal/sign-off portal, keyed by the token (which
 * is the access secret). The estimate id in the path is how Nexus addresses
 * the build; the token is what authorizes viewing/signing.
 */
export default function BuildPortalEntry() {
  const params = useParams<{ id: string }>();
  const sp = useSearchParams();
  const router = useRouter();
  const token = sp.get("token") || "";

  useEffect(() => {
    if (token) router.replace(`/proposal/${encodeURIComponent(token)}`);
  }, [token, router]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f5f5", color: "#666", fontFamily: "Arial,Helvetica,sans-serif" }}>
      {token ? "Opening your build proposal…" : "This build link is missing its access token."}
    </div>
  );
}
