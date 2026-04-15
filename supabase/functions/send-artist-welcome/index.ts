import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

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

const WELCOME_EMAIL: Record<Locale, { subject: (name: string) => string; buildHtml: (p: { name: string; siteUrl: string; year: number }) => string }> = {
  en: {
    subject: (name) => `Welcome to Dreemystar, ${name}!`,
    buildHtml: ({ name, siteUrl, year }) => `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;line-height:1.6;color:#333;margin:0;padding:0}.container{max-width:600px;margin:0 auto;padding:20px}.header{background:linear-gradient(135deg,#7c3aed 0%,#db2777 100%);color:white;padding:40px 30px;text-align:center;border-radius:10px 10px 0 0}.header h1{margin:0;font-size:26px}.content{background:#f9f9f9;padding:30px;border-radius:0 0 10px 10px}.button{display:inline-block;background:linear-gradient(135deg,#7c3aed,#db2777);color:white;padding:16px 36px;text-decoration:none;border-radius:8px;margin:20px 0;font-weight:bold;font-size:16px}.highlight{background:white;padding:20px;border-radius:8px;margin:20px 0;border-left:4px solid #7c3aed}.steps{counter-reset:step;list-style:none;padding:0}.steps li{counter-increment:step;padding:10px 0;padding-left:40px;position:relative}.steps li::before{content:counter(step);position:absolute;left:0;top:10px;width:28px;height:28px;background:#7c3aed;color:white;border-radius:50%;text-align:center;line-height:28px;font-weight:bold;font-size:14px}.footer{text-align:center;margin-top:30px;color:#666;font-size:12px}</style></head><body><div class="container"><div class="header"><h1>Welcome to Dreemystar, ${name}!</h1></div><div class="content"><p>Dear ${name},</p><p>Congratulations on creating your artist account on <strong>Dreemystar</strong>! We are excited to have you join our community of talented artists.</p><div class="highlight"><h3 style="margin-top:0">What happens next?</h3><ol class="steps"><li>Our team will contact you <strong>by telephone within 48 hours</strong> to discuss your contract and onboarding.</li><li>Once your contract is finalized, you'll be able to schedule live events and start performing for your fans worldwide.</li><li>In the meantime, feel free to explore your dashboard and set up your artist profile.</li></ol></div><p style="text-align:center"><a href="${siteUrl}/dashboard" class="button">Go to My Dashboard</a></p><p>If you have any questions in the meantime, email <a href="mailto:contact@dreemystar.com">contact@dreemystar.com</a>.</p><p>Welcome aboard!<br><strong>The Dreemystar Team</strong></p></div><div class="footer"><p>&copy; ${year} DREEMYSTAR - All rights reserved</p></div></div></body></html>`,
  },
  fr: {
    subject: (name) => `Bienvenue sur Dreemystar, ${name} !`,
    buildHtml: ({ name, siteUrl, year }) => `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;line-height:1.6;color:#333;margin:0;padding:0}.container{max-width:600px;margin:0 auto;padding:20px}.header{background:linear-gradient(135deg,#7c3aed 0%,#db2777 100%);color:white;padding:40px 30px;text-align:center;border-radius:10px 10px 0 0}.header h1{margin:0;font-size:26px}.content{background:#f9f9f9;padding:30px;border-radius:0 0 10px 10px}.button{display:inline-block;background:linear-gradient(135deg,#7c3aed,#db2777);color:white;padding:16px 36px;text-decoration:none;border-radius:8px;margin:20px 0;font-weight:bold;font-size:16px}.highlight{background:white;padding:20px;border-radius:8px;margin:20px 0;border-left:4px solid #7c3aed}.steps{counter-reset:step;list-style:none;padding:0}.steps li{counter-increment:step;padding:10px 0;padding-left:40px;position:relative}.steps li::before{content:counter(step);position:absolute;left:0;top:10px;width:28px;height:28px;background:#7c3aed;color:white;border-radius:50%;text-align:center;line-height:28px;font-weight:bold;font-size:14px}.footer{text-align:center;margin-top:30px;color:#666;font-size:12px}</style></head><body><div class="container"><div class="header"><h1>Bienvenue sur Dreemystar, ${name} !</h1></div><div class="content"><p>Cher/Chère ${name},</p><p>Félicitations pour la création de votre compte artiste sur <strong>Dreemystar</strong> ! Nous sommes ravis de vous accueillir.</p><div class="highlight"><h3 style="margin-top:0">Et maintenant ?</h3><ol class="steps"><li>Notre équipe vous contactera <strong>par téléphone sous 48 heures</strong> pour votre contrat et l'onboarding.</li><li>Une fois le contrat finalisé, vous pourrez planifier des lives et vous produire pour vos fans.</li><li>En attendant, explorez votre tableau de bord et complétez votre profil artiste.</li></ol></div><p style="text-align:center"><a href="${siteUrl}/dashboard" class="button">Accéder à mon tableau de bord</a></p><p>Pour toute question, écrivez à <a href="mailto:contact@dreemystar.com">contact@dreemystar.com</a>.</p><p>Bienvenue à bord !<br><strong>L'équipe Dreemystar</strong></p></div><div class="footer"><p>&copy; ${year} DREEMYSTAR - Tous droits réservés</p></div></div></body></html>`,
  },
  es: {
    subject: (name) => `Bienvenido a Dreemystar, ${name}`,
    buildHtml: ({ name, siteUrl, year }) => `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;line-height:1.6;color:#333;margin:0;padding:0}.container{max-width:600px;margin:0 auto;padding:20px}.header{background:linear-gradient(135deg,#7c3aed 0%,#db2777 100%);color:white;padding:40px 30px;text-align:center;border-radius:10px 10px 0 0}.header h1{margin:0;font-size:26px}.content{background:#f9f9f9;padding:30px;border-radius:0 0 10px 10px}.button{display:inline-block;background:linear-gradient(135deg,#7c3aed,#db2777);color:white;padding:16px 36px;text-decoration:none;border-radius:8px;margin:20px 0;font-weight:bold;font-size:16px}.highlight{background:white;padding:20px;border-radius:8px;margin:20px 0;border-left:4px solid #7c3aed}.steps{counter-reset:step;list-style:none;padding:0}.steps li{counter-increment:step;padding:10px 0;padding-left:40px;position:relative}.steps li::before{content:counter(step);position:absolute;left:0;top:10px;width:28px;height:28px;background:#7c3aed;color:white;border-radius:50%;text-align:center;line-height:28px;font-weight:bold;font-size:14px}.footer{text-align:center;margin-top:30px;color:#666;font-size:12px}</style></head><body><div class="container"><div class="header"><h1>Bienvenido a Dreemystar, ${name}</h1></div><div class="content"><p>Estimado/a ${name},</p><p>Enhorabuena por crear tu cuenta de artista en <strong>Dreemystar</strong>. Estamos encantados de tenerte.</p><div class="highlight"><h3 style="margin-top:0">¿Qué sigue?</h3><ol class="steps"><li>Nuestro equipo te contactará <strong>por teléfono en 48 horas</strong> para tu contrato y onboarding.</li><li>Cuando el contrato esté cerrado, podrás programar eventos en directo y actuar para tus fans.</li><li>Mientras tanto, explora tu panel y configura tu perfil de artista.</li></ol></div><p style="text-align:center"><a href="${siteUrl}/dashboard" class="button">Ir a mi panel</a></p><p>Si tienes dudas, escribe a <a href="mailto:contact@dreemystar.com">contact@dreemystar.com</a>.</p><p>¡Bienvenido a bordo!<br><strong>El equipo Dreemystar</strong></p></div><div class="footer"><p>&copy; ${year} DREEMYSTAR - Todos los derechos reservados</p></div></div></body></html>`,
  },
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
    const { email, stageName, locale: localeParam } = await req.json();
    if (!email) {
      return new Response(JSON.stringify({ error: 'Missing email' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const resendFromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'onboarding@resend.dev';

    if (!resendApiKey) {
      return new Response(JSON.stringify({ error: 'Email service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let siteUrl = Deno.env.get('SITE_URL') || 'https://prodreemystar.netlify.app';
    if (!siteUrl.startsWith('http://') && !siteUrl.startsWith('https://')) {
      siteUrl = `https://${siteUrl}`;
    }
    siteUrl = siteUrl.replace(/\/+$/, '');

    const name = stageName || 'Artist';
    const locale = normalizeLocale(localeParam);
    const t = WELCOME_EMAIL[locale];
    const subject = t.subject(name);
    const emailHtml = t.buildHtml({ name, siteUrl, year: new Date().getFullYear() });

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: resendFromEmail,
        to: email,
        subject,
        html: emailHtml,
      }),
    });

    if (!resendResponse.ok) {
      const errText = await resendResponse.text();
      console.error('Resend error:', errText);
      return new Response(
        JSON.stringify({ error: 'Failed to send welcome email', details: errText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await resendResponse.json();
    return new Response(
      JSON.stringify({ success: true, emailId: data.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Error sending welcome email:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
