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
  automation_type: 'template' | 'free_text';
  template_id: string | null;
  template_variables: Record<string, string>;
  free_text_message: string | null;
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
}

// Check if WhatsApp 24h window is still open
function isWindowOpen(windowStart: string | null): boolean {
  if (!windowStart) return false;
  const start = new Date(windowStart);
  const now = new Date();
  const hoursSinceStart = (now.getTime() - start.getTime()) / (1000 * 60 * 60);
  return hoursSinceStart < 24;
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
        };

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