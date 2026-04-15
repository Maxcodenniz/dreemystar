import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@14.18.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import { resolveTipRecipient, tipRecipientDisplayName } from '../_shared/resolveTipRecipient.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
    if (!STRIPE_SECRET_KEY) {
      throw new Error('Missing Stripe secret key');
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
    });

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase configuration is missing');
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Extract user ID and email from JWT token
    let authenticatedUserId: string | null = null;
    let authenticatedUserEmail: string | null = null;
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        if (!userError && user) {
          authenticatedUserId = user.id;
          authenticatedUserEmail = user.email || null;
        }
      } catch (authErr) {
        console.warn('Could not extract user from JWT token:', authErr);
      }
    }

    const body = await req.json();
    const { artistId, amount, message, email } = body;

    if (!artistId || !amount) {
      return new Response(
        JSON.stringify({ error: 'Artist ID and amount are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tipAmount = parseFloat(amount);
    if (isNaN(tipAmount) || tipAmount <= 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid tip amount' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const resolved = await resolveTipRecipient(supabase, String(artistId));
    if (!resolved.ok) {
      return new Response(
        JSON.stringify({ error: 'Artist not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const recipient = resolved.recipient;

    if (recipient.kind === 'registered' && authenticatedUserId === recipient.profile.id) {
      return new Response(
        JSON.stringify({ error: 'You cannot tip yourself' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const displayName = tipRecipientDisplayName(recipient);

    const finalUserId = authenticatedUserId || null;
    const finalEmail = authenticatedUserEmail || email || undefined;

    if (!authenticatedUserId) {
      const trimmed = (email && typeof email === 'string') ? email.trim() : '';
      if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        return new Response(
          JSON.stringify({ error: 'Email is required for guest tips so we can send your receipt.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const tipInsert =
      recipient.kind === 'registered'
        ? {
          artist_id: recipient.profile.id,
          event_id: null as string | null,
          unregistered_artist_name: null as string | null,
          sender_id: finalUserId,
          sender_email: finalEmail,
          amount: tipAmount,
          message: message || null,
          status: 'pending' as const,
        }
        : {
          artist_id: null,
          event_id: recipient.eventId,
          unregistered_artist_name: recipient.displayName,
          sender_id: finalUserId,
          sender_email: finalEmail,
          amount: tipAmount,
          message: message || null,
          status: 'pending' as const,
        };

    const { data: tipRecord, error: tipError } = await supabase
      .from('tips')
      .insert(tipInsert)
      .select()
      .single();

    if (tipError || !tipRecord) {
      console.error('Error creating tip record:', tipError);
      return new Response(
        JSON.stringify({ error: 'Failed to create tip record' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build site URL
    let siteUrl = Deno.env.get('SITE_URL') || 'https://prodreemystar.netlify.app';
    if (siteUrl && !siteUrl.startsWith('http://') && !siteUrl.startsWith('https://')) {
      siteUrl = `https://${siteUrl}`;
    }
    siteUrl = siteUrl.replace(/\/+$/, '');

    const successUrl = `${siteUrl}/tip-confirmation?tip_id=${tipRecord.id}&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = recipient.kind === 'registered'
      ? `${siteUrl}/artist/${recipient.profile.id}`
      : `${siteUrl}/watch/${recipient.eventId}`;

    // Create Stripe checkout session for tip
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Tip to ${displayName}`,
              description: message || `Thank you for supporting ${displayName}!`,
            },
            unit_amount: Math.round(tipAmount * 100), // Convert to cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: finalEmail,
      metadata: {
        tip_id: tipRecord.id,
        artist_id: recipient.kind === 'registered' ? recipient.profile.id : '',
        event_id: recipient.kind === 'unregistered' ? recipient.eventId : '',
        sender_id: finalUserId || '',
        type: 'tip',
      },
    });

    // Update tip record with Stripe session ID
    await supabase
      .from('tips')
      .update({ stripe_session_id: session.id })
      .eq('id', tipRecord.id);

    return new Response(
      JSON.stringify({ 
        sessionId: session.id,
        url: session.url,
        tipId: tipRecord.id
      }),
      { 
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Error creating tip payment:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'An unexpected error occurred' 
      }),
      { 
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
