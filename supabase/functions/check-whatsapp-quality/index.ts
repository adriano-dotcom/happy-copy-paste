import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface QualityResponse {
  id: string;
  quality_rating: 'GREEN' | 'YELLOW' | 'RED';
  status: string;
  messaging_limit_tier: string;
  display_phone_number: string;
  verified_name?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log('[CheckQuality] Starting quality check...');

    // Get WhatsApp settings
    const { data: settings, error: settingsError } = await supabase
      .from('nina_settings')
      .select('whatsapp_access_token, whatsapp_phone_number_id, whatsapp_quality_status')
      .maybeSingle();

    if (settingsError) {
      console.error('[CheckQuality] Error fetching settings:', settingsError);
      throw new Error('Failed to fetch WhatsApp settings');
    }

    if (!settings?.whatsapp_access_token || !settings?.whatsapp_phone_number_id) {
      console.warn('[CheckQuality] WhatsApp not configured');
      return new Response(JSON.stringify({ 
        error: 'WhatsApp not configured',
        configured: false 
      }), { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const accessToken = settings.whatsapp_access_token;
    const phoneNumberId = settings.whatsapp_phone_number_id;

    // Query Facebook API for phone number quality info
    const phoneInfoUrl = `https://graph.facebook.com/v21.0/${phoneNumberId}?fields=quality_rating,status,messaging_limit_tier,display_phone_number,verified_name`;
    
    console.log('[CheckQuality] Querying Facebook API for phone:', phoneNumberId);
    
    const response = await fetch(phoneInfoUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[CheckQuality] Facebook API error:', response.status, errorText);
      throw new Error(`Facebook API error: ${response.status}`);
    }

    const data: QualityResponse = await response.json();
    console.log('[CheckQuality] Received data:', JSON.stringify(data));

    const previousStatus = settings.whatsapp_quality_status || { rating: 'GREEN' };
    const currentRating = data.quality_rating || 'GREEN';
    const currentTier = data.messaging_limit_tier || 'TIER_1K';

    // Check if status changed
    const statusChanged = previousStatus.rating !== currentRating;
    
    if (statusChanged) {
      console.log('[CheckQuality] Status changed from', previousStatus.rating, 'to', currentRating);
      
      // Determine event type
      let eventType = 'CHECK';
      if (previousStatus.rating === 'GREEN' && currentRating !== 'GREEN') {
        eventType = currentRating === 'YELLOW' ? 'FLAGGED' : 'DOWNGRADE';
      } else if (previousStatus.rating !== 'GREEN' && currentRating === 'GREEN') {
        eventType = 'UNFLAGGED';
      } else if (previousStatus.rating === 'YELLOW' && currentRating === 'RED') {
        eventType = 'DOWNGRADE';
      }

      // Insert into history
      await supabase.from('whatsapp_quality_history').insert({
        phone_number_id: phoneNumberId,
        display_phone_number: data.display_phone_number,
        event_type: eventType,
        current_limit: currentTier,
        old_limit: previousStatus.tier,
        quality_rating: currentRating,
        raw_payload: data
      });

      // Send alert if quality dropped
      if (currentRating === 'YELLOW' || currentRating === 'RED') {
        await sendQualityAlert(supabase, currentRating, eventType, currentTier, data.display_phone_number);
      }
    }

    // Update current status
    const newStatus = {
      rating: currentRating,
      tier: currentTier,
      status: data.status,
      display_phone_number: data.display_phone_number,
      verified_name: data.verified_name,
      last_check: new Date().toISOString()
    };

    await supabase
      .from('nina_settings')
      .update({ whatsapp_quality_status: newStatus })
      .eq('id', '1e57a20e-4a9e-4fdc-a6ef-0ed084cfcf2c');

    console.log('[CheckQuality] Status updated:', JSON.stringify(newStatus));

    return new Response(JSON.stringify({
      success: true,
      quality: newStatus,
      changed: statusChanged,
      previous: previousStatus.rating
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[CheckQuality] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Send email alert for quality issues
async function sendQualityAlert(
  supabase: any,
  rating: string,
  event: string,
  tier: string,
  phoneNumber: string
) {
  try {
    console.log('[CheckQuality] Sending quality alert for rating:', rating);

    const color = rating === 'RED' ? '#DC2626' : '#F59E0B';
    const emoji = rating === 'RED' ? '🚨' : '⚠️';
    const severity = rating === 'RED' ? 'CRÍTICO' : 'ATENÇÃO';

    // Get alert recipients (team members with admin role)
    const { data: admins } = await supabase
      .from('team_members')
      .select('email, name')
      .eq('role', 'admin');

    const recipients = admins?.map((a: any) => a.email) || [];
    
    if (recipients.length === 0) {
      console.warn('[CheckQuality] No admin recipients found for alert');
      return;
    }

    // Send email via send-email function
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    for (const email of recipients) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`
          },
          body: JSON.stringify({
            to: email,
            subject: `${emoji} ${severity}: Quality Score WhatsApp ${rating}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: ${color}; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                  <h1 style="margin: 0; font-size: 24px;">${emoji} Alerta de Quality Score</h1>
                </div>
                <div style="background: #f8f9fa; padding: 20px; border-radius: 0 0 8px 8px;">
                  <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                      <td style="padding: 10px 0; border-bottom: 1px solid #dee2e6;"><strong>Status Atual:</strong></td>
                      <td style="padding: 10px 0; border-bottom: 1px solid #dee2e6;">
                        <span style="background: ${color}; color: white; padding: 4px 12px; border-radius: 4px; font-weight: bold;">${rating}</span>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 10px 0; border-bottom: 1px solid #dee2e6;"><strong>Evento:</strong></td>
                      <td style="padding: 10px 0; border-bottom: 1px solid #dee2e6;">${event}</td>
                    </tr>
                    <tr>
                      <td style="padding: 10px 0; border-bottom: 1px solid #dee2e6;"><strong>Tier:</strong></td>
                      <td style="padding: 10px 0; border-bottom: 1px solid #dee2e6;">${tier}</td>
                    </tr>
                    <tr>
                      <td style="padding: 10px 0; border-bottom: 1px solid #dee2e6;"><strong>Número:</strong></td>
                      <td style="padding: 10px 0; border-bottom: 1px solid #dee2e6;">${phoneNumber}</td>
                    </tr>
                    <tr>
                      <td style="padding: 10px 0;"><strong>Data/Hora:</strong></td>
                      <td style="padding: 10px 0;">${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</td>
                    </tr>
                  </table>
                  
                  <div style="margin-top: 20px; padding: 15px; background: #fff3cd; border-radius: 8px; border-left: 4px solid #ffc107;">
                    <h3 style="margin: 0 0 10px 0; color: #856404;">📋 Ações Recomendadas</h3>
                    <ul style="margin: 0; padding-left: 20px; color: #856404;">
                      ${rating === 'RED' ? `
                        <li>Pausar imediatamente todas as campanhas de prospecção</li>
                        <li>Revisar mensagens recentes que possam ter gerado bloqueios</li>
                        <li>Aguardar 24-48h antes de retomar envios</li>
                        <li>Considerar reduzir volume de mensagens</li>
                      ` : `
                        <li>Reduzir volume de envios de templates</li>
                        <li>Verificar taxa de bloqueio/spam</li>
                        <li>Revisar qualidade das mensagens enviadas</li>
                        <li>Monitorar de perto nas próximas 24h</li>
                      `}
                    </ul>
                  </div>
                </div>
              </div>
            `
          })
        });
        console.log('[CheckQuality] Alert email sent to:', email);
      } catch (emailError) {
        console.error('[CheckQuality] Failed to send alert to:', email, emailError);
      }
    }
  } catch (error) {
    console.error('[CheckQuality] Error sending alerts:', error);
  }
}
