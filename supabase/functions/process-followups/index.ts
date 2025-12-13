import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Automation {
  id: string;
  name: string;
  hours_without_response: number;
  time_unit: 'hours' | 'minutes';
  automation_type: 'template' | 'free_text' | 'window_expiring';
  template_id: string | null;
  template_variables: Record<string, string>;
  free_text_message: string | null;
  agent_messages: Record<string, string> | null;
  within_window_only: boolean;
  conversation_statuses: string[];
  pipeline_ids: string[] | null;
  tags: string[] | null;
  max_attempts: number;
  cooldown_hours: number;
  active_hours_start: string;
  active_hours_end: string;
  active_days: number[];
  is_active: boolean;
  minutes_before_expiry: number;
  only_if_no_client_response: boolean;
}

interface EligibleConversation {
  id: string;
  contact_id: string;
  last_message_at: string;
  status: string;
  whatsapp_window_start: string | null;
  contact_name: string | null;
  contact_call_name: string | null;
  contact_company: string | null;
  contact_phone: string;
  current_agent_id: string | null;
  pipeline_id: string | null;
}

// Check if WhatsApp 24h window is still open
function isWindowOpen(windowStart: string | null): boolean {
  if (!windowStart) return false;
  const start = new Date(windowStart);
  const now = new Date();
  const hoursSinceStart = (now.getTime() - start.getTime()) / (1000 * 60 * 60);
  return hoursSinceStart < 24;
}

// Get minutes remaining until window expires
function getWindowMinutesRemaining(windowStart: string | null): number {
  if (!windowStart) return -1;
  const start = new Date(windowStart);
  const now = new Date();
  const expiresAt = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const minutesRemaining = (expiresAt.getTime() - now.getTime()) / (1000 * 60);
  return minutesRemaining;
}

