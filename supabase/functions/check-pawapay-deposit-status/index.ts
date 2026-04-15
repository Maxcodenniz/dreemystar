import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const apiToken = Deno.env.get("PAWAPAY_API_TOKEN")?.trim();
    const baseUrl = (Deno.env.get("PAWAPAY_BASE_URL") || "https://api.sandbox.pawapay.io").replace(/\/+$/, "");

    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: "Server configuration error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!apiToken) {
      return new Response(JSON.stringify({ error: "PawaPay is not configured." }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const depositId =
      typeof body === "object" && body !== null && "depositId" in body &&
        typeof (body as { depositId?: unknown }).depositId === "string"
        ? (body as { depositId: string }).depositId.trim()
        : "";

    if (!depositId || !UUID_RE.test(depositId)) {
      return new Response(JSON.stringify({ error: "depositId must be a valid UUID" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: row, error: rowErr } = await supabase
      .from("pawapay_payment_intents")
      .select("deposit_id")
      .eq("deposit_id", depositId)
      .maybeSingle();

    if (rowErr || !row) {
      return new Response(JSON.stringify({ error: "Unknown deposit" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // v1: GET /deposits/{depositId} → array of Deposit (empty if not found)
    const pawRes = await fetch(`${baseUrl}/deposits/${encodeURIComponent(depositId)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: "application/json",
      },
    });

    const text = await pawRes.text();
    let out: unknown;
    try {
      out = text ? JSON.parse(text) : {};
    } catch {
      out = {
        status: "INVALID_RESPONSE",
        pawapayHttpStatus: pawRes.status,
        detail: text.slice(0, 500),
      };
    }
    if (typeof out === "object" && out !== null && !(out as Record<string, unknown>).pawapayHttpStatus) {
      (out as Record<string, unknown>).pawapayHttpStatus = pawRes.status;
    }

    // Always 200 so the client can read the body (v1: Deposit[] or ErrorResponse) without invoke treating non-2xx as opaque transport errors.
    return new Response(JSON.stringify(out), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
