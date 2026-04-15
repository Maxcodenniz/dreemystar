import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import {
  fetchDusupayCapabilities,
  fetchPawapayCapabilities,
  parseDusupayQueriesFromEnv,
} from "./fetchProviderCapabilities.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ error: "Server configuration error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const logs: string[] = [];

  const { data: prevRow } = await supabase
    .from("mobile_money_capability_snapshots")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  const prev = prevRow as Record<string, unknown> | null;
  let nextPawapay = (prev?.pawapay as Record<string, string[]>) ?? {};
  let nextDusupay = (prev?.dusupay as Record<string, string[]>) ?? {};
  let nextCodes = (prev?.dusupay_provider_codes as Record<string, Record<string, string>>) ?? {};
  let pawAt: string | null = (prev?.pawapay_fetched_at as string | null) ?? null;
  let dusAt: string | null = (prev?.dusupay_fetched_at as string | null) ?? null;
  const errors: string[] = [];

  const pawToken = Deno.env.get("PAWAPAY_API_TOKEN")?.trim();
  const pawBase = (Deno.env.get("PAWAPAY_BASE_URL") || "https://api.sandbox.pawapay.io").replace(/\/+$/, "");
  if (pawToken) {
    const r = await fetchPawapayCapabilities({ baseUrl: pawBase, apiToken: pawToken });
    if (r.error) {
      logs.push(`[refresh] PawaPay fetch failed: ${r.error}`);
      errors.push(r.error);
    } else if (Object.keys(r.map).length > 0) {
      nextPawapay = r.map;
      pawAt = new Date().toISOString();
      logs.push(`[refresh] PawaPay OK: ${Object.keys(r.map).length} countries`);
    } else {
      logs.push("[refresh] PawaPay returned empty map; keeping previous snapshot");
    }
  } else {
    logs.push("[refresh] PAWAPAY_API_TOKEN missing; skipping PawaPay fetch");
  }

  const dusKey = Deno.env.get("DUSUPAY_PUBLIC_KEY")?.trim();
  const dusBase = (Deno.env.get("DUSUPAY_API_BASE") || "https://sandboxapi.dusupay.com").replace(/\/+$/, "");
  if (dusKey) {
    const queries = parseDusupayQueriesFromEnv(Deno.env.get("DUSUPAY_CAPABILITY_QUERIES"));
    const r = await fetchDusupayCapabilities({ apiBase: dusBase, publicKey: dusKey, queries });
    if (r.error) {
      logs.push(`[refresh] DusuPay fetch failed: ${r.error}`);
      errors.push(r.error);
    } else if (Object.keys(r.map).length > 0) {
      nextDusupay = r.map;
      nextCodes = r.providerCodes;
      dusAt = new Date().toISOString();
      logs.push(`[refresh] DusuPay OK: ${Object.keys(r.map).length} countries`);
    } else {
      logs.push("[refresh] DusuPay returned empty map; keeping previous snapshot");
    }
  } else {
    logs.push("[refresh] DUSUPAY_PUBLIC_KEY missing; skipping DusuPay fetch");
  }

  const { error: upErr } = await supabase.from("mobile_money_capability_snapshots").upsert({
    id: 1,
    pawapay: nextPawapay,
    dusupay: nextDusupay,
    dusupay_provider_codes: nextCodes,
    pawapay_fetched_at: pawAt,
    dusupay_fetched_at: dusAt,
    last_refresh_error: errors.length ? errors.join(" | ") : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });

  if (upErr) {
    logs.push(`[refresh] DB upsert failed: ${upErr.message}`);
    return new Response(JSON.stringify({ ok: false, logs, error: upErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  for (const line of logs) console.warn(line);

  return new Response(JSON.stringify({ ok: true, logs, errors }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
