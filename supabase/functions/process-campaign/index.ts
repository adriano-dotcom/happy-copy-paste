import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const WHATSAPP_API_URL = "https://graph.facebook.com/v21.0";

// ===== TIMEZONE UTILITY =====
const BRAZIL_TIMEZONE = 'America/Sao_Paulo';
function toBRT(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('pt-BR', { timeZone: BRAZIL_TIMEZONE });
}

// ===== NAME NORMALIZATION =====
function normalizeFirstName(name: string | null): string {
  if (!name || !name.trim()) return 'Cliente';
  const firstName = name.trim().split(/\s+/)[0];
  if (firstName.length < 3) return firstName;
  return firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const startTime = Date.now();
  const MAX_EXECUTION_TIME = 50000; // 50 seconds

  try {
    console.log(`[Campaign] Starting campaign processor at ${toBRT(new Date())}`);

    // Get WhatsApp credentials
    const { data: settings } = await supabase
      .from('nina_settings')
      .select('whatsapp_access_token, whatsapp_phone_number_id, whatsapp_token_in_vault')
      .maybeSingle();

    if (!settings?.whatsapp_phone_number_id) {
      console.log('[Campaign] WhatsApp not configured');
      return new Response(JSON.stringify({ error: 'WhatsApp not configured', processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get access token from Vault or fallback
    let accessToken = settings.whatsapp_access_token;
    if (settings.whatsapp_token_in_vault) {
      try {
        const { data: vaultToken } = await supabase.rpc('get_vault_secret', { 
          secret_name: 'vault_whatsapp_token' 
        });
        if (vaultToken) accessToken = vaultToken;
      } catch (e) {
        console.log('[Campaign] Vault lookup failed, using table fallback');
      }
    }

    if (!accessToken) {
      return new Response(JSON.stringify({ error: 'WhatsApp token not configured' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check rate limits before processing
    const { data: rateLimitCheck } = await supabase.rpc('check_rate_limit', {
      p_phone_number_id: settings.whatsapp_phone_number_id
    });

    if (rateLimitCheck && !rateLimitCheck[0]?.can_send) {
      console.log(`[Campaign] Rate limit reached: ${rateLimitCheck[0]?.reason}`);
      return new Response(JSON.stringify({ 
        error: 'Rate limit reached',
        reason: rateLimitCheck[0]?.reason,
        wait_seconds: rateLimitCheck[0]?.wait_seconds 
      }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get scheduled campaigns that should start now
    const { data: scheduledCampaigns } = await supabase
      .from('whatsapp_campaigns')
      .select('id')
      .eq('status', 'scheduled')
      .lte('scheduled_at', new Date().toISOString());

    if (scheduledCampaigns && scheduledCampaigns.length > 0) {
      console.log(`[Campaign] Starting ${scheduledCampaigns.length} scheduled campaigns`);
      for (const camp of scheduledCampaigns) {
        await supabase
          .from('whatsapp_campaigns')
          .update({ 
            status: 'running', 
            started_at: new Date().toISOString() 
          })
          .eq('id', camp.id);
      }
    }

    // Get running campaigns
    const { data: campaigns, error: campaignsError } = await supabase
      .from('whatsapp_campaigns')
      .select(`
        *,
        whatsapp_templates (
          name,
          language,
          components
        )
      `)
      .eq('status', 'running')
      .order('last_processed_at', { ascending: true, nullsFirst: true })
      .limit(5);

    if (campaignsError) {
      console.error('[Campaign] Error fetching campaigns:', campaignsError);
      throw campaignsError;
    }

    if (!campaigns || campaigns.length === 0) {
      console.log('[Campaign] No running campaigns');
      return new Response(JSON.stringify({ message: 'No campaigns to process', processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[Campaign] Found ${campaigns.length} running campaigns`);

    let totalProcessed = 0;
    let totalSent = 0;
    let totalFailed = 0;

    for (const campaign of campaigns) {
      // Check time limit
      if (Date.now() - startTime > MAX_EXECUTION_TIME) {
        console.log('[Campaign] Time limit reached, stopping');
        break;
      }

      // Check if campaign should be paused due to failures
      if (campaign.current_failure_streak >= campaign.max_failures_before_pause) {
        console.log(`[Campaign] Campaign ${campaign.id} paused due to ${campaign.current_failure_streak} consecutive failures`);
        await supabase
          .from('whatsapp_campaigns')
          .update({ 
            status: 'paused', 
            paused_at: new Date().toISOString(),
            error_message: `Pausado após ${campaign.current_failure_streak} falhas consecutivas`
          })
          .eq('id', campaign.id);
        continue;
      }

      // Claim batch of contacts to process
      const { data: contacts, error: claimError } = await supabase
        .rpc('claim_campaign_batch', { 
          p_campaign_id: campaign.id,
          p_batch_size: campaign.messages_per_batch || 1
        });

      if (claimError) {
        console.error(`[Campaign] Error claiming batch for campaign ${campaign.id}:`, claimError);
        continue;
      }

      if (!contacts || contacts.length === 0) {
        // Check if campaign is complete
        const { data: remaining } = await supabase
          .from('campaign_contacts')
          .select('id', { count: 'exact', head: true })
          .eq('campaign_id', campaign.id)
          .in('status', ['pending', 'queued']);

        if (!remaining || remaining.length === 0) {
          console.log(`[Campaign] Campaign ${campaign.id} completed`);
          await supabase
            .from('whatsapp_campaigns')
            .update({ 
              status: 'completed', 
              completed_at: new Date().toISOString() 
            })
            .eq('id', campaign.id);
        }
        continue;
      }

      console.log(`[Campaign] Processing ${contacts.length} contacts for campaign ${campaign.id}`);

      const template = campaign.whatsapp_templates;
      if (!template) {
        console.error(`[Campaign] No template found for campaign ${campaign.id}`);
        continue;
      }

      for (const campaignContact of contacts) {
        // Check rate limit again before each send
        const { data: rateCheck } = await supabase.rpc('check_rate_limit', {
          p_phone_number_id: settings.whatsapp_phone_number_id
        });

        if (rateCheck && !rateCheck[0]?.can_send) {
          console.log(`[Campaign] Rate limit hit during processing, stopping`);
          // Reset this contact back to pending
          await supabase
            .from('campaign_contacts')
            .update({ status: 'pending' })
            .eq('id', campaignContact.id);
          break;
        }

        try {
          // Get contact details
          const { data: contact } = await supabase
            .from('contacts')
            .select('phone_number, name, whatsapp_id, is_blocked, blocked_reason')
            .eq('id', campaignContact.contact_id)
            .single();

          if (!contact) {
            throw new Error('Contact not found');
          }

          // Skip duplicate: same template sent to same phone in last 24h
          const { data: recentSend } = await supabase
            .from('campaign_contacts')
            .select('id, contacts!campaign_contacts_contact_id_fkey(phone_number)')
            .eq('contact_id', campaignContact.contact_id)
            .eq('status', 'sent')
            .neq('campaign_id', campaign.id)
            .gte('sent_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            .limit(1);

          // Check if same template was sent
          if (recentSend && recentSend.length > 0) {
            // Verify it's the same template by checking the campaign's template
            const { data: recentCampaign } = await supabase
              .from('campaign_contacts')
              .select('whatsapp_campaigns!campaign_contacts_campaign_id_fkey(template_id)')
              .eq('id', recentSend[0].id)
              .single();

            if (recentCampaign?.whatsapp_campaigns?.template_id === campaign.template_id) {
              console.log(`[Campaign] Skipping duplicate: contact ${campaignContact.contact_id} received same template in last 24h`);
              await supabase
                .from('campaign_contacts')
                .update({ status: 'skipped', error_message: 'duplicate_template_24h' })
                .eq('id', campaignContact.id);
              await supabase.rpc('update_campaign_counters', {
                p_campaign_id: campaign.id,
                p_skipped: 1
              });
              totalProcessed++;
              continue;
            }
          }

          // Skip blocked contacts (no WhatsApp on number)
          if (contact.is_blocked) {
            console.log(`[Campaign] Skipping blocked contact ${campaignContact.contact_id}: ${contact.blocked_reason}`);
            await supabase
              .from('campaign_contacts')
              .update({ status: 'skipped', error_message: contact.blocked_reason || 'contact_blocked' })
              .eq('id', campaignContact.id);
            await supabase.rpc('update_campaign_counters', {
              p_campaign_id: campaign.id,
              p_skipped: 1
            });
            totalProcessed++;
            continue;
          }

          const phoneNumber = contact.phone_number.replace(/\D/g, '');

          // Build template payload
          const components: any[] = [];
          const templateVars = campaign.template_variables || {};

          // Process header variables
          const headerComponent = template.components?.find((c: any) => c.type === 'HEADER');
          const fullContactName = (contact.name || '').trim();
          const normalizeIfName = (v: string) => {
            if (fullContactName && v.trim().toLowerCase() === fullContactName.toLowerCase()) {
              return normalizeFirstName(contact.name);
            }
            return v;
          };
          if (headerComponent?.text) {
            const headerMatches = [...headerComponent.text.matchAll(/\{\{(\d+)\}\}/g)];
            if (headerMatches.length > 0) {
              const headerParams = headerMatches.map((_, i) => {
                // Header vars always normalized (almost always a name)
                const varValue = normalizeFirstName(templateVars[`header_${i + 1}`] || contact.name || 'Cliente');
                return { type: 'text', text: varValue };
              });
              components.push({ type: 'header', parameters: headerParams });
            }
          }

          // Process body variables
          const bodyComponent = template.components?.find((c: any) => c.type === 'BODY');
          if (bodyComponent?.text) {
            const bodyMatches = [...bodyComponent.text.matchAll(/\{\{(\d+)\}\}/g)];
            if (bodyMatches.length > 0) {
              const bodyParams = bodyMatches.map((_, i) => {
                // Body vars: normalize defensively (only if value matches full contact name)
              const rawValue = templateVars[`body_${i + 1}`] || contact.company || contact.name || 'Cliente';
                const varValue = normalizeIfName(rawValue);
                return { type: 'text', text: varValue };
              });
              components.push({ type: 'body', parameters: bodyParams });
            }
          }

          const payload: any = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: phoneNumber,
            type: 'template',
            template: {
              name: template.name,
              language: { code: template.language || 'pt_BR' }
            }
          };

          if (components.length > 0) {
            payload.template.components = components;
          }

          // Send via WhatsApp API
          const waResponse = await fetch(
            `${WHATSAPP_API_URL}/${settings.whatsapp_phone_number_id}/messages`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(payload),
            }
          );

          const waData = await waResponse.json();

          if (!waResponse.ok) {
            const errCode = waData.error?.code;
            const errMsg = waData.error?.message || 'WhatsApp API error';
            const err = new Error(`[${errCode}] ${errMsg}`);
            (err as any).waErrorCode = errCode;
            throw err;
          }

          const whatsappMessageId = waData.messages?.[0]?.id;

          // Get or create conversation
          let conversationId = campaignContact.conversation_id;
          if (!conversationId) {
            const { data: existingConv } = await supabase
              .from('conversations')
              .select('id')
              .eq('contact_id', campaignContact.contact_id)
              .maybeSingle();

            if (existingConv) {
              conversationId = existingConv.id;
              // Garantir que a conversa está ativa e com metadata correto para roteamento
              await supabase
                .from('conversations')
                .update({
                  status: 'nina',
                  is_active: true,
                  metadata: {
                    origin: campaign.is_prospecting ? 'prospeccao' : 'campaign',
                    campaign_id: campaign.id,
                    is_prospecting: campaign.is_prospecting
                  }
                })
                .eq('id', conversationId);
            } else {
              const { data: newConv } = await supabase
                .from('conversations')
                .insert({
                  contact_id: campaignContact.contact_id,
                  status: 'nina',
                  is_active: true,
                  metadata: {
                    origin: campaign.is_prospecting ? 'prospeccao' : 'campaign',
                    campaign_id: campaign.id,
                    is_prospecting: campaign.is_prospecting
                  }
                })
                .select('id')
                .single();
              conversationId = newConv?.id;
            }
          }

          // Create message record
          if (conversationId) {
            let messageContent = bodyComponent?.text || `[Template: ${template.name}]`;
            // Replace body variables using the same values sent to the API
            if (bodyComponent?.text) {
              const bodyMatches = [...bodyComponent.text.matchAll(/\{\{(\d+)\}\}/g)];
              bodyMatches.forEach((_, i) => {
                const rawValue = templateVars[`body_${i + 1}`] || contact.company || contact.name || 'Cliente';
                const fullName = (contact.name || '').trim();
                const varValue = (fullName && rawValue.trim().toLowerCase() === fullName.toLowerCase())
                  ? normalizeFirstName(contact.name)
                  : rawValue;
                messageContent = messageContent.replace(`{{${i + 1}}}`, varValue);
              });
            }

            await supabase.from('messages').insert({
              conversation_id: conversationId,
              content: messageContent,
              from_type: 'nina',
              type: 'text',
              status: 'sent',
              whatsapp_message_id: whatsappMessageId,
              metadata: {
                is_template: true,
                template_name: template.name,
                campaign_id: campaign.id,
                is_prospecting: campaign.is_prospecting
              }
            });

            // Update conversation
            await supabase
              .from('conversations')
              .update({ 
                last_message_at: new Date().toISOString(),
                whatsapp_window_start: new Date().toISOString()
              })
              .eq('id', conversationId);
          }

          // Create deal if prospecting
          if (campaign.is_prospecting && campaign.target_pipeline_id && campaign.target_stage_id) {
            const { data: existingDeal } = await supabase
              .from('deals')
              .select('id')
              .eq('contact_id', campaignContact.contact_id)
              .eq('pipeline_id', campaign.target_pipeline_id)
              .maybeSingle();

            if (!existingDeal) {
              const { data: newDeal } = await supabase
                .from('deals')
                .insert({
                  contact_id: campaignContact.contact_id,
                  title: contact.name || 'Lead Prospecção',
                  stage_id: campaign.target_stage_id,
                  pipeline_id: campaign.target_pipeline_id,
                  priority: 'medium'
                })
                .select('id')
                .single();

              if (newDeal) {
                await supabase
                  .from('campaign_contacts')
                  .update({ deal_id: newDeal.id })
                  .eq('id', campaignContact.id);
              }
            }
          }

          // Update campaign contact status
          await supabase
            .from('campaign_contacts')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              whatsapp_message_id: whatsappMessageId,
              conversation_id: conversationId
            })
            .eq('id', campaignContact.id);

          // Increment rate limit counter
          await supabase.rpc('increment_rate_limit', {
            p_phone_number_id: settings.whatsapp_phone_number_id,
            p_count: 1
          });

          // Update campaign counters
          await supabase.rpc('update_campaign_counters', {
            p_campaign_id: campaign.id,
            p_sent: 1
          });

          totalSent++;
          totalProcessed++;

          console.log(`[Campaign] Sent to ${phoneNumber} (${campaign.name})`);

          // Respect interval between messages
          if (campaign.interval_seconds > 0 && contacts.indexOf(campaignContact) < contacts.length - 1) {
            const waitTime = Math.min(campaign.interval_seconds * 1000, 5000); // Max 5s wait per message
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          const is131049 = errorMessage.includes('131049') || errorMessage.includes('healthy ecosystem');
          console.error(`[Campaign] Error sending to contact ${campaignContact.contact_id} (131049: ${is131049}):`, error);

          if (is131049) {
            // === 131049 MITIGATION: Skip + Retry 24h ===
            console.log(`[Campaign] 131049 detected — skipping contact ${campaignContact.contact_id}, retry in 24h`);

            // Mark as skipped (not failed) with retry scheduled
            await supabase
              .from('campaign_contacts')
              .update({
                status: 'pending',
                error_message: 'meta_marketing_limit_131049',
                scheduled_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                retry_count: (campaignContact.retry_count || 0) + 1
              })
              .eq('id', campaignContact.id);

            // Increment skipped (NOT failed) — does NOT affect failure streak
            await supabase.rpc('update_campaign_counters', {
              p_campaign_id: campaign.id,
              p_skipped: 1
            });

            // Track 131049 in metrics
            try {
              await supabase
                .from('whatsapp_metrics')
                .upsert({
                  phone_number_id: settings.whatsapp_phone_number_id,
                  metric_date: new Date().toISOString().split('T')[0],
                  metric_hour: new Date().getHours(),
                  error_131049_count: 1
                }, {
                  onConflict: 'phone_number_id,metric_date,metric_hour'
                });
            } catch (_) { /* ignore */ }

            // === ADAPTIVE CADENCE: slow down after 3+ consecutive 131049 ===
            if (!campaign._consecutive131049) campaign._consecutive131049 = 0;
            campaign._consecutive131049++;

            if (campaign._consecutive131049 >= 3) {
              const newInterval = Math.min(300, Math.ceil((campaign.interval_seconds || 60) * 1.5));
              if (newInterval !== campaign.interval_seconds) {
                console.log(`[Campaign] Adaptive cadence: increasing interval from ${campaign.interval_seconds}s to ${newInterval}s`);
                await supabase
                  .from('whatsapp_campaigns')
                  .update({ interval_seconds: newInterval })
                  .eq('id', campaign.id);
                campaign.interval_seconds = newInterval;
              }
            }
          } else {
            // Regular error handling (non-131049)
            await supabase
              .from('campaign_contacts')
              .update({
                status: 'failed',
                error_message: errorMessage,
                retry_count: (campaignContact.retry_count || 0) + 1
              })
              .eq('id', campaignContact.id);

            await supabase.rpc('update_campaign_counters', {
              p_campaign_id: campaign.id,
              p_failed: 1
            });

            // Reset adaptive counter on non-131049 error
            campaign._consecutive131049 = 0;

            // Track error in metrics
            try {
              await supabase
                .from('whatsapp_metrics')
                .upsert({
                  phone_number_id: settings.whatsapp_phone_number_id,
                  metric_date: new Date().toISOString().split('T')[0],
                  metric_hour: new Date().getHours(),
                  messages_failed: 1
                }, {
                  onConflict: 'phone_number_id,metric_date,metric_hour'
                });
            } catch (metricsError) {
              console.log('[Campaign] Failed to update metrics:', metricsError);
            }
          }

          totalFailed++;
          totalProcessed++;
        }
      }

      // Update campaign last processed time
      await supabase
        .from('whatsapp_campaigns')
        .update({ last_processed_at: new Date().toISOString() })
        .eq('id', campaign.id);
    }

    const executionTime = Date.now() - startTime;
    console.log(`[Campaign] Completed: processed ${totalProcessed}, sent ${totalSent}, failed ${totalFailed} in ${executionTime}ms`);

    return new Response(JSON.stringify({
      processed: totalProcessed,
      sent: totalSent,
      failed: totalFailed,
      executionTime
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[Campaign] Fatal error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
