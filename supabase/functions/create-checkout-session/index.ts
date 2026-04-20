import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "npm:stripe@14.18.0";
import { createClient } from "npm:@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
};

function sanitizeCheckoutReturnPath(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const p = raw.trim();
  if (!p.startsWith("/") || p.length > 256) return "";
  if (p.startsWith("//") || p.includes("..")) return "";
  if (/[\s<>"'\\]/.test(p)) return "";
  if (p.includes(":")) return "";
  return p;
}

/** 5% service fee + 20% VAT on ticket subtotal → total = base × 1.25 (same as app / View Event Details). */
function breakdownCentsFromBaseTotal(baseTotal: number): {
  subtotalCents: number;
  serviceCents: number;
  vatCents: number;
  totalCents: number;
} {
  const subtotalCents = Math.round(baseTotal * 100);
  const totalCents = Math.round(baseTotal * 1.25 * 100);
  const serviceCents = Math.round(baseTotal * 0.05 * 100);
  const vatCents = totalCents - subtotalCents - serviceCents;
  return { subtotalCents, serviceCents, vatCents, totalCents };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    if (!STRIPE_SECRET_KEY) {
      throw new Error("Missing Stripe secret key");
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2023-10-16",
    });

    // Currency for Checkout (e.g. 'usd', 'eur'). Default 'usd' so amounts display in dollars.
    const currency = (Deno.env.get("STRIPE_CURRENCY") || "usd").toLowerCase();

    // Get Supabase client for auth operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase configuration is missing');
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Extract user ID and email from JWT token if available (for logged-in users)
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
          console.log('✅ Authenticated user ID from JWT:', authenticatedUserId);
          console.log('✅ User email from JWT:', authenticatedUserEmail);
        } else {
          console.warn('⚠️ Could not get user from JWT token:', userError);
        }
      } catch (authErr) {
        console.warn('⚠️ Could not extract user from JWT token:', authErr);
        // Continue with guest checkout if auth fails
      }
    } else {
      console.log('ℹ️ No Authorization header found - proceeding as guest');
    }

    const rawBody = await req.json();
    // Support direct body or wrapped { body: { ... } } from some clients
    const body = rawBody && typeof rawBody === 'object' && rawBody.body && typeof rawBody.body === 'object'
      ? rawBody.body
      : rawBody;
    const { eventId, eventIds, email, phone, isCart, userId, isReplay, productType } = body;
    const returnPathSanitized = sanitizeCheckoutReturnPath(body.returnPath ?? body.return_path);
    const returnPathQuery = returnPathSanitized
      ? `&returnPath=${encodeURIComponent(returnPathSanitized)}`
      : '';
    const bundleTypeRaw = body.bundleType ?? body.bundle_type;
    const bundleType = typeof bundleTypeRaw === 'string' ? bundleTypeRaw.trim() : undefined;

    // Use authenticated user ID if available, otherwise use userId from body, or null for guest
    const finalUserId = authenticatedUserId || userId || null;
    
    // Get email: prefer authenticated user's email, then body email, then undefined (Stripe will collect)
    let finalEmail: string | undefined = authenticatedUserEmail || email || undefined;
    
    console.log('📧 Email sources:', {
      authenticatedUserEmail,
      emailFromBody: email,
      finalEmail
    });
    console.log('📦 Request type:', { bundleType, hasEventIds: !!(eventIds?.length || eventId) });

    // Support both single event and cart (multiple events), or bundle-only purchase
    const eventIdsToProcess = eventIds || (eventId ? [eventId] : []);

    // --- Bundle credits purchase (3-ticket or 5-ticket): requires auth; optional bundleEventIds from cart
    const isBundleCreditsPurchase = bundleType === '3_ticket' || bundleType === '5_ticket';
    const bundleEventIdsRaw = body.bundleEventIds ?? body.bundle_event_ids;
    const bundleEventIds = Array.isArray(bundleEventIdsRaw)
      ? bundleEventIdsRaw.filter((id: any) => typeof id === 'string' && id.trim()).map((id: string) => id.trim())
      : (typeof bundleEventIdsRaw === 'string' && bundleEventIdsRaw.trim()
          ? bundleEventIdsRaw.split(',').map((id: string) => id.trim()).filter(Boolean)
          : []);

    if (isBundleCreditsPurchase) {
      if (eventIdsToProcess.length > 0 && bundleEventIds.length === 0) {
        return new Response(
          JSON.stringify({ error: 'Bundle purchase must not include event IDs' }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (!finalUserId) {
        return new Response(
          JSON.stringify({ error: 'You must be signed in to purchase a ticket bundle' }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const expectedCount = bundleType === '3_ticket' ? 3 : 5;
      if (bundleEventIds.length > 0 && bundleEventIds.length !== expectedCount) {
        return new Response(
          JSON.stringify({ error: `${bundleType === '3_ticket' ? '3' : '5'}-ticket bundle requires exactly ${expectedCount} events in cart` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (bundleEventIds.length > 0) {
        const { data: eventsExist, error: evErr } = await supabase
          .from('events')
          .select('id')
          .in('id', bundleEventIds);
        if (evErr || !eventsExist || eventsExist.length !== bundleEventIds.length) {
          return new Response(
            JSON.stringify({ error: 'One or more events in your cart were not found' }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
      const bundleBase = bundleType === '3_ticket' ? 7.99 : 12.99;
      const { subtotalCents, serviceCents, vatCents } = breakdownCentsFromBaseTotal(bundleBase);
      let siteUrl = Deno.env.get('SITE_URL') || 'https://prodreemystar.netlify.app';
      if (siteUrl && !siteUrl.startsWith('http')) siteUrl = `https://${siteUrl}`;
      siteUrl = siteUrl.replace(/\/+$/, '');
      const fromCart = bundleEventIds.length > 0;
      const bundleName = bundleType === '3_ticket' ? '3-Ticket Bundle' : '5-Ticket Bundle';
      const bundleDesc = bundleType === '3_ticket'
        ? (fromCart ? '3 live event tickets from cart (base price)' : '3 credits for any 3 live events (base price)')
        : (fromCart ? '5 live event tickets from cart (base price)' : '5 credits for any 5 live events (base price)');
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency,
              product_data: {
                name: bundleName,
                description: bundleDesc,
              },
              unit_amount: subtotalCents,
            },
            quantity: 1,
          },
          {
            price_data: {
              currency,
              product_data: {
                name: 'Platform service fee',
                description: '5% service fee on bundle base price',
              },
              unit_amount: serviceCents,
            },
            quantity: 1,
          },
          {
            price_data: {
              currency,
              product_data: {
                name: 'VAT',
                description: '20% VAT on bundle base price',
              },
              unit_amount: vatCents,
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: fromCart ? `${siteUrl}/ticket-confirmation?session_id={CHECKOUT_SESSION_ID}&cart=true&bundle=true${returnPathQuery}` : `${siteUrl}/dashboard?bundle=success`,
        cancel_url: fromCart ? `${siteUrl}/cart` : `${siteUrl}/bundles`,
        customer_email: finalEmail,
        metadata: {
          bundle_type: bundleType,
          userId: finalUserId,
          eventIds: '',
          bundle_event_ids: bundleEventIds.join(','),
          isCart: fromCart ? 'true' : 'false',
          is_replay: 'false',
          phone: phone && typeof phone === 'string' ? phone : '',
        },
      });
      return new Response(
        JSON.stringify({ sessionId: session.id, url: session.url }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (eventIdsToProcess.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Event ID(s) are required' }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Fetch all events
    const { data: events, error: eventError } = await supabase
      .from('events')
      .select('*')
      .in('id', eventIdsToProcess);

    if (eventError || !events || events.length === 0) {
      throw new Error('Event(s) not found');
    }

    // Live + Replay bundle: single event only, fixed price $3.49 base
    const isLiveReplayBundle = productType === 'bundle' && eventIdsToProcess.length === 1;

    if (isLiveReplayBundle) {
      const { data: lrRow } = await supabase
        .from('app_config')
        .select('value')
        .eq('key', 'live_replay_bundle_enabled')
        .maybeSingle();
      const lrVal = lrRow?.value;
      const bundleOn = lrVal !== false && lrVal !== 'false';

      const { data: repRow } = await supabase
        .from('app_config')
        .select('value')
        .eq('key', 'replays_enabled')
        .maybeSingle();
      const repVal = repRow?.value;
      const replaysOn = repVal !== false && repVal !== 'false';

      if (!bundleOn || !replaysOn) {
        return new Response(
          JSON.stringify({
            error: 'Live + Replay bundle is not available. Choose live-only or email contact@dreemystar.com.',
          }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
          }
        );
      }
    }

    // Check for existing tickets (prevent duplicates)
    // For replay purchase: only block if they already have a REPLAY ticket (having live ticket is OK)
    // For live+replay bundle: block if they have any ticket (live or replay) for this event
    const onlyReplayTickets = isReplay === true && !isLiveReplayBundle;
    console.log('🔍 Checking for existing tickets:', { finalUserId, finalEmail, email, eventIdsToProcess, isReplay, isLiveReplayBundle });
    
    let existingTickets: any[] = [];
    
    if (finalUserId) {
      let q = supabase.from('tickets').select('event_id, user_id, email').eq('user_id', finalUserId).in('event_id', eventIdsToProcess).eq('status', 'active');
      if (onlyReplayTickets) {
        q = q.eq('ticket_type', 'replay');
      }
      const { data: ticketsByUserId, error: ticketCheckError } = await q;
      if (!ticketCheckError && ticketsByUserId && ticketsByUserId.length > 0) {
        existingTickets = ticketsByUserId;
      }
    }
    
    // Use finalEmail (JWT + body), not body `email` alone — otherwise logged-in users skip guest-ticket rows
    if (finalEmail && existingTickets.length === 0) {
      const normalizedEmail = finalEmail.toLowerCase().trim();
      let q = supabase.from('tickets').select('event_id, user_id, email').ilike('email', normalizedEmail).in('event_id', eventIdsToProcess).eq('status', 'active');
      if (onlyReplayTickets) {
        q = q.eq('ticket_type', 'replay');
      }
      const { data: ticketsByEmail, error: ticketCheckErrorByEmail } = await q;
      if (!ticketCheckErrorByEmail && ticketsByEmail && ticketsByEmail.length > 0) {
        existingTickets = ticketsByEmail;
      }
    }
    
    // If we found any existing tickets, block the checkout
    if (existingTickets.length > 0) {
      const existingEventIds = existingTickets.map(t => t.event_id);
      console.log('❌ Blocking checkout - user already has tickets for:', existingEventIds);
      
      // Get event titles for a more user-friendly error message
      const existingEvents = events.filter(e => existingEventIds.includes(e.id));
      const eventTitles = existingEvents.map(e => e.title || `Event ${e.id}`).join(', ');
      
      const errorMessage = existingEvents.length === 1
        ? `You have already purchased a ticket for "${eventTitles}". Please check your tickets or email contact@dreemystar.com if you believe this is an error.`
        : `You have already purchased tickets for the following events: ${eventTitles}. Please check your tickets or email contact@dreemystar.com if you believe this is an error.`;
      
      return new Response(
        JSON.stringify({ 
          error: errorMessage
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }
    
    console.log('✅ No existing tickets found - proceeding with checkout');

    // Stripe line items: ticket base(s) + service fee + VAT so Checkout shows a clear breakdown
    const lineItems: any[] = [];

    if (isLiveReplayBundle) {
      const base = 3.49;
      const { subtotalCents, serviceCents, vatCents } = breakdownCentsFromBaseTotal(base);
      lineItems.push(
        {
          price_data: {
            currency,
            product_data: {
              name: `${events[0].title} — Live + Replay`,
              description: 'Live stream + on-demand replay (base price)',
              images: events[0].image_url ? [events[0].image_url] : undefined,
            },
            unit_amount: subtotalCents,
          },
          quantity: 1,
        },
        {
          price_data: {
            currency,
            product_data: {
              name: 'Platform service fee',
              description: '5% service fee on ticket base price',
            },
            unit_amount: serviceCents,
          },
          quantity: 1,
        },
        {
          price_data: {
            currency,
            product_data: {
              name: 'VAT',
              description: '20% VAT on ticket base price',
            },
            unit_amount: vatCents,
          },
          quantity: 1,
        },
      );
    } else {
      let subtotalCents = 0;
      for (const event of events as any[]) {
        const basePrice = isReplay ? (event.replay_price ?? event.price ?? 0) : (event.price ?? 0);
        const baseCents = Math.round(Number(basePrice) * 100);
        subtotalCents += baseCents;
        lineItems.push({
          price_data: {
            currency,
            product_data: {
              name: isReplay ? `Replay: ${event.title}` : `Ticket: ${event.title}`,
              description: isReplay
                ? (event.description || `On-demand replay (base price)`)
                : (event.description || `Event ticket (base price)`),
              images: event.image_url ? [event.image_url] : undefined,
            },
            unit_amount: baseCents,
          },
          quantity: 1,
        });
      }
      const subtotal = subtotalCents / 100;
      const { serviceCents, vatCents } = breakdownCentsFromBaseTotal(subtotal);
      lineItems.push(
        {
          price_data: {
            currency,
            product_data: {
              name: 'Platform service fee',
              description: '5% service fee on ticket subtotal',
            },
            unit_amount: serviceCents,
          },
          quantity: 1,
        },
        {
          price_data: {
            currency,
            product_data: {
              name: 'VAT',
              description: '20% VAT on ticket subtotal',
            },
            unit_amount: vatCents,
          },
          quantity: 1,
        },
      );
    }

    // Determine success/cancel URLs
    // IMPORTANT: Stripe requires publicly accessible URLs for redirects
    // For local development, use a tunnel service (ngrok/localtunnel)
    // Set SITE_URL secret in Supabase to your tunnel URL (e.g., https://abc123.ngrok.io)
    let siteUrl = Deno.env.get('SITE_URL') || 'https://prodreemystar.netlify.app';
    if (siteUrl && !siteUrl.startsWith('http://') && !siteUrl.startsWith('https://')) {
      siteUrl = `https://${siteUrl}`;
    }
    siteUrl = siteUrl.replace(/\/+$/, '');
    
    // Log the URL being used (helpful for debugging)
    console.info('🔗 Using SITE_URL for redirects:', siteUrl);
    if (siteUrl.includes('localhost') || siteUrl.includes('127.0.0.1')) {
      console.warn('⚠️ WARNING: Localhost URLs won\'t work with Stripe redirects!');
      console.warn('⚠️ Use ngrok or localtunnel to create a public URL for local development.');
    }
    
    const successUrl = isCart 
      ? `${siteUrl}/ticket-confirmation?session_id={CHECKOUT_SESSION_ID}&cart=true${returnPathQuery}`
      : `${siteUrl}/ticket-confirmation?session_id={CHECKOUT_SESSION_ID}&eventId=${eventIdsToProcess[0]}${returnPathQuery}`;
    const cancelUrl = isCart 
      ? `${siteUrl}/cart`
      : `${siteUrl}/watch/${eventIdsToProcess[0]}`;

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: finalEmail,
      metadata: {
        eventIds: eventIdsToProcess.join(','),
        isCart: isCart ? 'true' : 'false',
        is_replay: isLiveReplayBundle ? 'false' : (isReplay ? 'true' : 'false'),
        is_bundle: isLiveReplayBundle ? 'true' : 'false',
        userId: finalUserId || '',
        phone: phone && typeof phone === 'string' ? phone : '',
      },
    });

    return new Response(
      JSON.stringify({ 
        sessionId: session.id,
        url: session.url 
      }),
      { 
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'An unexpected error occurred' 
      }),
      { 
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
