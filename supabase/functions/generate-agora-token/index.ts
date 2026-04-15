import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { RtcTokenBuilder, RtcRole } from "npm:agora-token@2.0.5";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed. Use POST request." }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json().catch(() => null);
    const channelName = body?.channelName ?? null;
    const role = body?.role ?? "publisher";
    const expireTime = Number(body?.expireTime ?? 3600);
    const uid = body?.uid ?? null;
    const account = body?.account ?? null;

    if (!channelName || typeof channelName !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid parameter: channelName" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // -----------------------------------------------------------------------
    // SECURITY: Verify entitlement before issuing a token.
    //
    // Channel names follow the pattern "event_<uuid>". For audience tokens
    // we verify the caller has a valid ticket (or is an admin). For publisher
    // tokens we verify the caller is the event artist or an admin.
    //
    // This prevents free-riders from guessing channel names and watching
    // without a ticket, and blocks unauthorized publishing.
    // -----------------------------------------------------------------------
    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const eventMatch = channelName.match(/^event_([0-9a-f-]{36})$/i);
    if (eventMatch) {
      const eventId = eventMatch[1];

      // Resolve the calling user from the JWT (if present)
      let callerUserId: string | null = null;
      let callerUserType: string | null = null;
      if (authHeader && authHeader !== `Bearer ${supabaseAnonKey}`) {
        const userClient = createClient(supabaseUrl, supabaseAnonKey, {
          global: { headers: { Authorization: authHeader } },
        });
        const { data: { user } } = await userClient.auth.getUser();
        if (user) {
          callerUserId = user.id;
          const { data: profile } = await supabase
            .from("profiles")
            .select("user_type")
            .eq("id", user.id)
            .single();
          callerUserType = profile?.user_type ?? null;
        }
      }

      const isAdmin = ["super_admin", "global_admin"].includes(callerUserType ?? "");

      if (role === "publisher" || role === "host") {
        // Publisher: must be the event's artist or an admin
        if (!isAdmin) {
          const { data: eventRow } = await supabase
            .from("events")
            .select("artist_id")
            .eq("id", eventId)
            .single();
          if (!eventRow || eventRow.artist_id !== callerUserId) {
            return new Response(
              JSON.stringify({ error: "Not authorized to broadcast on this channel" }),
              { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
        }
      } else {
        // Audience: must have an active ticket, or be an admin/artist-owner
        if (!isAdmin) {
          let hasTicket = false;

          if (callerUserId) {
            const { data: ticket } = await supabase
              .from("tickets")
              .select("id")
              .eq("event_id", eventId)
              .eq("user_id", callerUserId)
              .eq("status", "active")
              .limit(1)
              .maybeSingle();
            if (ticket) hasTicket = true;
          }

          // Also check if the caller is the artist (artists can watch their own stream)
          if (!hasTicket && callerUserId) {
            const { data: eventRow } = await supabase
              .from("events")
              .select("artist_id, price")
              .eq("id", eventId)
              .single();
            if (eventRow?.artist_id === callerUserId) {
              hasTicket = true;
            }
            // Free events (price = 0) don't require a ticket
            if (eventRow && (eventRow.price === 0 || eventRow.price === null)) {
              hasTicket = true;
            }
          }

          // Guest ticket check by email from body (for unauthenticated viewers)
          if (!hasTicket && body?.email) {
            const normalizedEmail = String(body.email).toLowerCase().trim();
            const { data: guestTicket } = await supabase
              .from("tickets")
              .select("id")
              .eq("event_id", eventId)
              .ilike("email", normalizedEmail)
              .eq("status", "active")
              .limit(1)
              .maybeSingle();
            if (guestTicket) hasTicket = true;
          }

          if (!hasTicket) {
            return new Response(
              JSON.stringify({ error: "Valid ticket required to watch this stream" }),
              { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
        }
      }
    }

    // -----------------------------------------------------------------------
    // Token generation (unchanged logic)
    // -----------------------------------------------------------------------
    const AGORA_APP_ID = Deno.env.get("AGORA_APP_ID") || Deno.env.get("VITE_AGORA_APP_ID");
    const AGORA_APP_CERTIFICATE = Deno.env.get("AGORA_APP_CERTIFICATE") || Deno.env.get("VITE_AGORA_APP_CERTIFICATE");

    if (!AGORA_APP_ID || !AGORA_APP_CERTIFICATE) {
      return new Response(
        JSON.stringify({ error: "AGORA_APP_ID or AGORA_APP_CERTIFICATE not set in env" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const agoraRole =
      role === "publisher" || role === "host" ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpireTime = currentTimestamp + Math.max(60, expireTime);

    let token: string;

    if (account && typeof account === "string") {
      token = RtcTokenBuilder.buildTokenWithAccount(
        AGORA_APP_ID, AGORA_APP_CERTIFICATE, channelName, account, agoraRole, privilegeExpireTime,
      );
    } else if (uid !== null && (typeof uid === "number" || !Number.isNaN(Number(uid)))) {
      token = RtcTokenBuilder.buildTokenWithUid(
        AGORA_APP_ID, AGORA_APP_CERTIFICATE, channelName, Number(uid), agoraRole, privilegeExpireTime,
      );
    } else {
      token = RtcTokenBuilder.buildTokenWithUid(
        AGORA_APP_ID, AGORA_APP_CERTIFICATE, channelName, 0, agoraRole, privilegeExpireTime,
      );
    }

    return new Response(
      JSON.stringify({ token, appId: AGORA_APP_ID, ttl: privilegeExpireTime }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("Token generation error:", err);
    return new Response(
      JSON.stringify({ error: String(err?.message ?? err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
