import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { eventId, streamKey } = await req.json();

    if (!eventId || !streamKey) {
      return new Response(
        JSON.stringify({ error: "Missing eventId or streamKey" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, title, stream_key, status")
      .eq("id", eventId)
      .eq("stream_key", streamKey)
      .single();

    if (eventError || !event) {
      return new Response(
        JSON.stringify({ error: "Invalid event ID or stream key" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const RTMP_SERVER =
      Deno.env.get("RTMP_SERVER_URL") || "rtmp://streaming.dreemystar.com:1935/live";

    return new Response(
      JSON.stringify({
        rtmpUrl: RTMP_SERVER,
        streamKey: event.stream_key,
        channelName: `event_${event.id}`,
        obsSettings: {
          server: RTMP_SERVER,
          key: event.stream_key,
          encoder: "x264",
          rateBitrate: 4500,
          resolution: "1920x1080",
          fps: 30,
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
