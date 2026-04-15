import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
};

const DEFAULT_MIN_FOLLOWERS = 100_000;

type Locale = 'en' | 'fr' | 'es';
const SUPPORTED_LOCALES: Locale[] = ['en', 'fr', 'es'];

function normalizeLocale(locale: string | undefined): Locale {
  if (!locale) return 'en';
  const l = locale.toLowerCase().slice(0, 2);
  return (SUPPORTED_LOCALES.includes(l as Locale) ? l : 'en') as Locale;
}

// Email copy: qualified (invite) — includes contract terms; CTA is sign electronically, then create account
const EMAIL_QUALIFIED: Record<Locale, { subject: (s: string) => string; buildHtml: (p: { stageName: string; firstName: string; signLink: string; year: number }) => string }> = {
  en: {
    subject: (stageName) => `Congratulations ${stageName}! You're invited to join Dreemystar`,
    buildHtml: ({ stageName, firstName, signLink, year }) => `
      <!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;line-height:1.6;color:#333;margin:0;padding:0}.container{max-width:600px;margin:0 auto;padding:20px}.header{background:linear-gradient(135deg,#7c3aed 0%,#db2777 100%);color:white;padding:40px 30px;text-align:center;border-radius:10px 10px 0 0}.header h1{margin:0;font-size:24px}.content{background:#f9f9f9;padding:30px;border-radius:0 0 10px 10px}.button{display:inline-block;background:linear-gradient(135deg,#7c3aed,#db2777);color:white;padding:16px 36px;text-decoration:none;border-radius:8px;margin:20px 0;font-weight:bold;font-size:16px}.highlight{background:white;padding:20px;border-radius:8px;margin:20px 0;border-left:4px solid #7c3aed}.contract-box{background:#f0f0f0;padding:18px;border-radius:8px;margin:20px 0;border:1px solid #ddd}.footer{text-align:center;margin-top:30px;color:#666;font-size:12px}</style></head><body><div class="container"><div class="header"><h1>Welcome to Dreemystar, ${stageName}!</h1></div><div class="content"><h2>Congratulations!</h2><p>Dear ${firstName},</p><p>We are thrilled to inform you that your application to join <strong>Dreemystar</strong> has been reviewed and <strong>approved</strong>!</p><p>Based on your social media presence, you meet our qualification criteria. We would love to have you on our platform.</p><div class="contract-box"><h3 style="margin-top:0">Contract terms</h3><p style="margin:0 0 10px">As an artist on Dreemystar, you will earn <strong>50% of the total amount from tickets sold</strong> for your events, <strong>excluding taxes and service fees</strong>. If you agree to these terms, you may proceed to create your artist account.</p></div><div class="highlight"><h3 style="margin-top:0">Next steps</h3><ol><li>Click the button below to <strong>sign electronically</strong> and accept the terms above.</li><li>After signing, you will be taken to the registration page to <strong>create your artist account</strong>.</li><li>Our team will contact you <strong>by telephone within 48 hours</strong> to finalize details. Once confirmed, you can start scheduling events!</li></ol></div><p style="text-align:center"><a href="${signLink}" class="button">Sign electronically &amp; create my account</a></p><p style="font-size:13px;color:#666">Or copy this link into your browser:</p><p style="word-break:break-all;color:#7c3aed;font-size:13px">${signLink}</p><p><strong>Important:</strong> This link is personal and unique to you. Please do not share it.</p></div><div class="footer"><p>&copy; ${year} DREEMYSTAR - All rights reserved</p><p>If you have any questions, email <a href="mailto:contact@dreemystar.com">contact@dreemystar.com</a>.</p></div></div></body></html>`,
  },
  fr: {
    subject: (stageName) => `Félicitations ${stageName} ! Vous êtes invité à rejoindre Dreemystar`,
    buildHtml: ({ stageName, firstName, signLink, year }) => `
      <!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;line-height:1.6;color:#333;margin:0;padding:0}.container{max-width:600px;margin:0 auto;padding:20px}.header{background:linear-gradient(135deg,#7c3aed 0%,#db2777 100%);color:white;padding:40px 30px;text-align:center;border-radius:10px 10px 0 0}.header h1{margin:0;font-size:24px}.content{background:#f9f9f9;padding:30px;border-radius:0 0 10px 10px}.button{display:inline-block;background:linear-gradient(135deg,#7c3aed,#db2777);color:white;padding:16px 36px;text-decoration:none;border-radius:8px;margin:20px 0;font-weight:bold;font-size:16px}.highlight{background:white;padding:20px;border-radius:8px;margin:20px 0;border-left:4px solid #7c3aed}.contract-box{background:#f0f0f0;padding:18px;border-radius:8px;margin:20px 0;border:1px solid #ddd}.footer{text-align:center;margin-top:30px;color:#666;font-size:12px}</style></head><body><div class="container"><div class="header"><h1>Bienvenue sur Dreemystar, ${stageName} !</h1></div><div class="content"><h2>Félicitations !</h2><p>Cher/Chère ${firstName},</p><p>Nous avons le plaisir de vous informer que votre candidature pour rejoindre <strong>Dreemystar</strong> a été examinée et <strong>approuvée</strong> !</p><p>Votre présence sur les réseaux sociaux correspond à nos critères. Nous serions ravis de vous accueillir sur notre plateforme.</p><div class="contract-box"><h3 style="margin-top:0">Conditions du contrat</h3><p style="margin:0 0 10px">En tant qu'artiste sur Dreemystar, vous percevrez <strong>50 % du montant total des billets vendus</strong> pour vos événements, <strong>taxes et frais de service exclus</strong>. Si vous acceptez ces conditions, vous pourrez créer votre compte artiste.</p></div><div class="highlight"><h3 style="margin-top:0">Prochaines étapes</h3><ol><li>Cliquez sur le bouton ci-dessous pour <strong>signer électroniquement</strong> et accepter les conditions ci-dessus.</li><li>Après signature, vous serez redirigé vers la page d'inscription pour <strong>créer votre compte artiste</strong>.</li><li>Notre équipe vous contactera <strong>par téléphone sous 48 heures</strong> pour finaliser. Une fois confirmé, vous pourrez planifier vos événements !</li></ol></div><p style="text-align:center"><a href="${signLink}" class="button">Signer électroniquement et créer mon compte</a></p><p style="font-size:13px;color:#666">Ou copiez ce lien dans votre navigateur :</p><p style="word-break:break-all;color:#7c3aed;font-size:13px">${signLink}</p><p><strong>Important :</strong> Ce lien est personnel. Ne le partagez pas.</p></div><div class="footer"><p>&copy; ${year} DREEMYSTAR - Tous droits réservés</p><p>Pour toute question, écrivez à <a href="mailto:contact@dreemystar.com">contact@dreemystar.com</a>.</p></div></div></body></html>`,
  },
  es: {
    subject: (stageName) => `¡Enhorabuena ${stageName}! Estás invitado a unirte a Dreemystar`,
    buildHtml: ({ stageName, firstName, signLink, year }) => `
      <!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;line-height:1.6;color:#333;margin:0;padding:0}.container{max-width:600px;margin:0 auto;padding:20px}.header{background:linear-gradient(135deg,#7c3aed 0%,#db2777 100%);color:white;padding:40px 30px;text-align:center;border-radius:10px 10px 0 0}.header h1{margin:0;font-size:24px}.content{background:#f9f9f9;padding:30px;border-radius:0 0 10px 10px}.button{display:inline-block;background:linear-gradient(135deg,#7c3aed,#db2777);color:white;padding:16px 36px;text-decoration:none;border-radius:8px;margin:20px 0;font-weight:bold;font-size:16px}.highlight{background:white;padding:20px;border-radius:8px;margin:20px 0;border-left:4px solid #7c3aed}.contract-box{background:#f0f0f0;padding:18px;border-radius:8px;margin:20px 0;border:1px solid #ddd}.footer{text-align:center;margin-top:30px;color:#666;font-size:12px}</style></head><body><div class="container"><div class="header"><h1>Bienvenido a Dreemystar, ${stageName}</h1></div><div class="content"><h2>¡Enhorabuena!</h2><p>Estimado/a ${firstName},</p><p>Nos complace informarte de que tu solicitud para unirte a <strong>Dreemystar</strong> ha sido revisada y <strong>aprobada</strong>.</p><p>Según tu presencia en redes sociales, cumples nuestros criterios. Nos encantaría tenerte en la plataforma.</p><div class="contract-box"><h3 style="margin-top:0">Condiciones del contrato</h3><p style="margin:0 0 10px">Como artista en Dreemystar, obtendrás <strong>el 50 % del importe total de las entradas vendidas</strong> para tus eventos, <strong>excluyendo impuestos y tasas de servicio</strong>. Si aceptas estos términos, podrás crear tu cuenta de artista.</p></div><div class="highlight"><h3 style="margin-top:0">Próximos pasos</h3><ol><li>Haz clic en el botón de abajo para <strong>firmar electrónicamente</strong> y aceptar las condiciones anteriores.</li><li>Tras firmar, serás redirigido a la página de registro para <strong>crear tu cuenta de artista</strong>.</li><li>Nuestro equipo te contactará <strong>por teléfono en 48 horas</strong> para cerrar los detalles. ¡Cuando esté confirmado, podrás programar eventos!</li></ol></div><p style="text-align:center"><a href="${signLink}" class="button">Firmar electrónicamente y crear mi cuenta</a></p><p style="font-size:13px;color:#666">O copia este enlace en tu navegador:</p><p style="word-break:break-all;color:#7c3aed;font-size:13px">${signLink}</p><p><strong>Importante:</strong> Este enlace es personal. No lo compartas.</p></div><div class="footer"><p>&copy; ${year} DREEMYSTAR - Todos los derechos reservados</p><p>Si tienes dudas, escribe a <a href="mailto:contact@dreemystar.com">contact@dreemystar.com</a>.</p></div></div></body></html>`,
  },
};

