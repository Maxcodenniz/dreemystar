import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY')!;
const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
const stripe = new Stripe(stripeSecret, {
  appInfo: {
    name: 'Bolt Integration',
    version: '1.0.0',
  },
});

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

Deno.serve(async (req) => {
  try {
    // Handle OPTIONS request for CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204 });
    }

    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // get the signature from the header
    const signature = req.headers.get('stripe-signature');

    if (!signature) {
      return new Response('No signature found', { status: 400 });
    }

    // get the raw body
    const body = await req.text();

    // verify the webhook signature
    let event: Stripe.Event;

    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, stripeWebhookSecret);
    } catch (error: any) {
      console.error(`Webhook signature verification failed: ${error.message}`);
      return new Response(`Webhook signature verification failed: ${error.message}`, { status: 400 });
    }

    // Await ticket creation before 200 so Stripe retries on failure; do not use waitUntil-only
    // (otherwise a crash after the response leaves customers paid with no tickets).
    await handleEvent(event);

    return Response.json({ received: true });
  } catch (error: any) {
    console.error('Error processing webhook:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function handleEvent(event: Stripe.Event) {
  const stripeData = event?.data?.object ?? {};

  if (!stripeData) {
    return;
  }

  // Handle checkout.session.completed events (for one-time payments and subscriptions)
  if (event.type === 'checkout.session.completed') {
    const session = stripeData as Stripe.Checkout.Session;
    const { mode, payment_status, customer, customer_email } = session;

    console.info(`Processing checkout.session.completed event: mode=${mode}, payment_status=${payment_status}`);

    // Handle one-time payments (ticket purchases)
    if (mode === 'payment' && payment_status === 'paid') {
      try {
        // Extract the necessary information from the session
        const {
          id: checkout_session_id,
          payment_intent,
          amount_subtotal,
          amount_total,
          currency,
          metadata,
        } = session;
        
        // Get customer_email from session (for guest checkout)
        // Try multiple sources: session.customer_email, payment_intent customer, or customer object
        let sessionCustomerEmail = customer_email;
        
        // If customer_email is not in session, try to get it from payment_intent
        if (!sessionCustomerEmail && payment_intent) {
          try {
            const paymentIntent = await stripe.paymentIntents.retrieve(payment_intent as string);
            if (paymentIntent.receipt_email) {
              sessionCustomerEmail = paymentIntent.receipt_email;
              console.log(`📧 Found email from payment_intent.receipt_email: ${sessionCustomerEmail}`);
            } else if (paymentIntent.customer && typeof paymentIntent.customer === 'string') {
              const customerObj = await stripe.customers.retrieve(paymentIntent.customer);
              if (customerObj && !customerObj.deleted && 'email' in customerObj && customerObj.email) {
                sessionCustomerEmail = customerObj.email;
                console.log(`📧 Found email from payment_intent.customer: ${sessionCustomerEmail}`);
              }
            }
          } catch (piError) {
            console.warn('⚠️ Could not retrieve payment_intent to get email:', piError);
          }
        }
        
        // Fallback: try customer object if it's not a string
        if (!sessionCustomerEmail && customer && typeof customer !== 'string') {
          sessionCustomerEmail = (customer as any)?.email || null;
          if (sessionCustomerEmail) {
            console.log(`📧 Found email from customer object: ${sessionCustomerEmail}`);
          }
        }
        
        // Final fallback: if customer is a string ID, retrieve the customer
        if (!sessionCustomerEmail && customer && typeof customer === 'string') {
          try {
            const customerObj = await stripe.customers.retrieve(customer);
            if (customerObj && !customerObj.deleted && 'email' in customerObj && customerObj.email) {
              sessionCustomerEmail = customerObj.email;
              console.log(`📧 Found email from customer ID: ${sessionCustomerEmail}`);
            }
          } catch (custError) {
            console.warn('⚠️ Could not retrieve customer to get email:', custError);
          }
        }
        
        console.log(`📧 Final sessionCustomerEmail: ${sessionCustomerEmail || 'null'}`);

        const normalizedPurchaserEmail = sessionCustomerEmail
          ? sessionCustomerEmail.trim().toLowerCase()
          : null;

        // Get customer ID from metadata or try to find by email
        let customerIdForOrder: string | null = null;
        if (metadata?.userId) {
          customerIdForOrder = metadata.userId;
        } else if (normalizedPurchaserEmail) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .ilike('email', normalizedPurchaserEmail)
            .maybeSingle();
          customerIdForOrder = profile?.id || null;
        }

        // Idempotent order insert: upsert by checkout_session_id
        const { error: orderError } = await supabase.from('stripe_orders').upsert({
          checkout_session_id,
          payment_intent_id: payment_intent,
          customer_id: customerIdForOrder,
          amount_subtotal,
          amount_total,
          currency,
          payment_status,
          status: 'completed',
        }, { onConflict: 'checkout_session_id' });

        if (orderError) {
          console.error('Error inserting order:', orderError);
          throw orderError;
        }
        console.info(`Processed payment for session: ${checkout_session_id}`);

        // Handle tip payments
        if (metadata?.type === 'tip' && metadata?.tip_id) {
          const tipId = metadata.tip_id as string;
          const paymentIntentId = payment_intent as string;
          
          console.log(`💰 Processing tip payment: tip_id=${tipId}, payment_intent=${paymentIntentId}`);
          
          // Update tip status to completed
          const { error: tipUpdateError } = await supabase
            .from('tips')
            .update({
              status: 'completed',
              stripe_payment_intent_id: paymentIntentId,
              stripe_session_id: checkout_session_id,
              completed_at: new Date().toISOString(),
            })
            .eq('id', tipId);
          
          if (tipUpdateError) {
            console.error('Error updating tip status:', tipUpdateError);
          } else {
            console.log(`✅ Tip ${tipId} marked as completed`);
            const supabaseUrl = Deno.env.get('SUPABASE_URL');
            const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
            if (supabaseUrl && supabaseKey) {
              try {
                const notifRes = await fetch(`${supabaseUrl}/functions/v1/send-tip-notifications`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabaseKey}` },
                  body: JSON.stringify({ tip_id: tipId }),
                });
                if (!notifRes.ok) {
                  const errText = await notifRes.text();
                  console.error('send-tip-notifications failed:', notifRes.status, errText);
                } else {
                  console.log('send-tip-notifications completed for tip', tipId);
                }
              } catch (e) {
                console.error('send-tip-notifications request failed:', e);
              }
            }
          }
          
          return; // Don't process as ticket payment
        }

        // Handle bundle credits purchase (3-ticket or 5-ticket): add credits; optionally create tickets for cart events
        const bundleType = metadata?.bundle_type as string | undefined;
        if (bundleType === '3_ticket' || bundleType === '5_ticket') {
          const bundleUserId = (metadata?.userId as string)?.trim() || null;
          if (!bundleUserId) {
            console.warn('⚠️ Bundle purchase has no userId in metadata');
          } else {
            const creditsToAdd = bundleType === '3_ticket' ? 3 : 5;
            const bundleEventIdsStr = (metadata?.bundle_event_ids as string)?.trim() || '';
            const eventIdsToApply = bundleEventIdsStr
              ? bundleEventIdsStr.split(',').map((id: string) => id.trim()).filter(Boolean).slice(0, creditsToAdd)
              : [];

            const { data: existing } = await supabase
              .from('user_bundle_credits')
              .select('id, credits_remaining')
              .eq('user_id', bundleUserId)
              .eq('bundle_type', bundleType)
              .maybeSingle();
            let rowId: string;
            let newRemaining: number;
            if (existing) {
              newRemaining = existing.credits_remaining + creditsToAdd;
              const { error: upErr } = await supabase
                .from('user_bundle_credits')
                .update({
                  credits_remaining: newRemaining,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', existing.id);
              if (upErr) {
                console.error('Error updating bundle credits:', upErr);
                return;
              }
              rowId = existing.id;
              console.info(`✅ Added ${creditsToAdd} credits to user ${bundleUserId} (${bundleType})`);
            } else {
              const { data: inserted, error: insErr } = await supabase
                .from('user_bundle_credits')
                .insert({
                  user_id: bundleUserId,
                  bundle_type: bundleType,
                  credits_remaining: creditsToAdd,
                })
                .select('id')
                .single();
              if (insErr || !inserted) {
                console.error('Error inserting bundle credits:', insErr);
                return;
              }
              rowId = inserted.id;
              newRemaining = creditsToAdd;
              console.info(`✅ Created bundle credits for user ${bundleUserId}: ${creditsToAdd} (${bundleType})`);
            }

            const ticketPhone = metadata.phone && typeof metadata.phone === 'string' ? metadata.phone : null;
            let ticketsCreated = 0;
            for (const eventId of eventIdsToApply) {
              const { data: ticket, error: ticketErr } = await supabase
                .from('tickets')
                .insert({
                  event_id: eventId,
                  user_id: bundleUserId,
                  email: normalizedPurchaserEmail,
                  phone: ticketPhone,
                  stripe_payment_id: payment_intent,
                  stripe_session_id: checkout_session_id,
                  status: 'active',
                  ticket_type: 'live',
                })
                .select('id, event_id')
                .single();
              if (!ticketErr && ticket) {
                ticketsCreated++;
                if (sessionCustomerEmail || normalizedPurchaserEmail) {
                  try {
                    const emailFunctionUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-ticket-confirmation`;
                    await fetch(emailFunctionUrl, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
                      body: JSON.stringify({
                        ticketId: ticket.id,
                        eventId: ticket.event_id,
                        email: sessionCustomerEmail || normalizedPurchaserEmail,
                      }),
                    });
                  } catch (e) {
                    console.warn('Send ticket confirmation failed for bundle ticket', e);
                  }
                }
              }
            }
            if (ticketsCreated > 0) {
              await supabase
                .from('user_bundle_credits')
                .update({
                  credits_remaining: newRemaining - ticketsCreated,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', rowId);
              console.info(`✅ Applied ${ticketsCreated} bundle credits to cart events for user ${bundleUserId}`);
            }
          }
          return;
        }

        // Handle ticket creation for events
        if (!metadata) {
          console.warn('⚠️ No metadata found in checkout session - cannot create tickets');
        } else if (!metadata.eventId && !metadata.eventIds) {
          console.warn('⚠️ Metadata found but no eventId or eventIds - cannot create tickets');
          console.warn('⚠️ Metadata keys:', Object.keys(metadata));
        } else {
          // Per-row idempotency: unique index on (stripe_session_id, event_id, ticket_type) + 23505 handling.
          // Do NOT skip the whole session if any ticket exists — that breaks multi-event carts and retries
          // after a partial insert (only some events would get tickets).

          const eventIds = metadata.eventIds 
            ? metadata.eventIds.split(',').filter((id: string) => id.trim())
            : [metadata.eventId].filter((id: string) => id);
          
          const isBundle = metadata.is_bundle === 'true';
          
          console.info(`Creating tickets for ${eventIds.length} event(s):`, eventIds, isBundle ? '(live+replay bundle)' : '');

          let userId: string | null = null;
          if (metadata.userId) {
            userId = metadata.userId;
          } else if (normalizedPurchaserEmail) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('id')
              .ilike('email', normalizedPurchaserEmail)
              .maybeSingle();
            userId = profile?.id || null;
          }

          const tickets = [];
          const ticketPhone = metadata.phone && typeof metadata.phone === 'string' ? metadata.phone : null;
          const ticketType = metadata.is_replay === 'true' ? 'replay' : 'live';
          for (const eventId of eventIds) {
            const typesToCreate: ('live' | 'replay')[] = isBundle ? ['live', 'replay'] : [ticketType];
            for (const t of typesToCreate) {
              const { data: ticket, error: ticketError } = await supabase
                .from('tickets')
                .insert({
                  event_id: eventId,
                  user_id: userId,
                  email: normalizedPurchaserEmail,
                  phone: ticketPhone,
                  stripe_payment_id: payment_intent,
                  stripe_session_id: checkout_session_id,
                  status: 'active',
                  ticket_type: t,
                })
                .select()
                .single();

              if (ticketError) {
                // Unique constraint violation = duplicate webhook delivery → idempotent skip
                if (ticketError.code === '23505') {
                  console.info(`Ticket for event ${eventId} (${t}) already exists — skipped`);
                } else {
                  console.error(`Error creating ticket for event ${eventId} (${t}):`, ticketError);
                  throw ticketError;
                }
              } else {
                console.info(`✅ Created ticket ${ticket.id} for event ${eventId} (${t})`);
                tickets.push(ticket);
              }
            }
          }
          if (userId && ticketPhone) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('phone')
              .eq('id', userId)
              .single();
            if (profile && !profile.phone) {
              await supabase.from('profiles').update({ phone: ticketPhone }).eq('id', userId);
            }
          }

          // Send confirmation emails
          if (tickets.length > 0 && (sessionCustomerEmail || normalizedPurchaserEmail)) {
            try {
              const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
              const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
              const emailFunctionUrl = `${supabaseUrl}/functions/v1/send-ticket-confirmation`;

              for (const ticket of tickets) {
                const emailResponse = await fetch(emailFunctionUrl, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${supabaseServiceKey}`,
                  },
                  body: JSON.stringify({
                    ticketId: ticket.id,
                    eventId: ticket.event_id,
                    email: sessionCustomerEmail || normalizedPurchaserEmail,
                  }),
                });

                if (!emailResponse.ok) {
                  const errorText = await emailResponse.text();
                  console.error(`Error sending email for ticket ${ticket.id}: ${emailResponse.status} ${errorText}`);
                } else {
                  console.info(`✅ Sent confirmation email for ticket ${ticket.id}`);
                }
              }
            } catch (emailErr) {
              console.error('Exception while sending confirmation emails:', emailErr);
            }
          }
        }
      } catch (error) {
        console.error('Error processing one-time payment:', error);
        throw error;
      }
      return; // Exit early after processing payment
    }

    // Handle subscription payments
    if (mode === 'subscription' && customer && typeof customer === 'string') {
      console.info(`Starting subscription sync for customer: ${customer}`);
      await syncCustomerFromStripe(customer);
      return;
    }
  }

  // Handle other event types
  // For one-time payments, we only process checkout.session.completed
  // Other events (charge, payment_intent, etc.) are handled by checkout.session.completed
  // So we can safely ignore them without logging errors
  
  // Skip charge and payment_intent events for one-time payments (they don't have customer field)
  if (event.type === 'charge.succeeded' || 
      event.type === 'payment_intent.succeeded' || 
      event.type === 'payment_intent.created') {
    // These are normal for one-time payments - skip silently
    return;
  }

  // Handle subscription-related events that require a customer
  if (!('customer' in stripeData)) {
    // For non-subscription events without customer, skip silently (not an error)
    return;
  }

  const { customer: customerId } = stripeData;

  if (!customerId || typeof customerId !== 'string') {
    // Only log error for subscription-related events that require a customer
    if (event.type.includes('subscription') || event.type.includes('customer')) {
      console.error(`No customer received on subscription event: ${event.type}`);
    }
    return;
  }

  // Handle subscription-related events
  if (event.type.includes('subscription') || event.type.includes('customer')) {
    console.info(`Processing subscription event: ${event.type} for customer: ${customerId}`);
    await syncCustomerFromStripe(customerId);
  }
}

// based on the excellent https://github.com/t3dotgg/stripe-recommendations
async function syncCustomerFromStripe(customerId: string) {
  try {
    // fetch latest subscription data from Stripe
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      limit: 1,
      status: 'all',
      expand: ['data.default_payment_method'],
    });

    // TODO verify if needed
    if (subscriptions.data.length === 0) {
      console.info(`No active subscriptions found for customer: ${customerId}`);
      const { error: noSubError } = await supabase.from('stripe_subscriptions').upsert(
        {
          customer_id: customerId,
          subscription_status: 'not_started',
        },
        {
          onConflict: 'customer_id',
        },
      );

      if (noSubError) {
        console.error('Error updating subscription status:', noSubError);
        throw new Error('Failed to update subscription status in database');
      }
    }

    // assumes that a customer can only have a single subscription
    const subscription = subscriptions.data[0];

    // store subscription state
    const { error: subError } = await supabase.from('stripe_subscriptions').upsert(
      {
        customer_id: customerId,
        subscription_id: subscription.id,
        price_id: subscription.items.data[0].price.id,
        current_period_start: subscription.current_period_start,
        current_period_end: subscription.current_period_end,
        cancel_at_period_end: subscription.cancel_at_period_end,
        ...(subscription.default_payment_method && typeof subscription.default_payment_method !== 'string'
          ? {
              payment_method_brand: subscription.default_payment_method.card?.brand ?? null,
              payment_method_last4: subscription.default_payment_method.card?.last4 ?? null,
            }
          : {}),
        status: subscription.status,
      },
      {
        onConflict: 'customer_id',
      },
    );

    if (subError) {
      console.error('Error syncing subscription:', subError);
      throw new Error('Failed to sync subscription in database');
    }
    console.info(`Successfully synced subscription for customer: ${customerId}`);
  } catch (error) {
    console.error(`Failed to sync subscription for customer ${customerId}:`, error);
    throw error;
  }
}
