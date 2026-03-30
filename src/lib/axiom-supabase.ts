import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _axiom: SupabaseClient | null = null;

export const axiom: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    if (!_axiom) {
      const url = process.env.NEXT_PUBLIC_AXIOM_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_AXIOM_SUPABASE_ANON_KEY;
      if (!url || !key) {
        throw new Error("Axiom Supabase credentials not configured. Set NEXT_PUBLIC_AXIOM_SUPABASE_URL and NEXT_PUBLIC_AXIOM_SUPABASE_ANON_KEY in .env.local");
      }
      _axiom = createClient(url, key);
    }
    return (_axiom as unknown as Record<string | symbol, unknown>)[prop];
  },
});
