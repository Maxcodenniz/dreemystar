import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
};

/** Canonical contract terms for record keeping (stored with each signature). */
const CONTRACT_TERMS_SNAPSHOT =
  'As an artist on Dreemystar, you will earn 50% of the total amount from tickets sold for your events, excluding taxes and service fees.';

function getClientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const real = req.headers.get('x-real-ip');
  if (real) return real;
  const cf = req.headers.get('cf-connecting-ip');
  if (cf) return cf;
  return null;
}

function getUserAgent(req: Request): string | null {
  return req.headers.get('user-agent');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    let body: { invite_token?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const inviteToken = typeof body?.invite_token === 'string' ? body.invite_token.trim() : '';
    if (!inviteToken) {
      return new Response(JSON.stringify({ error: 'invite_token is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: app, error: fetchErr } = await supabase
      .from('artist_applications')
      .select('id, status, contract_signed_at')
      .eq('invite_token', inviteToken)
      .maybeSingle();

    if (fetchErr || !app) {
      return new Response(JSON.stringify({ error: 'Invalid or expired invite link' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (app.status !== 'qualified') {
      return new Response(JSON.stringify({ error: 'This application is not qualified for artist signup' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (app.contract_signed_at) {
      const siteUrl = Deno.env.get('SITE_URL') || 'https://prodreemystar.netlify.app';
      const signupUrl = `${siteUrl.replace(/\/+$/, '')}/signup?invite=${inviteToken}`;
      return new Response(
        JSON.stringify({ success: true, already_signed: true, signup_url: signupUrl }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const signedAt = new Date().toISOString();
    const clientIp = getClientIp(req);
    const userAgent = getUserAgent(req);

    const { error: updateErr } = await supabase
      .from('artist_applications')
      .update({
        contract_signed_at: signedAt,
        contract_terms_snapshot: CONTRACT_TERMS_SNAPSHOT,
        contract_signed_ip: clientIp ?? undefined,
        contract_signed_user_agent: userAgent ?? undefined,
      })
      .eq('id', app.id);

    if (updateErr) {
      console.error('sign-artist-contract: update error', updateErr);
      return new Response(JSON.stringify({ error: 'Failed to record signature' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const siteUrl = Deno.env.get('SITE_URL') || 'https://prodreemystar.netlify.app';
    const signupUrl = `${siteUrl.replace(/\/+$/, '')}/signup?invite=${inviteToken}`;

    return new Response(
      JSON.stringify({ success: true, signup_url: signupUrl }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('sign-artist-contract error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
