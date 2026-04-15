import { createClient } from "npm:@supabase/supabase-js@2.39.7";
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

const CALLBACK_USER_EMAIL: Record<Locale, { subject: string; title: string; thankYou: string; received: string; requestDetails: string; phoneNumber: string; requestId: string; submitted: string; account: string; guest: string; typicallyRespond: string; thankYouChoosing: string; automated: string; footerRights: string }> = {
  en: { subject: '📞 Callback Request Confirmation - DREEMYSTAR', title: 'Callback Request Received', thankYou: 'Thank you for contacting DREEMYSTAR!', received: "We've received your callback request and will contact you soon.", requestDetails: 'Request Details:', phoneNumber: 'Phone Number', requestId: 'Request ID', submitted: 'Submitted', account: 'Account', guest: 'Guest', typicallyRespond: 'Our team typically responds within 24 hours. For urgent questions you can also email contact@dreemystar.com.', thankYouChoosing: 'Thank you for choosing DREEMYSTAR!', automated: 'This is an automated confirmation email. Please do not reply to this message.', footerRights: '© 2025 DREEMYSTAR - All rights reserved' },
  fr: { subject: '📞 Confirmation de demande de rappel - DREEMYSTAR', title: 'Demande de rappel reçue', thankYou: 'Merci d\'avoir contacté DREEMYSTAR !', received: 'Nous avons bien reçu votre demande de rappel et vous recontacterons bientôt.', requestDetails: 'Détails de la demande :', phoneNumber: 'Numéro de téléphone', requestId: 'N° de demande', submitted: 'Envoyé le', account: 'Compte', guest: 'Invité', typicallyRespond: 'Notre équipe répond généralement sous 24 h. Pour une question urgente, vous pouvez aussi écrire à contact@dreemystar.com.', thankYouChoosing: 'Merci d\'avoir choisi DREEMYSTAR !', automated: 'Ceci est un e-mail de confirmation automatique. Merci de ne pas y répondre.', footerRights: '© 2025 DREEMYSTAR - Tous droits réservés' },
  es: { subject: '📞 Confirmación de solicitud de devolución de llamada - DREEMYSTAR', title: 'Solicitud de devolución de llamada recibida', thankYou: '¡Gracias por contactar a DREEMYSTAR!', received: 'Hemos recibido tu solicitud y te contactaremos pronto.', requestDetails: 'Detalles de la solicitud:', phoneNumber: 'Número de teléfono', requestId: 'ID de solicitud', submitted: 'Enviado', account: 'Cuenta', guest: 'Invitado', typicallyRespond: 'Nuestro equipo suele responder en 24 horas. Para asuntos urgentes también puedes escribir a contact@dreemystar.com.', thankYouChoosing: '¡Gracias por elegir DREEMYSTAR!', automated: 'Este es un correo de confirmación automático. Por favor no respondas a este mensaje.', footerRights: '© 2025 DREEMYSTAR - Todos los derechos reservados' },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone_number, email, user_id, request_id, description: descriptionFromRequest, locale: localeParam } = await req.json();
    const locale = normalizeLocale(localeParam);

    console.log('📞 Callback notification received:', { phone_number, email, user_id, request_id, hasDescription: !!descriptionFromRequest });

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get description from request body first (most reliable), fallback to database fetch
    let description = 'No description provided';
    
    // First, try to use description from request body (if passed directly)
    if (descriptionFromRequest && descriptionFromRequest.trim() !== '') {
      description = descriptionFromRequest.trim();
      console.log('✅ Description received from request body:', description.substring(0, 50) + '...');
    } else if (request_id) {
      // Fallback: fetch from database if not in request body
      try {
        // Add a small delay to ensure the INSERT is committed (if called from trigger)
        await new Promise(resolve => setTimeout(resolve, 200));
        
        const { data: callbackRequest, error: fetchError } = await supabase
          .from('callback_requests')
          .select('description')
          .eq('id', request_id)
          .single();
        
        if (fetchError) {
          console.error('Error fetching callback request description:', fetchError);
          // Try one more time after a longer delay
          await new Promise(resolve => setTimeout(resolve, 500));
          const { data: retryRequest } = await supabase
            .from('callback_requests')
            .select('description')
            .eq('id', request_id)
            .single();
          
          if (retryRequest?.description && retryRequest.description.trim() !== '') {
            description = retryRequest.description.trim();
            console.log('✅ Description fetched on retry:', description.substring(0, 50) + '...');
          } else {
            console.warn('⚠️ Description not found in database after retry');
          }
        } else if (callbackRequest?.description && callbackRequest.description.trim() !== '') {
          description = callbackRequest.description.trim();
          console.log('✅ Description fetched from database:', description.substring(0, 50) + '...');
        } else {
          console.warn('⚠️ Callback request found but description is empty or null');
        }
      } catch (error) {
        console.error('Error fetching description:', error);
      }
    } else {
      console.warn('⚠️ No request_id or description provided');
    }

    // Get user info if user_id is provided
    let userName = 'Guest User';
    if (user_id) {
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('full_name, username, email')
        .eq('id', user_id)
        .single();
      
      if (userProfile) {
        userName = userProfile.full_name || userProfile.username || 'Registered User';
      }
    }

    // Get all global admins and super admins
    const { data: admins, error: adminsError } = await supabase
      .from('profiles')
      .select('*')
      .in('user_type', ['global_admin', 'super_admin']);

    if (adminsError) {
      console.error('❌ Error fetching admins:', adminsError);
      throw adminsError;
    }

    console.log(`📧 Found ${admins?.length || 0} admin(s) to notify`);
    
    if (!admins || admins.length === 0) {
      console.warn('⚠️ No admins found in database. Admin notifications will not be sent.');
      // Don't throw - user confirmation was already sent, so return success
      return new Response(
        JSON.stringify({ 
          success: true, 
          warning: 'No admins found - user confirmation sent but admin notifications skipped' 
        }),
        { 
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        }
      );
    }

    // Enrich admins with email from auth.users if profile email is missing
    const adminsWithEmail = await Promise.all(
      admins.map(async (admin) => {
        // If profile has email, use it
        if (admin.email) {
          return { ...admin, email: admin.email };
        }
        
        // Otherwise, try to get email from auth.users
        console.log(`📧 Admin ${admin.id} has no email in profile, fetching from auth.users...`);
        try {
          const { data: { user }, error: authError } = await supabase.auth.admin.getUserById(admin.id);
          if (!authError && user?.email) {
            console.log(`✅ Found email for admin ${admin.id} in auth.users: ${user.email}`);
            return { ...admin, email: user.email };
          } else {
            console.warn(`⚠️ Could not get email for admin ${admin.id} from auth.users:`, authError);
            return { ...admin, email: null };
          }
        } catch (error) {
          console.error(`❌ Error fetching email for admin ${admin.id}:`, error);
          return { ...admin, email: null };
        }
      })
    );

    // Initialize Resend
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const resendFromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'onboarding@resend.dev';
    
    if (!resendApiKey) {
      console.error('❌ RESEND_API_KEY not configured');
      throw new Error('Email service not configured');
    }

    // Initialize Twilio for SMS (optional)
    const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
    const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
    const TWILIO_PHONE_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER");
    let twilioClient;
    if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
      twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    }

    const siteUrl = Deno.env.get('SITE_URL') || 'https://prodreemystar.netlify.app';
    const requestId = request_id || 'N/A';
    const timestamp = new Date().toLocaleString();

    // 1. Send confirmation email to user (translated)
    if (email) {
      try {
        const u = CALLBACK_USER_EMAIL[locale];
        const accountLine = user_id ? `<p><strong>${u.account}:</strong> ${userName}</p>` : `<p><strong>${u.account}:</strong> ${u.guest}</p>`;
        const userConfirmationHtml = `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                .details { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; }
                .request-id { background: #667eea; color: white; padding: 10px; border-radius: 5px; font-family: monospace; display: inline-block; }
                .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>📞 ${u.title}</h1>
                </div>
                <div class="content">
                  <h2>${u.thankYou}</h2>
                  <p>${u.received}</p>
                  
                  <div class="details">
                    <h3>${u.requestDetails}</h3>
                    <p><strong>${u.phoneNumber}:</strong> ${phone_number}</p>
                    <p><strong>${u.requestId}:</strong> <span class="request-id">#${requestId}</span></p>
                    <p><strong>${u.submitted}:</strong> ${timestamp}</p>
                    ${accountLine}
                  </div>
                  
                  <p>${u.typicallyRespond}</p>
                  
                  <p>${u.thankYouChoosing}</p>
                </div>
                <div class="footer">
                  <p>${u.automated}</p>
                  <p>${u.footerRights}</p>
                </div>
              </div>
            </body>
          </html>
        `;

        const resendResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: resendFromEmail,
            to: email,
            subject: u.subject,
            html: userConfirmationHtml,
          }),
        });

        if (!resendResponse.ok) {
          const errorText = await resendResponse.text();
          console.error(`❌ Failed to send confirmation email to ${email}:`, errorText);
        } else {
          console.log(`✅ Confirmation email sent to user: ${email}`);
        }
      } catch (error) {
        console.error(`❌ Failed to send confirmation email to ${email}:`, error);
        // Don't throw - continue with admin notifications
      }
      
      // Add delay after user confirmation email to respect rate limit before sending admin emails
      await new Promise(resolve => setTimeout(resolve, 600));
    }

    // 2. Send notification emails to ALL admins
    // Note: In Resend test mode, only peterannandennis@gmail.com can receive emails
    // For production, verify a domain at resend.com/domains
    const testEmail = 'peterannandennis@gmail.com';
    const isTestMode = resendFromEmail === 'onboarding@resend.dev' || resendFromEmail.includes('resend.dev');
    
    console.log(`📧 Preparing to send admin notifications. Test mode: ${isTestMode}, From email: ${resendFromEmail}`);
    
    // Filter out admins without email addresses
    const adminsToNotify = adminsWithEmail.filter(admin => admin.email);
    console.log(`📧 ${adminsToNotify.length} admin(s) have email addresses and will receive notifications`);
    
    if (adminsToNotify.length === 0) {
      console.warn('⚠️ No admins with email addresses found. Admin notifications will not be sent.');
      return new Response(
        JSON.stringify({ 
          success: true, 
          warning: 'No admins with email addresses found - user confirmation sent but admin notifications skipped' 
        }),
        { 
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        }
      );
    }
    
    // Resend rate limit: 2 requests per second
    // Add delay between emails to respect rate limit (600ms = 1.67 req/sec, safely under 2 req/sec)
    const emailDelayMs = 600;
    
    for (let i = 0; i < adminsToNotify.length; i++) {
      const admin = adminsToNotify[i];
      
      // Add delay before sending (except for the first email)
      if (i > 0) {
        console.log(`⏳ Waiting ${emailDelayMs}ms before sending next email (rate limit protection)...`);
        await new Promise(resolve => setTimeout(resolve, emailDelayMs));
      }
      console.log(`📧 Processing admin: ${admin.email || 'NO EMAIL'} (${admin.user_type})`);
      
      if (!admin.email) {
        console.warn(`⚠️ Admin ${admin.id} (${admin.username || admin.full_name || 'Unknown'}) has no email address. Skipping.`);
        continue;
      }
      
      // In test mode, only send to the verified test email
      // In production with verified domain, send to all admins
      const recipientEmail = isTestMode ? testEmail : admin.email;
      
      console.log(`📧 Sending notification to: ${recipientEmail}${isTestMode && admin.email !== testEmail ? ` (test mode - actual admin: ${admin.email})` : ''}`);
      
      try {
          const adminNotificationHtml = `
            <!DOCTYPE html>
            <html>
              <head>
                <meta charset="utf-8">
                <style>
                  body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                  .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                  .header { background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                  .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                  .details { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #f59e0b; }
                  .request-id { background: #f59e0b; color: white; padding: 10px; border-radius: 5px; font-family: monospace; display: inline-block; }
                  .button { display: inline-block; background: #f59e0b; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
                  .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
                </style>
              </head>
              <body>
                <div class="container">
                  <div class="header">
                    <h1>🔔 New Callback Request</h1>
                  </div>
                  <div class="content">
                    <h2>Action Required</h2>
                    <p>A new callback request has been submitted and requires your attention.</p>
                    
                    <div class="details">
                      <h3>Request Information:</h3>
                      <p><strong>Phone Number:</strong> ${phone_number}</p>
                      <p><strong>Email:</strong> ${email || 'Not provided'}</p>
                      <p><strong>Request ID:</strong> <span class="request-id">#${requestId}</span></p>
                      <p><strong>Submitted:</strong> ${timestamp}</p>
                      <p><strong>User:</strong> ${user_id ? userName : 'Anonymous/Guest'}</p>
                      ${user_id ? `<p><strong>User ID:</strong> ${user_id}</p>` : ''}
                      <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e5e7eb;">
                        <p><strong>Description:</strong></p>
                        <p style="background: #f9fafb; padding: 12px; border-radius: 5px; margin-top: 8px; white-space: pre-wrap; word-wrap: break-word;">${description}</p>
                      </div>
                    </div>
                    
                    <p>Please review and respond to this callback request as soon as possible.</p>
                    
                    <a href="${siteUrl}/monitoring" class="button">View in Dashboard</a>
                  </div>
                  <div class="footer">
                    <p>© 2025 DREEMYSTAR - All rights reserved</p>
                  </div>
                </div>
              </body>
            </html>
          `;

          const resendResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${resendApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: resendFromEmail,
              to: recipientEmail,
              subject: `🔔 New Callback Request - ${phone_number}${isTestMode && admin.email !== testEmail ? ` (Admin: ${admin.email})` : ''}`,
              html: adminNotificationHtml,
            }),
          });

          if (!resendResponse.ok) {
            const errorText = await resendResponse.text();
            let errorMessage = errorText;
            let errorDetails: any = null;
            
            // Try to parse error JSON, but handle parse errors gracefully
            try {
              const errorJson = JSON.parse(errorText);
              errorMessage = errorJson.message || errorJson.error || errorText;
              errorDetails = errorJson;
            } catch (parseError) {
              // If JSON parsing fails, use the raw error text
              errorMessage = errorText;
              console.warn(`⚠️ Could not parse error response as JSON for ${admin.email}:`, errorText);
            }
            
            // Log detailed error information
            console.error(`❌ Resend API error for ${admin.email}:`, {
              status: resendResponse.status,
              statusText: resendResponse.statusText,
              errorMessage,
              errorDetails,
              recipientEmail,
              fromEmail: resendFromEmail
            });
            
            // Handle rate limiting - log but don't fail
            if (resendResponse.status === 429) {
              console.warn(`⚠️ Rate limit exceeded for admin ${admin.email}. Will retry on next request.`);
            } 
            // Handle domain verification - expected in test mode
            else if (resendResponse.status === 403 && isTestMode && admin.email !== testEmail) {
              console.log(`ℹ️ Skipping ${admin.email} - Resend test mode only allows ${testEmail}. Verify domain for production.`);
            } 
            // Handle other 4xx/5xx errors
            else {
              console.error(`❌ Failed to send email to admin ${admin.email} (${resendResponse.status}):`, errorMessage);
            }
          } else {
            console.log(`✅ Notification email sent to ${recipientEmail}${isTestMode && admin.email !== testEmail ? ` (for admin ${admin.email})` : ''}`);
          }
        } catch (error) {
          console.error(`❌ Failed to send email to admin ${admin.email}:`, error);
        }

        // 3. Optionally send SMS to admins (if Twilio is configured and admin has phone)
        if (admin.phone && twilioClient && TWILIO_PHONE_NUMBER) {
          try {
            const smsMessage = `New callback request from ${phone_number}${email ? ` (${email})` : ''}. Request ID: #${requestId}. View: ${siteUrl}/monitoring`;
            
            await twilioClient.messages.create({
              body: smsMessage,
              to: admin.phone,
              from: TWILIO_PHONE_NUMBER,
            });

            console.log(`✅ SMS sent to admin: ${admin.phone}`);
          } catch (error) {
            console.error(`❌ Failed to send SMS to admin ${admin.phone}:`, error);
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
    console.error('Error in send-callback-notification:', error);
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
