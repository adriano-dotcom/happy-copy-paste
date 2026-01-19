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

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[api4com-sync-stuck-calls] Starting sync of stuck calls...');

    // Find all calls stuck in dialing, ringing, or timeout for more than 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    
    const { data: stuckCalls, error: fetchError } = await supabase
      .from('call_logs')
      .select('id, status, phone_number, created_at, api4com_call_id')
      .in('status', ['dialing', 'ringing', 'timeout'])
      .lt('created_at', fiveMinutesAgo)
      .order('created_at', { ascending: false })
      .limit(50);

    if (fetchError) {
      throw fetchError;
    }

    console.log(`[api4com-sync-stuck-calls] Found ${stuckCalls?.length || 0} stuck calls`);

    let processed = 0;
    let updated = 0;
    const results: Array<{ id: string; status: string; result: string }> = [];

    for (const call of stuckCalls || []) {
      processed++;
      
      try {
        console.log(`[api4com-sync-stuck-calls] Processing call ${call.id} (status: ${call.status})`);
        
        // Try to sync with API4Com
        const syncResponse = await fetch(`${supabaseUrl}/functions/v1/api4com-sync-call`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({ call_log_id: call.id }),
        });

        const syncResult = await syncResponse.json();
        
        if (syncResult.success && syncResult.updated) {
          updated++;
          results.push({ id: call.id, status: call.status, result: 'synced' });
          console.log(`[api4com-sync-stuck-calls] ✅ Call ${call.id} synced successfully`);
        } else if (syncResult.success) {
          // Sync successful but no updates from API4Com - mark as no_answer after timeout
          const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
          const callCreated = new Date(call.created_at);
          
          if (callCreated < tenMinutesAgo) {
            // More than 10 minutes - definitely stuck, mark as no_answer
            const { error: updateError } = await supabase
              .from('call_logs')
              .update({
                status: 'no_answer',
                ended_at: new Date().toISOString(),
                hangup_cause: 'timeout_cleanup',
                metadata: {
                  cleaned_up_at: new Date().toISOString(),
                  original_status: call.status,
                  cleanup_reason: 'stuck_call_sync',
                }
              })
              .eq('id', call.id);

            if (!updateError) {
              updated++;
              results.push({ id: call.id, status: call.status, result: 'timeout_cleanup' });
              console.log(`[api4com-sync-stuck-calls] ✅ Call ${call.id} marked as no_answer (cleanup)`);
            }
          } else {
            results.push({ id: call.id, status: call.status, result: 'no_change' });
          }
        } else {
          results.push({ id: call.id, status: call.status, result: 'sync_failed' });
          console.log(`[api4com-sync-stuck-calls] ⚠️ Call ${call.id} sync failed:`, syncResult.error);
        }
      } catch (syncError) {
        console.error(`[api4com-sync-stuck-calls] ❌ Error syncing call ${call.id}:`, syncError);
        results.push({ id: call.id, status: call.status, result: 'error' });
      }
    }

    console.log(`[api4com-sync-stuck-calls] Completed: ${processed} processed, ${updated} updated`);

    return new Response(
      JSON.stringify({
        success: true,
        processed,
        updated,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[api4com-sync-stuck-calls] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