// Replace variables in message template
function replaceVariables(message: string, conv: EligibleConversation): string {
  const name = conv.contact_name || conv.contact_call_name || 'Cliente';
  const callName = conv.contact_call_name || conv.contact_name || 'Cliente';
  const company = conv.contact_company || '';
  
  return message
    .replace(/{nome}/gi, name)
    .replace(/{name}/gi, name)
    .replace(/{call_name}/gi, callName)
    .replace(/{empresa}/gi, company)
    .replace(/{company}/gi, company);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[process-followups] Starting follow-up processing...');

    // Get current time in Brazil timezone
    const now = new Date();
    const brazilTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const currentHour = brazilTime.getHours();
    const currentMinute = brazilTime.getMinutes();
    const currentTimeStr = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;
    const currentDay = brazilTime.getDay(); // 0 = Sunday, 1 = Monday, etc.

    console.log(`[process-followups] Current time in Brazil: ${currentTimeStr}, day: ${currentDay}`);

    // Fetch active automations
    const { data: automations, error: automationsError } = await supabase
      .from('followup_automations')
      .select('*')
      .eq('is_active', true);

    if (automationsError) {
      console.error('[process-followups] Error fetching automations:', automationsError);
      throw automationsError;
    }

    if (!automations || automations.length === 0) {
      console.log('[process-followups] No active automations found');
      return new Response(JSON.stringify({ processed: 0, message: 'No active automations' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[process-followups] Found ${automations.length} active automations`);

    let totalProcessed = 0;
    const results: { automation: string; sent: number; skipped: number; failed: number }[] = [];

    for (const automation of automations as Automation[]) {
      console.log(`[process-followups] Processing automation: ${automation.name} (type: ${automation.automation_type})`);

      // Check if current time is within active hours
      const startTime = automation.active_hours_start;
      const endTime = automation.active_hours_end;
      
      if (currentTimeStr < startTime || currentTimeStr > endTime) {
        console.log(`[process-followups] Outside active hours (${startTime}-${endTime}), skipping`);
        results.push({ automation: automation.name, sent: 0, skipped: 0, failed: 0 });
        continue;
      }

      // Check if current day is active
      if (!automation.active_days.includes(currentDay)) {
        console.log(`[process-followups] Day ${currentDay} not in active days, skipping`);
        results.push({ automation: automation.name, sent: 0, skipped: 0, failed: 0 });
        continue;
      }

      // Handle window_expiring automation type
      if (automation.automation_type === 'window_expiring') {
        const windowExpiryResult = await processWindowExpiringAutomation(supabase, supabaseUrl, supabaseServiceKey, automation, now);
        results.push(windowExpiryResult);
        totalProcessed += windowExpiryResult.sent;
        continue;
      }

      // For template automations, verify template exists
      let template = null;
      if (automation.automation_type === 'template') {
        if (!automation.template_id) {
          console.log(`[process-followups] No template configured for template automation, skipping`);
          results.push({ automation: automation.name, sent: 0, skipped: 0, failed: 0 });
          continue;
        }

        const { data: templateData, error: templateError } = await supabase
          .from('whatsapp_templates')
          .select('*')
          .eq('id', automation.template_id)
          .eq('status', 'APPROVED')
          .maybeSingle();

        if (templateError || !templateData) {
          console.log(`[process-followups] Template not found or not approved, skipping`);
          results.push({ automation: automation.name, sent: 0, skipped: 0, failed: 0 });
          continue;
        }
        template = templateData;
      }

      // For free_text automations, verify message exists
      if (automation.automation_type === 'free_text' && !automation.free_text_message) {
        console.log(`[process-followups] No free text message configured, skipping`);
        results.push({ automation: automation.name, sent: 0, skipped: 0, failed: 0 });
        continue;
      }

      // Calculate the cutoff time based on time_unit
      const timeMultiplier = automation.time_unit === 'minutes' ? 60 * 1000 : 60 * 60 * 1000;
      const cutoffTime = new Date(now.getTime() - automation.hours_without_response * timeMultiplier);
      const cooldownTime = new Date(now.getTime() - automation.cooldown_hours * 60 * 60 * 1000);

      // Find eligible conversations
      let query = supabase
        .from('conversations')
        .select(`
          id,
          contact_id,
          last_message_at,
          status,
          whatsapp_window_start,
          contacts!inner (
            name,
            call_name,
            company,
            phone_number
          )
        `)
        .eq('is_active', true)
        .in('status', automation.conversation_statuses)
        .lt('last_message_at', cutoffTime.toISOString());

      const { data: conversationsRaw, error: convError } = await query;

      if (convError) {
        console.error(`[process-followups] Error fetching conversations:`, convError);
        results.push({ automation: automation.name, sent: 0, skipped: 0, failed: 0 });
        continue;
      }

      if (!conversationsRaw || conversationsRaw.length === 0) {
        console.log(`[process-followups] No eligible conversations found`);
        results.push({ automation: automation.name, sent: 0, skipped: 0, failed: 0 });
        continue;
      }

      console.log(`[process-followups] Found ${conversationsRaw.length} potential conversations`);

      let sent = 0;
      let skipped = 0;
      let failed = 0;

      for (const convRaw of conversationsRaw) {
        const conv: EligibleConversation = {
          id: convRaw.id,
          contact_id: convRaw.contact_id,
          last_message_at: convRaw.last_message_at,
          status: convRaw.status,
          whatsapp_window_start: convRaw.whatsapp_window_start,
          contact_name: (convRaw.contacts as any)?.name,
          contact_call_name: (convRaw.contacts as any)?.call_name,
          contact_company: (convRaw.contacts as any)?.company,
          contact_phone: (convRaw.contacts as any)?.phone_number,
          current_agent_id: null,
          pipeline_id: null,
        };

        // Check if deal is lost (skip if lost_at is set or in "Perdido" stage)
        const { data: deal } = await supabase
          .from('deals')
          .select(`
            id,
            lost_at,
            stage_id,
            pipeline_stages!inner(title)
          `)
          .eq('contact_id', conv.contact_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (deal?.lost_at || (deal?.pipeline_stages as any)?.title === 'Perdido') {
          console.log(`[process-followups] Deal is lost for conversation ${conv.id}, skipping`);
          skipped++;
          continue;
        }

        // Check within_window_only constraint
        if (automation.within_window_only) {
          if (!isWindowOpen(conv.whatsapp_window_start)) {
            console.log(`[process-followups] 24h window closed for conversation ${conv.id}, skipping (within_window_only=true)`);
            skipped++;
            continue;
          }
        }

        // For free_text automations, window MUST be open (WhatsApp requirement)
        if (automation.automation_type === 'free_text') {
          if (!isWindowOpen(conv.whatsapp_window_start)) {
            console.log(`[process-followups] 24h window closed for conversation ${conv.id}, cannot send free text message`);
            skipped++;
            continue;
          }
        }

        // Check if last message was from user (skip if user sent last message)
        const { data: lastMessage } = await supabase
          .from('messages')
          .select('from_type')
          .eq('conversation_id', conv.id)
          .order('sent_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastMessage?.from_type === 'user') {
          console.log(`[process-followups] Last message from user, skipping conversation ${conv.id}`);
          skipped++;
          continue;
        }

        // Check previous follow-ups from this automation
        const { data: previousLogs, error: logsError } = await supabase
          .from('followup_logs')
          .select('id, created_at')
          .eq('automation_id', automation.id)
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: false });

        if (logsError) {
          console.error(`[process-followups] Error checking logs:`, logsError);
          failed++;
          continue;
        }

        // Check max attempts
        if (previousLogs && previousLogs.length >= automation.max_attempts) {
          console.log(`[process-followups] Max attempts reached for conversation ${conv.id}`);
          skipped++;
          continue;
        }

        // Check cooldown
        if (previousLogs && previousLogs.length > 0) {
          const lastLog = previousLogs[0];
          if (new Date(lastLog.created_at) > cooldownTime) {
            console.log(`[process-followups] Within cooldown period for conversation ${conv.id}`);
            skipped++;
            continue;
          }
        }

        // Calculate hours waited
        const msWaited = now.getTime() - new Date(conv.last_message_at).getTime();
        const hoursWaited = msWaited / (1000 * 60 * 60);

        try {
          if (automation.automation_type === 'free_text') {
            // Send free text message directly via send_queue
            const messageContent = replaceVariables(automation.free_text_message!, conv);
            
            console.log(`[process-followups] Sending free text message to ${conv.id}: "${messageContent.substring(0, 50)}..."`);

            // Insert into send_queue
            const { data: queueItem, error: queueError } = await supabase
              .from('send_queue')
              .insert({
                contact_id: conv.contact_id,
                conversation_id: conv.id,
                message_type: 'text',
                from_type: 'nina',
                content: messageContent,
                status: 'pending',
                priority: 2,
              })
              .select('id')
              .single();

            if (queueError) {
              console.error(`[process-followups] Failed to queue free text message:`, queueError);
              
              await supabase.from('followup_logs').insert({
                automation_id: automation.id,
                conversation_id: conv.id,
                contact_id: conv.contact_id,
                template_name: `[Texto Livre] ${automation.name}`,
                status: 'failed',
                error_message: queueError.message,
                hours_waited: hoursWaited,
              });
              
              failed++;
              continue;
            }

            // Log success
            await supabase.from('followup_logs').insert({
              automation_id: automation.id,
              conversation_id: conv.id,
              contact_id: conv.contact_id,
              template_name: `[Texto Livre] ${automation.name}`,
              status: 'sent',
              hours_waited: hoursWaited,
            });

            console.log(`[process-followups] Queued free text follow-up for conversation ${conv.id}`);
            
            // Trigger whatsapp-sender to process the queue immediately
            try {
              const senderUrl = `${supabaseUrl}/functions/v1/whatsapp-sender`;
              fetch(senderUrl, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${supabaseServiceKey}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ triggered_by: 'process-followups' })
              }).catch(err => console.error('[process-followups] Error triggering whatsapp-sender:', err));
              console.log(`[process-followups] Triggered whatsapp-sender for queued message`);
            } catch (e) {
              console.error('[process-followups] Failed to trigger whatsapp-sender:', e);
            }
            
            sent++;
            totalProcessed++;

          } else {
            // Send template via send-whatsapp-template function
            const variables: string[] = [];
            const varConfig = automation.template_variables || {};
            
            for (let i = 1; i <= 10; i++) {
              const key = i.toString();
              if (varConfig[key]) {
                let value = '';
                switch (varConfig[key]) {
                  case 'contact.name':
                    value = conv.contact_name || conv.contact_call_name || 'Cliente';
                    break;
                  case 'contact.call_name':
                    value = conv.contact_call_name || conv.contact_name || 'Cliente';
                    break;
                  case 'contact.company':
                    value = conv.contact_company || '';
                    break;
                  case 'hours_waiting':
                    value = Math.round(hoursWaited).toString();
                    break;
                  default:
                    value = varConfig[key];
                }
                variables.push(value);
              }
            }

            const sendResponse = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp-template`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify({
                contact_id: conv.contact_id,
                conversation_id: conv.id,
                template_name: template!.name,
                language: template!.language || 'pt_BR',
                variables: variables.length > 0 ? variables : undefined,
              }),
            });

            const sendResult = await sendResponse.json();

            if (!sendResponse.ok) {
              console.error(`[process-followups] Failed to send template:`, sendResult);
              
              await supabase.from('followup_logs').insert({
                automation_id: automation.id,
                conversation_id: conv.id,
                contact_id: conv.contact_id,
                template_name: template!.name,
                status: 'failed',
                error_message: sendResult.error || 'Unknown error',
                hours_waited: hoursWaited,
              });
              
              failed++;
              continue;
            }

            // Log success
            await supabase.from('followup_logs').insert({
              automation_id: automation.id,
              conversation_id: conv.id,
              contact_id: conv.contact_id,
              message_id: sendResult.message_id,
              template_name: template!.name,
              status: 'sent',
              hours_waited: hoursWaited,
            });

            console.log(`[process-followups] Sent template follow-up to conversation ${conv.id}`);
            sent++;
            totalProcessed++;
          }

        } catch (sendError) {
          console.error(`[process-followups] Error sending follow-up:`, sendError);
          
          await supabase.from('followup_logs').insert({
            automation_id: automation.id,
            conversation_id: conv.id,
            contact_id: conv.contact_id,
            template_name: automation.automation_type === 'template' ? template?.name : `[Texto Livre] ${automation.name}`,
            status: 'failed',
            error_message: String(sendError),
            hours_waited: hoursWaited,
          });
          
          failed++;
        }
      }

      results.push({ automation: automation.name, sent, skipped, failed });
      console.log(`[process-followups] Automation ${automation.name}: sent=${sent}, skipped=${skipped}, failed=${failed}`);
    }

    console.log(`[process-followups] Total processed: ${totalProcessed}`);

    return new Response(JSON.stringify({ 
      processed: totalProcessed, 
      results,
      timestamp: now.toISOString(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[process-followups] Error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Process window expiring automations
async function processWindowExpiringAutomation(
  supabase: any,
  supabaseUrl: string,
  supabaseServiceKey: string,
  automation: Automation,
  now: Date
): Promise<{ automation: string; sent: number; skipped: number; failed: number }> {
  console.log(`[process-followups] Processing window_expiring automation: ${automation.name}`);
  
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  
  const minutesBeforeExpiry = automation.minutes_before_expiry || 10;
  
  // Find conversations with windows expiring within the configured margin
  const { data: conversationsRaw, error: convError } = await supabase
    .from('conversations')
    .select(`
      id,
      contact_id,
      last_message_at,
      status,
      whatsapp_window_start,
      current_agent_id,
      contacts!inner (
        name,
        call_name,
        company,
        phone_number
      )
    `)
    .eq('is_active', true)
    .in('status', automation.conversation_statuses)
    .not('whatsapp_window_start', 'is', null);

  if (convError) {
    console.error(`[process-followups] Error fetching conversations:`, convError);
    return { automation: automation.name, sent: 0, skipped: 0, failed: 0 };
  }

  if (!conversationsRaw || conversationsRaw.length === 0) {
    console.log(`[process-followups] No conversations with active windows found`);
    return { automation: automation.name, sent: 0, skipped: 0, failed: 0 };
  }

  console.log(`[process-followups] Found ${conversationsRaw.length} conversations with active windows`);

  // Get agent-to-pipeline mapping for fallback
  const { data: pipelines } = await supabase
    .from('pipelines')
    .select('id, agent_id')
    .not('agent_id', 'is', null);
  
  const pipelineAgentMap: Record<string, string> = {};
  if (pipelines) {
    for (const p of pipelines) {
      if (p.agent_id) pipelineAgentMap[p.id] = p.agent_id;
    }
  }

  for (const convRaw of conversationsRaw) {
    // Try to get agent from conversation or via pipeline through deal
    let agentId = convRaw.current_agent_id;
    let pipelineIdFromDeal: string | null = null;
    let isDealLost = false;
    
    // Check deal status and get agent via pipeline if needed
    const { data: deal } = await supabase
      .from('deals')
      .select(`
        pipeline_id,
        lost_at,
        pipeline_stages!inner(title)
      `)
      .eq('contact_id', convRaw.contact_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    // Skip if deal is lost
    if (deal?.lost_at || (deal?.pipeline_stages as any)?.title === 'Perdido') {
      console.log(`[process-followups] Deal is lost for conversation ${convRaw.id}, skipping window expiry`);
      skipped++;
      continue;
    }
    
    // If no agent on conversation, try to find via deal -> pipeline -> agent
    if (!agentId && deal?.pipeline_id) {
      pipelineIdFromDeal = deal.pipeline_id;
      if (pipelineAgentMap[deal.pipeline_id]) {
        agentId = pipelineAgentMap[deal.pipeline_id];
      }
    }

    const conv: EligibleConversation = {
      id: convRaw.id,
      contact_id: convRaw.contact_id,
      last_message_at: convRaw.last_message_at,
      status: convRaw.status,
      whatsapp_window_start: convRaw.whatsapp_window_start,
      contact_name: (convRaw.contacts as any)?.name,
      contact_call_name: (convRaw.contacts as any)?.call_name,
      contact_company: (convRaw.contacts as any)?.company,
      contact_phone: (convRaw.contacts as any)?.phone_number,
      current_agent_id: agentId,
      pipeline_id: pipelineIdFromDeal,
    };

    // Check if window is expiring within the configured margin
    const minutesRemaining = getWindowMinutesRemaining(conv.whatsapp_window_start);
    
    // Window must be expiring soon (within margin) but not already expired
    if (minutesRemaining < 0 || minutesRemaining > minutesBeforeExpiry) {
      console.log(`[process-followups] Window for ${conv.id} has ${minutesRemaining.toFixed(1)} min remaining, not within ${minutesBeforeExpiry} min margin, skipping`);
      skipped++;
      continue;
    }

    console.log(`[process-followups] Window for ${conv.id} expires in ${minutesRemaining.toFixed(1)} min - within margin!`);

    // Check if client responded during this window period
    if (automation.only_if_no_client_response) {
      const { data: clientMessages, error: msgError } = await supabase
        .from('messages')
        .select('id')
        .eq('conversation_id', conv.id)
        .eq('from_type', 'user')
        .gte('sent_at', conv.whatsapp_window_start)
        .limit(2); // Just need to know if there's more than the initial message

      if (msgError) {
        console.error(`[process-followups] Error checking client messages:`, msgError);
        failed++;
        continue;
      }

      // If client sent messages after the window started (beyond the initial message that opened the window)
      // We check for > 1 because the first message is what opened the window
      const hasClientResponse = clientMessages && clientMessages.length > 1;
      
      if (hasClientResponse) {
        console.log(`[process-followups] Client responded during window for ${conv.id}, skipping (only_if_no_client_response=true)`);
        skipped++;
        continue;
      }
    }

    // Check previous follow-ups from this automation (max attempts)
    const { data: previousLogs, error: logsError } = await supabase
      .from('followup_logs')
      .select('id, created_at')
      .eq('automation_id', automation.id)
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: false });

    if (logsError) {
      console.error(`[process-followups] Error checking logs:`, logsError);
      failed++;
      continue;
    }

    if (previousLogs && previousLogs.length >= automation.max_attempts) {
      console.log(`[process-followups] Max attempts reached for conversation ${conv.id}`);
      skipped++;
      continue;
    }

    // Check cooldown
    const cooldownTime = new Date(now.getTime() - automation.cooldown_hours * 60 * 60 * 1000);
    if (previousLogs && previousLogs.length > 0) {
      const lastLog = previousLogs[0];
      if (new Date(lastLog.created_at) > cooldownTime) {
        console.log(`[process-followups] Within cooldown period for conversation ${conv.id}`);
        skipped++;
        continue;
      }
    }

    // Calculate hours waited
    const msWaited = now.getTime() - new Date(conv.last_message_at).getTime();
    const hoursWaited = msWaited / (1000 * 60 * 60);

    try {
      // Select message based on agent
      let rawMessage = automation.free_text_message || 'Olá {nome}! Caso precise de ajuda, estou aqui. Me responde qualquer coisa pra gente continuar a conversa!';
      
      // Check if there's an agent-specific message
      if (conv.current_agent_id && automation.agent_messages && automation.agent_messages[conv.current_agent_id]) {
        rawMessage = automation.agent_messages[conv.current_agent_id];
        console.log(`[process-followups] Using agent-specific message for agent ${conv.current_agent_id}`);
      } else if (conv.current_agent_id) {
        console.log(`[process-followups] No agent-specific message for agent ${conv.current_agent_id}, using fallback`);
      }
      
      const messageContent = replaceVariables(rawMessage, conv);
      
      console.log(`[process-followups] Sending window expiring message to ${conv.id}: "${messageContent.substring(0, 50)}..."`);

      // Insert into send_queue
      const { error: queueError } = await supabase
        .from('send_queue')
        .insert({
          contact_id: conv.contact_id,
          conversation_id: conv.id,
          message_type: 'text',
          from_type: 'nina',
          content: messageContent,
          status: 'pending',
          priority: 3, // Higher priority for time-sensitive messages
        });

      if (queueError) {
        console.error(`[process-followups] Failed to queue window expiring message:`, queueError);
        
        await supabase.from('followup_logs').insert({
          automation_id: automation.id,
          conversation_id: conv.id,
          contact_id: conv.contact_id,
          template_name: `[Última Chance] ${automation.name}`,
          status: 'failed',
          error_message: queueError.message,
          hours_waited: hoursWaited,
        });
        
        failed++;
        continue;
      }

      // Log success
      await supabase.from('followup_logs').insert({
        automation_id: automation.id,
        conversation_id: conv.id,
        contact_id: conv.contact_id,
        template_name: `[Última Chance] ${automation.name}`,
        status: 'sent',
        hours_waited: hoursWaited,
      });

      console.log(`[process-followups] Queued window expiring message for conversation ${conv.id} (${minutesRemaining.toFixed(1)} min before expiry)`);
      sent++;

    } catch (sendError) {
      console.error(`[process-followups] Error sending window expiring message:`, sendError);
      
      await supabase.from('followup_logs').insert({
        automation_id: automation.id,
        conversation_id: conv.id,
        contact_id: conv.contact_id,
        template_name: `[Última Chance] ${automation.name}`,
        status: 'failed',
        error_message: String(sendError),
        hours_waited: hoursWaited,
      });
      
      failed++;
    }
  }

  console.log(`[process-followups] Window expiring automation ${automation.name}: sent=${sent}, skipped=${skipped}, failed=${failed}`);
  return { automation: automation.name, sent, skipped, failed };
}

// Note: EligibleConversation interface is defined at the top of the file