import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { CAPABILITY_TTL_MS } from "../_shared/mobileMoney/types.ts";
import { buildFreshness, rowToCapabilityCache } from "../_shared/mobileMoney/cache.ts";
import type { CapabilitySnapshotRow } from "../_shared/mobileMoney/types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !anonKey) {
      return new Response(JSON.stringify({ error: "Server configuration error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data, error } = await supabase.from("mobile_money_capability_snapshots").select("*").eq("id", 1).maybeSingle();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const row = (data ?? {
      pawapay: {},
      dusupay: {},
      dusupay_provider_codes: {},
      pawapay_fetched_at: null,
      dusupay_fetched_at: null,
    }) as CapabilitySnapshotRow;

    const nowMs = Date.now();
    const freshness = buildFreshness(row, nowMs, CAPABILITY_TTL_MS);
    const cache = rowToCapabilityCache(row);

    const countries = new Set<string>();
    for (const k of Object.keys(cache.pawapay ?? {})) countries.add(k);
    for (const k of Object.keys(cache.dusupay ?? {})) countries.add(k);

    return new Response(
      JSON.stringify({
        pawapay: cache.pawapay ?? {},
        dusupay: cache.dusupay ?? {},
        dusupayProviderCodes: cache.dusupayProviderCodes,
        stale: {
          pawapay: !freshness.pawapayFresh,
          dusupay: !freshness.dusupayFresh,
        },
        fetchedAt: {
          pawapay: row.pawapay_fetched_at,
          dusupay: row.dusupay_fetched_at,
        },
        ttlMs: CAPABILITY_TTL_MS,
        countries: [...countries].sort(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
