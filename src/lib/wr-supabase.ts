import { createClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client for Wallflower RELIC Nexus (VenueOS).
 * Uses the service_role key — only import this in API routes / server code.
 */
export function getWRClient() {
  const url = process.env.WR_SUPABASE_URL;
  const key = process.env.WR_SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error("WR Supabase credentials not configured. Set WR_SUPABASE_URL and WR_SUPABASE_SERVICE_KEY in .env.local");
  }
  return createClient(url, key);
}
