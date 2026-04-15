import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import bcrypt from 'npm:bcryptjs@2.4.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
};

function randomPassword(length = 12): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let result = '';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < length; i++) result += chars[bytes[i] % chars.length];
  return result;
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('user_type')
      .eq('id', user.id)
      .single();

    const role = profile?.user_type;
    if (role !== 'super_admin' && role !== 'global_admin') {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const email = typeof body?.email === 'string' ? body.email.trim() : '';
    let contractNumber = typeof body?.contract_number === 'string' ? body.contract_number.trim() : '';

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: 'Valid email is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!contractNumber) {
      contractNumber = `CONTRACT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }

    const tempPassword = randomPassword(12);
    const tempPasswordHash = bcrypt.hashSync(tempPassword, 10);
    const registrationToken = crypto.randomUUID();

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const { error: insertErr } = await supabase.from('artist_contract_invites').insert({
      contract_number: contractNumber,
      temp_password_hash: tempPasswordHash,
      registration_token: registrationToken,
      email: email.toLowerCase(),
      expires_at: expiresAt.toISOString(),
      created_by: user.id,
    });

    if (insertErr) {
      if (insertErr.code === '23505') {
        return new Response(JSON.stringify({ error: 'Contract number already exists' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      console.error('Insert error:', insertErr);
      return new Response(JSON.stringify({ error: 'Failed to create invite' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const siteUrl = (Deno.env.get('SITE_URL') || 'https://prodreemystar.netlify.app').replace(/\/+$/, '');
    if (!siteUrl.startsWith('http')) throw new Error('Invalid SITE_URL');
    const registrationLink = `${siteUrl}/artist-register?ref=${registrationToken}`;

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const resendFromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'onboarding@resend.dev';

    if (resendApiKey) {
      const emailHtml = `
        <!DOCTYPE html>
        <html>
          <head><meta charset="utf-8"></head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px;">
            <div style="max-width: 600px; margin: 0 auto;">
              <div style="background: linear-gradient(135deg, #7c3aed 0%, #db2777 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                <h1 style="margin: 0; font-size: 22px;">Your Dreemystar Artist Contract</h1>
              </div>
              <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
                <p>You have been invited to register as an artist on Dreemystar using your contract details.</p>
                <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #7c3aed;">
                  <p style="margin: 0 0 8px;"><strong>Contract number:</strong> ${contractNumber}</p>
                  <p style="margin: 0 0 8px;"><strong>Temporary password:</strong> ${tempPassword}</p>
                </div>
                <p>Use the link below to open the registration page. Enter your contract number and temporary password when prompted.</p>
                <p style="text-align: center; margin: 24px 0;">
                  <a href="${registrationLink}" style="display: inline-block; background: linear-gradient(135deg, #7c3aed, #db2777); color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold;">Open registration</a>
                </p>
                <p style="font-size: 13px; color: #666;">Or copy this link: ${registrationLink}</p>
                <p style="font-size: 12px; color: #666;">This link is valid for 30 days. Do not share your password.</p>
              </div>
            </div>
          </body>
        </html>
      `;

      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: resendFromEmail,
          to: email,
          subject: 'Dreemystar – Artist registration (contract)',
          html: emailHtml,
        }),
      });

      if (!resendRes.ok) {
        const errText = await resendRes.text();
        console.error('Resend error:', errText);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        contract_number: contractNumber,
        registration_token: registrationToken,
        registration_link: registrationLink,
        temp_password: tempPassword,
        email_sent: !!resendApiKey,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('create-contract-artist-invite error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
