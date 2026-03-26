import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { message_ids } = await req.json();
  const results: any[] = [];

  for (const msgId of message_ids) {
    try {
      // Get original message metadata
      const { data: msg } = await supabase
        .from('messages')
        .select('id, conversation_id, metadata, status')
        .eq('id', msgId)
        .single();

      if (!msg) { results.push({ id: msgId, success: false, error: 'not_found' }); continue; }

      // Get contact_id from conversation
      const { data: conv } = await supabase
        .from('conversations')
        .select('contact_id')
        .eq('id', msg.conversation_id)
        .single();

      if (!conv) { results.push({ id: msgId, success: false, error: 'conv_not_found' }); continue; }

      const meta = msg.metadata || {};
      const templateName = meta.template_name;
      const variables = meta.variables || [];
      const headerVariables = meta.header_variables || [];
      const language = meta.template_language || 'pt_BR';
      const isProspecting = meta.is_prospecting || false;

      // Call send-whatsapp-template
      const sendRes = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp-template`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contact_id: conv.contact_id,
          conversation_id: msg.conversation_id,
          template_name: templateName,
          language,
          variables,
          header_variables: headerVariables,
          is_prospecting: isProspecting,
        }),
      });

      const sendData = await sendRes.json();

      if (sendData.success) {
        // Mark original failed message
        await supabase
          .from('messages')
          .update({ status: 'sent', metadata: { ...meta, resent: true, resent_at: new Date().toISOString() } })
          .eq('id', msgId);

        results.push({ id: msgId, contact: conv.contact_id, success: true, new_wa_id: sendData.whatsapp_message_id });
      } else {
        results.push({ id: msgId, success: false, error: sendData.error || 'send_failed' });
      }

      // Rate limit: wait 2s between sends
      await new Promise(r => setTimeout(r, 2000));

    } catch (e) {
      results.push({ id: msgId, success: false, error: e.message });
    }
  }

  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  return new Response(JSON.stringify({
    total: message_ids.length,
    success: successCount,
    failed: failCount,
    results,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
