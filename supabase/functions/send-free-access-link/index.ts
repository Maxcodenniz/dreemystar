import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
};

type Locale = 'en' | 'fr' | 'es';
function normalizeLocale(locale: string | undefined): Locale {
  if (!locale) return 'en';
  const l = locale.toLowerCase().slice(0, 2);
  return (l === 'fr' || l === 'es' ? l : 'en') as Locale;
}

const FREE_ACCESS_EMAIL: Record<Locale, { subject: (title: string) => string; header: string; granted: string; resolved: string; accessLink: string; clickButton: string; watchNow: string; important: string; questions: string; footerRights: string; complimentary: string }> = {
  en: { subject: (t) => `🎟️ Free Access Granted: ${t}`, header: 'DREEMYSTAR Free Event Access', granted: "You've been granted free access!", resolved: "We've resolved the ticket/access issue for your account. You now have free access to watch the following event:", accessLink: 'Access Link', clickButton: 'Click the button below to access the event:', watchNow: 'Watch Event Now', important: 'Important: Please save this email. You\'ll need this link to access the event when it goes live.', questions: 'If you have any questions or need further assistance, email contact@dreemystar.com.', footerRights: '© 2025 DREEMYSTAR - All rights reserved', complimentary: 'This is a complimentary access link from the Dreemystar team.' },
  fr: { subject: (t) => `🎟️ Accès gratuit accordé : ${t}`, header: 'Accès gratuit DREEMYSTAR', granted: 'Un accès gratuit vous a été accordé !', resolved: 'Nous avons résolu le problème de billet/accès pour votre compte. Vous avez maintenant un accès gratuit à l\'événement suivant :', accessLink: 'Lien d\'accès', clickButton: 'Cliquez sur le bouton ci-dessous pour accéder à l\'événement :', watchNow: 'Voir l\'événement maintenant', important: 'Important : Conservez cet e-mail. Vous aurez besoin de ce lien pour accéder à l\'événement en direct.', questions: 'Pour toute question ou assistance, écrivez à contact@dreemystar.com.', footerRights: '© 2025 DREEMYSTAR - Tous droits réservés', complimentary: 'Ce lien d\'accès vous a été fourni par l\'équipe Dreemystar.' },
  es: { subject: (t) => `🎟️ Acceso gratuito concedido: ${t}`, header: 'Acceso gratuito DREEMYSTAR', granted: '¡Se te ha concedido acceso gratuito!', resolved: 'Hemos resuelto el problema de entrada/acceso. Ahora tienes acceso gratuito al siguiente evento:', accessLink: 'Enlace de acceso', clickButton: 'Haz clic en el botón para acceder al evento:', watchNow: 'Ver evento ahora', important: 'Importante: Guarda este correo. Necesitarás este enlace para acceder al evento en directo.', questions: 'Si tienes dudas o necesitas ayuda, escribe a contact@dreemystar.com.', footerRights: '© 2025 DREEMYSTAR - Todos los derechos reservados', complimentary: 'Este enlace te ha sido proporcionado por el equipo de Dreemystar.' },
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const { email, eventId, eventTitle, accessLink, locale: localeParam } = await req.json();
    const locale = normalizeLocale(localeParam);

    if (!email || !eventId || !eventTitle || !accessLink) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: email, eventId, eventTitle, accessLink' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get Resend API key
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const resendFromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'onboarding@resend.dev';

    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ error: 'Email service not configured - RESEND_API_KEY missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const t = FREE_ACCESS_EMAIL[locale];
    // Build email content (translated)
    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .info-box { background: #e3f2fd; border-left: 4px solid #2196f3; padding: 15px; margin: 20px 0; border-radius: 5px; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎟️ ${t.header}</h1>
            </div>
            <div class="content">
              <h2>${t.granted}</h2>
              <p>${t.resolved}</p>
              
              <div class="info-box">
                <h3 style="margin-top: 0;">${eventTitle}</h3>
                <p><strong>${t.accessLink}:</strong> <a href="${accessLink}" style="color: #667eea; word-break: break-all;">${accessLink}</a></p>
              </div>

              <p>${t.clickButton}</p>
              <a href="${accessLink}" class="button">${t.watchNow}</a>
              
              <p style="margin-top: 30px;"><strong>${t.important}</strong></p>
              
              <p>${t.questions}</p>
            </div>
            <div class="footer">
              <p>${t.footerRights}</p>
              <p>${t.complimentary}</p>
            </div>
          </div>
        </body>
      </html>
    `;

    // Send email via Resend
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: resendFromEmail,
        to: email.trim(),
        subject: t.subject(eventTitle),
        html: emailHtml,
      }),
    });

    if (!resendResponse.ok) {
      const errorText = await resendResponse.text();
      console.error('❌ Resend API error:', errorText);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to send email via Resend API', 
          details: errorText
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const resendData = await resendResponse.json();
    console.log('✅ Free access link email sent successfully!');

    return new Response(
      JSON.stringify({ 
        success: true, 
        emailId: resendData.id,
        message: 'Email sent successfully' 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in send-free-access-link:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