const EMAIL_REJECTED: Record<Locale, { subject: string; buildHtml: (p: { firstName: string; year: number }) => string }> = {
  en: {
    subject: 'Update on your Dreemystar application',
    buildHtml: ({ firstName, year }) => `
      <!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;line-height:1.6;color:#333;margin:0;padding:0}.container{max-width:600px;margin:0 auto;padding:20px}.header{background:linear-gradient(135deg,#4b5563 0%,#6b7280 100%);color:white;padding:40px 30px;text-align:center;border-radius:10px 10px 0 0}.header h1{margin:0;font-size:24px}.content{background:#f9f9f9;padding:30px;border-radius:0 0 10px 10px}.info-box{background:white;padding:20px;border-radius:8px;margin:20px 0;border-left:4px solid #6b7280}.footer{text-align:center;margin-top:30px;color:#666;font-size:12px}</style></head><body><div class="container"><div class="header"><h1>Dreemystar Application Update</h1></div><div class="content"><p>Dear ${firstName},</p><p>Thank you for your interest in joining Dreemystar as an artist. We truly appreciate you taking the time to apply.</p><p>After reviewing your application, we regret to inform you that your profile does not currently meet our qualification criteria for audience reach on at least one major social media platform (YouTube, Instagram, TikTok, or Facebook).</p><div class="info-box"><h3 style="margin-top:0">Don't give up!</h3><p>We encourage you to continue growing your audience. You are welcome to apply again once you feel you meet our criteria.</p><p>Keep creating, keep sharing, and keep dreaming!</p></div><p>We wish you the very best in your artistic journey.</p><p>Warm regards,<br>The Dreemystar Team</p></div><div class="footer"><p>&copy; ${year} DREEMYSTAR - All rights reserved</p></div></div></body></html>`,
  },
  fr: {
    subject: 'Mise à jour de votre candidature Dreemystar',
    buildHtml: ({ firstName, year }) => `
      <!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;line-height:1.6;color:#333;margin:0;padding:0}.container{max-width:600px;margin:0 auto;padding:20px}.header{background:linear-gradient(135deg,#4b5563 0%,#6b7280 100%);color:white;padding:40px 30px;text-align:center;border-radius:10px 10px 0 0}.header h1{margin:0;font-size:24px}.content{background:#f9f9f9;padding:30px;border-radius:0 0 10px 10px}.info-box{background:white;padding:20px;border-radius:8px;margin:20px 0;border-left:4px solid #6b7280}.footer{text-align:center;margin-top:30px;color:#666;font-size:12px}</style></head><body><div class="container"><div class="header"><h1>Mise à jour de votre candidature Dreemystar</h1></div><div class="content"><p>Cher/Chère ${firstName},</p><p>Merci pour votre intérêt pour Dreemystar. Nous apprécions le temps que vous avez consacré à postuler.</p><p>Après examen de votre candidature, nous sommes au regret de vous informer que votre profil ne remplit pas actuellement nos critères de qualification en matière d'audience sur au moins une plateforme (YouTube, Instagram, TikTok ou Facebook).</p><div class="info-box"><h3 style="margin-top:0">Ne renoncez pas !</h3><p>Nous vous encourageons à continuer à développer votre audience. Vous pourrez repostuler lorsque vous estimerez remplir nos critères.</p><p>Continuez à créer, partager et rêver !</p></div><p>Nous vous souhaitons le meilleur pour la suite.</p><p>Cordialement,<br>L'équipe Dreemystar</p></div><div class="footer"><p>&copy; ${year} DREEMYSTAR - Tous droits réservés</p></div></div></body></html>`,
  },
  es: {
    subject: 'Actualización de tu solicitud a Dreemystar',
    buildHtml: ({ firstName, year }) => `
      <!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;line-height:1.6;color:#333;margin:0;padding:0}.container{max-width:600px;margin:0 auto;padding:20px}.header{background:linear-gradient(135deg,#4b5563 0%,#6b7280 100%);color:white;padding:40px 30px;text-align:center;border-radius:10px 10px 0 0}.header h1{margin:0;font-size:24px}.content{background:#f9f9f9;padding:30px;border-radius:0 0 10px 10px}.info-box{background:white;padding:20px;border-radius:8px;margin:20px 0;border-left:4px solid #6b7280}.footer{text-align:center;margin-top:30px;color:#666;font-size:12px}</style></head><body><div class="container"><div class="header"><h1>Actualización de tu solicitud Dreemystar</h1></div><div class="content"><p>Estimado/a ${firstName},</p><p>Gracias por tu interés en unirte a Dreemystar como artista. Agradecemos que hayas dedicado tiempo a aplicar.</p><p>Tras revisar tu solicitud, lamentamos informarte de que tu perfil no cumple actualmente nuestros criterios de cualificación en cuanto a alcance de audiencia en al menos una plataforma (YouTube, Instagram, TikTok o Facebook).</p><div class="info-box"><h3 style="margin-top:0">¡No te rindas!</h3><p>Te animamos a seguir creciendo. Puedes volver a aplicar cuando consideres que cumples nuestros criterios.</p><p>¡Sigue creando, compartiendo y soñando!</p></div><p>Te deseamos lo mejor en tu trayectoria artística.</p><p>Un cordial saludo,<br>El equipo Dreemystar</p></div><div class="footer"><p>&copy; ${year} DREEMYSTAR - Todos los derechos reservados</p></div></div></body></html>`,
  },
};

