import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import bcrypt from 'npm:bcryptjs@2.4.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
};

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
    const body = await req.json();
    const contractNumber = typeof body?.contract_number === 'string' ? body.contract_number.trim() : '';
    const tempPassword = typeof body?.temp_password === 'string' ? body.temp_password : '';
    const refToken = typeof body?.ref === 'string' ? body.ref.trim() : '';

    if (!tempPassword) {
      return new Response(JSON.stringify({ error: 'Temporary password is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    let row: { id: string; contract_number: string; temp_password_hash: string; registration_token: string; email: string; used_at: string | null; expires_at: string | null } | null = null;

    if (refToken) {
      const { data, error } = await supabase
        .from('artist_contract_invites')
        .select('id, contract_number, temp_password_hash, registration_token, email, used_at, expires_at')
        .eq('registration_token', refToken)
        .maybeSingle();
      if (!error) row = data;
    }

    if (!row && contractNumber) {
      const { data, error } = await supabase
        .from('artist_contract_invites')
        .select('id, contract_number, temp_password_hash, registration_token, email, used_at, expires_at')
        .eq('contract_number', contractNumber)
        .maybeSingle();
      if (!error) row = data;
    }

    if (!row) {
      return new Response(JSON.stringify({ error: 'Invalid contract or link' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (row.used_at) {
      return new Response(JSON.stringify({ error: 'This invite has already been used' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'This invite has expired' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const match = bcrypt.compareSync(tempPassword, row.temp_password_hash);
    if (!match) {
      return new Response(JSON.stringify({ error: 'Invalid contract number or password' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        registration_token: row.registration_token,
        email: row.email || undefined,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('validate-contract-invite error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
