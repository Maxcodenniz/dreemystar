import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.7";
import sgMail from "npm:@sendgrid/mail@8.1.1";
import twilio from "npm:twilio@4.22.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
};

type Locale = 'en' | 'fr' | 'es';
function normalizeLocale(locale: string | undefined): Locale {
  if (!locale) return 'en';
  const l = locale.toLowerCase().slice(0, 2);
  return (l === 'fr' || l === 'es' ? l : 'en') as Locale;
}

type NotificationType = 'upcoming' | 'starting_soon' | 'about_to_start' | 'event_summary' | 'ticket_purchase';
const EVENT_NOTIFICATION: Record<Locale, Record<NotificationType, { subject: (title: string) => string; message: (title: string, extra?: { artist?: string; email?: string; ticketCount?: number; revenue?: number; artistShare?: number; streamUrl?: string }) => string }>> = {
  en: {
    upcoming: { subject: (t) => `Upcoming Event: ${t}`, message: (t) => `Your event "${t}" is starting in 1 hour!` },
    starting_soon: { subject: (t) => `Starting Soon: ${t}`, message: (t) => `Your event "${t}" is starting in 30 minutes!` },
    about_to_start: { subject: (t) => `Event Starting: ${t}`, message: (t) => `Your event "${t}" is starting in 5 minutes!` },
    event_summary: {
      subject: (t) => `Event Summary: ${t}`,
      message: (t, e) => `Event Summary for "${t}"\nArtist: ${e?.artist ?? ''}\nEmail: ${e?.email ?? ''}\nTickets Sold: ${e?.ticketCount ?? 0}\nTotal Revenue: $${(e?.revenue ?? 0).toFixed(2)}\nArtist Share: $${(e?.artistShare ?? 0).toFixed(2)}`
    },
    ticket_purchase: { subject: (t) => `Ticket Confirmation: ${t}`, message: (t, e) => `Thank you for purchasing a ticket to "${t}"! Here's your streaming link: ${e?.streamUrl ?? ''}` },
  },
  fr: {
    upcoming: { subject: (t) => `Événement à venir : ${t}`, message: (t) => `Votre événement « ${t} » commence dans 1 heure !` },
    starting_soon: { subject: (t) => `Bientôt : ${t}`, message: (t) => `Votre événement « ${t} » commence dans 30 minutes !` },
    about_to_start: { subject: (t) => `Événement en cours : ${t}`, message: (t) => `Votre événement « ${t} » commence dans 5 minutes !` },
    event_summary: {
      subject: (t) => `Résumé de l'événement : ${t}`,
      message: (t, e) => `Résumé de l'événement « ${t} »\nArtiste : ${e?.artist ?? ''}\nE-mail : ${e?.email ?? ''}\nBillets vendus : ${e?.ticketCount ?? 0}\nChiffre d'affaires : $${(e?.revenue ?? 0).toFixed(2)}\nPart artiste : $${(e?.artistShare ?? 0).toFixed(2)}`
    },
    ticket_purchase: { subject: (t) => `Confirmation de billet : ${t}`, message: (t, e) => `Merci d'avoir acheté un billet pour « ${t} » ! Lien de streaming : ${e?.streamUrl ?? ''}` },
  },
  es: {
    upcoming: { subject: (t) => `Próximo evento: ${t}`, message: (t) => `Tu evento "${t}" comienza en 1 hora.` },
    starting_soon: { subject: (t) => `Muy pronto: ${t}`, message: (t) => `Tu evento "${t}" comienza en 30 minutos.` },
    about_to_start: { subject: (t) => `Evento en vivo: ${t}`, message: (t) => `Tu evento "${t}" comienza en 5 minutos.` },
    event_summary: {
      subject: (t) => `Resumen del evento: ${t}`,
      message: (t, e) => `Resumen del evento "${t}"\nArtista: ${e?.artist ?? ''}\nEmail: ${e?.email ?? ''}\nEntradas vendidas: ${e?.ticketCount ?? 0}\nIngresos totales: $${(e?.revenue ?? 0).toFixed(2)}\nParte del artista: $${(e?.artistShare ?? 0).toFixed(2)}`
    },
    ticket_purchase: { subject: (t) => `Confirmación de entrada: ${t}`, message: (t, e) => `¡Gracias por comprar una entrada para "${t}"! Enlace de streaming: ${e?.streamUrl ?? ''}` },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { eventId, notificationType, locale: localeParam } = await req.json();
    const locale = normalizeLocale(localeParam);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get event details
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select(`
        *,
        profiles:artist_id (
          full_name,
          email,
          phone
        )
      `)
      .eq('id', eventId)
      .single();

    if (eventError) throw eventError;

    // Get all users with their notification preferences
    const { data: users, error: usersError } = await supabase
      .from('profiles')
      .select('*');

    if (usersError) throw usersError;

    // Initialize email service
    const SENDGRID_API_KEY = Deno.env.get("SENDGRID_API_KEY");
    if (SENDGRID_API_KEY) {
      sgMail.setApiKey(SENDGRID_API_KEY);
    }

    // Initialize SMS service
    const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
    const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
    const TWILIO_PHONE_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER");
    let twilioClient;
    if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
      twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    }

    // Prepare notification content (translated)
    const siteUrl = Deno.env.get('SITE_URL') || '';
    const streamUrl = `${siteUrl}/watch/${eventId}`;
    const tMap = EVENT_NOTIFICATION[locale];
    const nt = notificationType as NotificationType;
    const t = tMap[nt] ?? tMap.upcoming; // fallback
    let subject: string;
    let message: string;
    switch (notificationType) {
      case 'upcoming':
        subject = t.subject(event.title);
        message = t.message(event.title);
        break;
      case 'starting_soon':
        subject = t.subject(event.title);
        message = t.message(event.title);
        break;
      case 'about_to_start':
        subject = t.subject(event.title);
        message = t.message(event.title);
        break;
      case 'event_summary': {
        const { count: ticketCount } = await supabase
          .from('tickets')
          .select('*', { count: 'exact' })
          .eq('event_id', eventId)
          .eq('status', 'active');
        const revenue = (ticketCount || 0) * event.price;
        const artistShare = revenue / 2;
        const eventSummaryT = tMap.event_summary;
        subject = eventSummaryT.subject(event.title);
        message = eventSummaryT.message(event.title, {
          artist: event.profiles?.full_name,
          email: event.profiles?.email,
          ticketCount: ticketCount ?? 0,
          revenue,
          artistShare,
        });
        break;
      }
      case 'ticket_purchase': {
        const ticketT = tMap.ticket_purchase;
        subject = ticketT.subject(event.title);
        message = ticketT.message(event.title, { streamUrl });
        break;
      }
      default:
        subject = tMap.upcoming.subject(event.title);
        message = tMap.upcoming.message(event.title);
    }

    // Send notifications based on user preferences
    for (const user of users) {
      if (user.notification_preference === 'email' && user.email) {
        try {
          await sgMail.send({
            to: user.email,
            from: Deno.env.get("SENDGRID_FROM_EMAIL") || "noreply@dreemystar.com",
            subject,
            text: message,
          });
        } catch (error) {
          console.error(`Failed to send email to ${user.email}:`, error);
        }
      } else if (user.notification_preference === 'phone' && user.phone && twilioClient && TWILIO_PHONE_NUMBER) {
        try {
          await twilioClient.messages.create({
            body: message,
            to: user.phone,
            from: TWILIO_PHONE_NUMBER,
          });
        } catch (error) {
          console.error(`Failed to send SMS to ${user.phone}:`, error);
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      { 
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      }
    );
  } catch (error) {
    console.error('Error in send-event-notification:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'An unexpected error occurred',
        details: error
      }),
      { 
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      }
    );
  }
});