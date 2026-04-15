import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { tip_id: tipId } = await req.json();
    if (!tipId) {
      return new Response(JSON.stringify({ error: 'tip_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: tip, error: tipError } = await supabase
      .from('tips')
      .select('id, artist_id, event_id, unregistered_artist_name, amount, sender_email, message, status')
      .eq('id', tipId)
      .single();

    if (tipError || !tip || tip.status !== 'completed') {
      console.error('Tip not found or not completed:', tipError);
      return new Response(JSON.stringify({ error: 'Tip not found or not completed' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const amount = Number(tip.amount);
    const artistId = tip.artist_id as string | null;
    const eventId = tip.event_id as string | null;
    const unregisteredName =
      typeof tip.unregistered_artist_name === 'string' ? tip.unregistered_artist_name.trim() : '';

    let artistName = 'Artist';
    let artistEmail: string | null = null;

    if (artistId) {
      const { data: artist, error: artistError } = await supabase
        .from('profiles')
        .select('id, email, full_name, username')
        .eq('id', artistId)
        .single();

      if (artistError || !artist) {
        console.error('Artist not found:', artistError);
        return new Response(JSON.stringify({ error: 'Artist not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      artistName = artist.full_name || artist.username || 'Artist';
      artistEmail = artist.email ?? null;
      if (!artistEmail) {
        try {
          const { data: authUser } = await supabase.auth.admin.getUserById(artistId);
          artistEmail = authUser?.user?.email ?? null;
        } catch (authErr) {
          console.warn('Could not get artist email from auth:', authErr);
        }
      }
    } else if (eventId && unregisteredName) {
      artistName = unregisteredName;
      const { data: evRow } = await supabase
        .from('events')
        .select('unregistered_artist_email')
        .eq('id', eventId)
        .maybeSingle();
      const em = evRow?.unregistered_artist_email;
      artistEmail = typeof em === 'string' && em.trim() ? em.trim() : null;
      console.log(
        `Tip completed for unregistered scheduled artist "${unregisteredName}" (event ${eventId}); notify email: ${artistEmail ?? 'none'}`,
      );
    } else {
      console.error('Tip has no registered artist and no unregistered event context');
      return new Response(JSON.stringify({ error: 'Tip recipient not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: configRow } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', 'tip_platform_percentage')
      .maybeSingle();

    const raw = configRow?.value;
    const tipPlatformPercentage =
      typeof raw === 'number' ? raw : (raw != null ? parseFloat(String(raw)) : NaN);
    const pct = Number.isFinite(tipPlatformPercentage) ? Math.max(0, Math.min(100, tipPlatformPercentage)) : 20;
    const platformFee = Math.round((amount * (pct / 100)) * 100) / 100;
    const artistReceives = Math.round((amount - platformFee) * 100) / 100;

    if (artistId) {
      const notifTitle = 'New tip received';
      const notifMessage = `You received a $${amount.toFixed(2)} tip. Platform fee (${pct}%): $${platformFee.toFixed(2)}. You receive: $${artistReceives.toFixed(2)}.`;
      const { error: notifError } = await supabase.from('notifications').insert({
        user_id: artistId,
        title: notifTitle,
        message: notifMessage,
        type: 'info',
        metadata: { tip_id: tipId, amount, platform_pct: pct, platform_fee: platformFee, artist_receives: artistReceives },
      });
      if (notifError) {
        console.error('Failed to insert in-app notification for artist:', notifError);
      }
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const resendFromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'noreply@dreemystar.com';
    if (resendApiKey) {
      const sendEmail = async (to: string, subject: string, html: string) => {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ from: resendFromEmail, to, subject, html }),
        });
        if (!res.ok) {
          const errText = await res.text();
          console.error('Resend email error:', res.status, errText);
        }
      };

      // Email to artist
      if (artistEmail) {
        const artistHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>You received a tip</h2>
            <p>Someone sent you a tip of <strong>$${amount.toFixed(2)}</strong>.</p>
            <p>Platform fee (${pct}%): <strong>$${platformFee.toFixed(2)}</strong></p>
            <p>You receive: <strong>$${artistReceives.toFixed(2)}</strong></p>
            ${tip.message ? `<p><em>Message from supporter: "${tip.message}"</em></p>` : ''}
            <p style="color: #666; font-size: 12px; margin-top: 24px;">© DREEMYSTAR</p>
          </div>`;
        await sendEmail(artistEmail, `You received a $${amount.toFixed(2)} tip`, artistHtml);
      }

      // Confirmation email to tipper
      if (tip.sender_email) {
        const tipperHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Thank you for your tip</h2>
            <p>Your tip of <strong>$${amount.toFixed(2)}</strong> to <strong>${artistName}</strong> was successful.</p>
            <p>Platform fee (${pct}%): $${platformFee.toFixed(2)}. Your contribution to the artist: <strong>$${artistReceives.toFixed(2)}</strong>.</p>
            <p style="color: #666; font-size: 12px; margin-top: 24px;">© DREEMYSTAR</p>
          </div>`;
        await sendEmail(tip.sender_email, `Tip confirmation: $${amount.toFixed(2)} to ${artistName}`, tipperHtml);
      }
    } else {
      console.warn('RESEND_API_KEY not set; skipping tip notification emails');
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('send-tip-notifications error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
