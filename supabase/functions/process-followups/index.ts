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
  template_id: string;
  template_variables: Record<string, string>;
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
  contact_name: string | null;
  contact_call_name: string | null;
  contact_company: string | null;
  contact_phone: string;
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
      console.log(`[process-followups] Processing automation: ${automation.name}`);

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

      // Get template info
      if (!automation.template_id) {
        console.log(`[process-followups] No template configured, skipping`);
        results.push({ automation: automation.name, sent: 0, skipped: 0, failed: 0 });
        continue;
      }

      const { data: template, error: templateError } = await supabase
        .from('whatsapp_templates')
        .select('*')
        .eq('id', automation.template_id)
        .eq('status', 'APPROVED')
        .maybeSingle();

      if (templateError || !template) {
        console.log(`[process-followups] Template not found or not approved, skipping`);
        results.push({ automation: automation.name, sent: 0, skipped: 0, failed: 0 });
        continue;
      }

      // Calculate the cutoff time
      const cutoffTime = new Date(now.getTime() - automation.hours_without_response * 60 * 60 * 1000);
      const cooldownTime = new Date(now.getTime() - automation.cooldown_hours * 60 * 60 * 1000);

      // Find eligible conversations
      // Criteria:
      // 1. Active conversation
      // 2. Status in allowed statuses
      // 3. Last message older than X hours
      // 4. Last message was NOT from user (system waiting for response)
      // 5. No recent follow-up from this automation within cooldown period
      // 6. Not exceeded max attempts

      let query = supabase
        .from('conversations')
        .select(`
          id,
          contact_id,
          last_message_at,
          status,
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
          contact_name: (convRaw.contacts as any)?.name,
          contact_call_name: (convRaw.contacts as any)?.call_name,
          contact_company: (convRaw.contacts as any)?.company,
          contact_phone: (convRaw.contacts as any)?.phone_number,
        };

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
        const hoursWaited = (now.getTime() - new Date(conv.last_message_at).getTime()) / (1000 * 60 * 60);

        // Build template variables
        const variables: string[] = [];
        const varConfig = automation.template_variables || {};
        
        // Map variable positions to contact data
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

        // Send template via send-whatsapp-template function
        try {
          const sendResponse = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp-template`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              contact_id: conv.contact_id,
              conversation_id: conv.id,
              template_name: template.name,
              language: template.language || 'pt_BR',
              variables: variables.length > 0 ? variables : undefined,
            }),
          });

          const sendResult = await sendResponse.json();

          if (!sendResponse.ok) {
            console.error(`[process-followups] Failed to send template:`, sendResult);
            
            // Log failure
            await supabase.from('followup_logs').insert({
              automation_id: automation.id,
              conversation_id: conv.id,
              contact_id: conv.contact_id,
              template_name: template.name,
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
            template_name: template.name,
            status: 'sent',
            hours_waited: hoursWaited,
          });

          console.log(`[process-followups] Sent follow-up to conversation ${conv.id}`);
          sent++;
          totalProcessed++;

        } catch (sendError) {
          console.error(`[process-followups] Error sending template:`, sendError);
          
          await supabase.from('followup_logs').insert({
            automation_id: automation.id,
            conversation_id: conv.id,
            contact_id: conv.contact_id,
            template_name: template.name,
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