/**
 * Verifies a YouTube channel and returns the actual subscriber count
 * Supports multiple YouTube URL formats:
 * - youtube.com/@handle
 * - youtube.com/channel/CHANNEL_ID
 * - youtube.com/c/CUSTOM_NAME
 * - youtube.com/user/USERNAME
 */
async function verifyYouTubeChannel(youtubeUrl: string): Promise<{ verified: boolean; subscriberCount: number | null; error?: string }> {
  const youtubeApiKey = Deno.env.get('YOUTUBE_API_KEY');
  if (!youtubeApiKey) {
    console.warn('YOUTUBE_API_KEY not configured, skipping YouTube verification');
    return { verified: false, subscriberCount: null, error: 'API key not configured' };
  }

  if (!youtubeUrl || !youtubeUrl.trim()) {
    return { verified: false, subscriberCount: null };
  }

  try {
    const url = youtubeUrl.trim();
    let channelId = '';

    // Extract channel ID or handle from URL
    // Format: youtube.com/@handle
    const handleMatch = url.match(/youtube\.com\/@([^/?\s]+)/i);
    if (handleMatch) {
      const handle = handleMatch[1];
      // Resolve handle to channel ID using search API
      const searchResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(handle)}&type=channel&key=${youtubeApiKey}&maxResults=1`
      );
      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        if (searchData.items && searchData.items.length > 0) {
          channelId = searchData.items[0].snippet.channelId;
        }
      }
    } 
    // Format: youtube.com/channel/CHANNEL_ID
    else {
      const channelMatch = url.match(/youtube\.com\/channel\/([^/?\s]+)/i);
      if (channelMatch) {
        channelId = channelMatch[1];
      } 
      // Format: youtube.com/c/CUSTOM_NAME or youtube.com/user/USERNAME
      else {
        const customMatch = url.match(/youtube\.com\/(?:c|user)\/([^/?\s]+)/i);
        if (customMatch) {
          const customName = customMatch[1];
          const searchResponse = await fetch(
            `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(customName)}&type=channel&key=${youtubeApiKey}&maxResults=1`
          );
          if (searchResponse.ok) {
            const searchData = await searchResponse.json();
            if (searchData.items && searchData.items.length > 0) {
              channelId = searchData.items[0].snippet.channelId;
            }
          }
        }
      }
    }

    if (!channelId) {
      console.warn('Could not extract YouTube channel ID from URL:', url);
      return { verified: false, subscriberCount: null, error: 'Could not extract channel ID' };
    }

    // Get channel statistics
    const statsResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelId}&key=${youtubeApiKey}`
    );

    if (!statsResponse.ok) {
      const errorText = await statsResponse.text();
      console.error('YouTube API error:', statsResponse.status, errorText);
      return { verified: false, subscriberCount: null, error: `API request failed: ${statsResponse.status}` };
    }

    const statsData = await statsResponse.json();
    if (!statsData.items || statsData.items.length === 0) {
      console.warn('YouTube channel not found for ID:', channelId);
      return { verified: false, subscriberCount: null, error: 'Channel not found' };
    }

    const subscriberCount = parseInt(statsData.items[0].statistics.subscriberCount || '0', 10);
    return { verified: true, subscriberCount };
  } catch (err) {
    console.error('YouTube verification error:', err);
    return { verified: false, subscriberCount: null, error: String(err) };
  }
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
    let body: { email?: string; forceStatus?: string; locale?: string };
    try {
      body = await req.json();
    } catch (parseErr) {
      console.error('process-artist-application: failed to parse body', parseErr);
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const email = body?.email;
    const forceStatus = body?.forceStatus;
    const locale = normalizeLocale(body?.locale);
    console.log('process-artist-application: received', { email: email ? `${email.slice(0, 3)}***` : undefined, forceStatus, locale });

    if (!email || typeof email !== 'string' || !email.trim()) {
      console.error('process-artist-application: missing or empty email');
      return new Response(JSON.stringify({ error: 'Missing email' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Load minimum followers threshold from app_config (with safe fallback)
    let minFollowers = DEFAULT_MIN_FOLLOWERS;
    try {
      const { data: cfg, error: cfgErr } = await supabase
        .from('app_config')
        .select('value')
        .eq('key', 'artist_min_followers')
        .maybeSingle();
      if (cfgErr) {
        console.warn('process-artist-application: app_config fetch error', cfgErr.message);
      } else if (cfg?.value !== undefined && cfg?.value !== null) {
        const raw = cfg.value as unknown;
        let num: number;
        if (typeof raw === 'number' && Number.isFinite(raw)) {
          num = Math.floor(raw);
        } else if (typeof raw === 'string') {
          num = parseInt(raw, 10);
        } else {
          num = parseInt(String(raw), 10);
        }
        if (Number.isFinite(num) && num >= 0) {
          minFollowers = num;
          console.log('process-artist-application: using minFollowers from app_config', minFollowers);
        } else {
          console.warn('process-artist-application: invalid artist_min_followers value', raw, 'using default', DEFAULT_MIN_FOLLOWERS);
        }
      } else {
        console.log('process-artist-application: no artist_min_followers in app_config, using default', DEFAULT_MIN_FOLLOWERS);
      }
    } catch (e) {
      console.warn('Failed to load artist_min_followers from app_config, using default.', e);
    }

    const emailNorm = email.trim().toLowerCase();

    // When called with forceStatus (admin override), fetch latest application regardless of status.
    // Otherwise only fetch pending applications (single chain so filter is applied).
    const { data: application, error: fetchErr } = forceStatus
      ? await supabase
          .from('artist_applications')
          .select('*')
          .eq('email', emailNorm)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : await supabase
          .from('artist_applications')
          .select('*')
          .eq('email', emailNorm)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

    if (fetchErr || !application) {
      console.error('process-artist-application: application not found', { fetchErr, email: emailNorm });
      return new Response(JSON.stringify({ error: 'Application not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('process-artist-application: found application', application.id, application.status);

    // Verify YouTube channel if URL is provided
    let verifiedYoutubeFollowers = application.youtube_followers || 0;
    let updateData: Record<string, unknown> = {};
    
    if (application.youtube_url && !forceStatus) {
      console.log('Verifying YouTube channel:', application.youtube_url);
      const youtubeVerification = await verifyYouTubeChannel(application.youtube_url);
      if (youtubeVerification.verified && youtubeVerification.subscriberCount !== null) {
        verifiedYoutubeFollowers = youtubeVerification.subscriberCount;
        console.log(`YouTube verification successful: ${verifiedYoutubeFollowers.toLocaleString()} subscribers (user entered: ${(application.youtube_followers || 0).toLocaleString()})`);
        // Update database with verified count
        updateData.youtube_followers = verifiedYoutubeFollowers;
      } else {
        console.warn('YouTube verification failed, using user-entered value:', youtubeVerification.error || 'Unknown error');
        // Continue with user-entered value if verification fails
      }
    }

    let newStatus: string;
    if (forceStatus === 'qualified' || forceStatus === 'rejected') {
      newStatus = forceStatus;
      console.log('process-artist-application: admin override', forceStatus);
    } else {
      // Coerce to numbers (DB may return strings)
      const yt = Number(verifiedYoutubeFollowers) || 0;
      const ig = Number(application.instagram_followers) || 0;
      const tt = Number(application.tiktok_followers) || 0;
      const fb = Number(application.facebook_followers) || 0;
      const maxCount = Math.max(yt, ig, tt, fb);
      const qualifies =
        yt >= minFollowers || ig >= minFollowers || tt >= minFollowers || fb >= minFollowers;
      newStatus = qualifies ? 'qualified' : 'rejected';
      console.log('process-artist-application: threshold check', { minFollowers, yt, ig, tt, fb, maxCount, qualifies: newStatus });
    }

    const qualifies = newStatus === 'qualified';

    // Update application status (and verified YouTube followers if available)
    const { error: updateErr } = await supabase
      .from('artist_applications')
      .update({
        ...updateData,
        status: newStatus,
        qualification_met: qualifies,
        processed_at: new Date().toISOString(),
      })
      .eq('id', application.id);

    if (updateErr) {
      console.error('process-artist-application: error updating application', updateErr);
    }

    // Build site URL for links
    let siteUrl = Deno.env.get('SITE_URL') || 'https://prodreemystar.netlify.app';
    if (!siteUrl.startsWith('http://') && !siteUrl.startsWith('https://')) {
      siteUrl = `https://${siteUrl}`;
    }
    siteUrl = siteUrl.replace(/\/+$/, '');

    // Send email
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const resendFromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'onboarding@resend.dev';

    if (!resendApiKey) {
      console.error('RESEND_API_KEY not configured');
      return new Response(JSON.stringify({ error: 'Email service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const stageName = application.stage_name || application.first_name;
    const firstName = application.first_name;
    const year = new Date().getFullYear();

    let subject: string;
    let emailHtml: string;

    if (qualifies) {
      const signLink = `${siteUrl}/artist-sign-contract?invite=${application.invite_token}`;
      const t = EMAIL_QUALIFIED[locale];
      subject = t.subject(stageName);
      emailHtml = t.buildHtml({ stageName, firstName, signLink, year });
    } else {
      const t = EMAIL_REJECTED[locale];
      subject = t.subject;
      emailHtml = t.buildHtml({ firstName, year });
    }

    // Send the email via Resend
    console.log(`Sending ${newStatus} email to ${application.email}`);
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: resendFromEmail,
        to: application.email,
        subject,
        html: emailHtml,
      }),
    });

    if (!resendResponse.ok) {
      const errText = await resendResponse.text();
      console.error('Resend API error:', errText);
      return new Response(
        JSON.stringify({ error: 'Failed to send email', details: errText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const resendData = await resendResponse.json();
    console.log(`Email sent (${newStatus}):`, resendData);

    return new Response(
      JSON.stringify({ success: true, status: newStatus, emailId: resendData.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('process-artist-application: error', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
