import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================
// HELPER: Enviar alerta de documentos órfãos
// ============================================
async function sendDocumentHealthAlert(supabase: any, docs: any[]) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  
  // Formatar lista de documentos
  const docList = docs.map(doc => {
    const contact = (doc.conversations as any)?.contacts;
    return `
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;">${contact?.name || 'Desconhecido'}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${contact?.phone_number || '-'}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${doc.type}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${(doc.content || '-').substring(0, 50)}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${new Date(doc.created_at).toLocaleString('pt-BR')}</td>
      </tr>
    `;
  }).join('');
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 700px;">
      <h2 style="color: #e53e3e;">⚠️ Alerta: Documentos não salvos</h2>
      <p>Os seguintes documentos foram recebidos mas não foram salvos corretamente no storage:</p>
      
      <table style="border-collapse: collapse; width: 100%; margin: 20px 0;">
        <thead>
          <tr style="background-color: #f8f9fa;">
            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Contato</th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Telefone</th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Tipo</th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Conteúdo</th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Recebido em</th>
          </tr>
        </thead>
        <tbody>
          ${docList}
        </tbody>
      </table>
      
      <p><strong>Ação recomendada:</strong> Solicite ao cliente que reenvie os documentos.</p>
      
      <p style="color: #666; font-size: 12px;">
        Este é um alerta automático do sistema de verificação de saúde de documentos.
      </p>
    </div>
  `;
  
  // Enviar para admin e atendimento
  const recipients = ['adriano@jacometo.com.br', 'atendimento@jacometo.com.br'];
  
  for (const email of recipients) {
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`
        },
        body: JSON.stringify({
          to: email,
          subject: `⚠️ ${docs.length} documento(s) não salvo(s) - Ação necessária`,
          html
        })
      });
      
      if (response.ok) {
        console.log(`[CleanupQueues] 📧 Document health alert sent to ${email}`);
      } else {
        console.error(`[CleanupQueues] Failed to send alert to ${email}:`, await response.text());
      }
    } catch (err) {
      console.error(`[CleanupQueues] Error sending alert to ${email}:`, err);
    }
  }
  
  // Marcar documentos como alertados para evitar spam
  for (const doc of docs) {
    const existingMetadata = (doc.metadata as Record<string, any>) || {};
    await supabase
      .from('messages')
      .update({ 
        metadata: { 
          ...existingMetadata,
          media_alert_sent: true,
          media_alert_at: new Date().toISOString()
        }
      })
      .eq('id', doc.id);
  }
  
  console.log(`[CleanupQueues] Marked ${docs.length} documents as alerted`);
}

// ============================================
// HELPER: Enviar alerta de mensagens falhadas
// ============================================
async function sendFailedMessagesAlert(supabase: any, failedItems: any[]) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  
  // Formatar lista de mensagens falhadas
  const itemList = failedItems.map(item => {
    const contact = (item.conversations as any)?.contacts;
    return `
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;">${contact?.name || 'Desconhecido'}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${contact?.phone_number || '-'}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${(item.error_message || '-').substring(0, 60)}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${new Date(item.processed_at).toLocaleString('pt-BR')}</td>
      </tr>
    `;
  }).join('');
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 700px;">
      <h2 style="color: #e53e3e;">⚠️ Alerta: Mensagens não processadas</h2>
      <p>As seguintes mensagens falharam no processamento e estão pendentes há mais de 1 hora:</p>
      
      <table style="border-collapse: collapse; width: 100%; margin: 20px 0;">
        <thead>
          <tr style="background-color: #f8f9fa;">
            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Contato</th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Telefone</th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Erro</th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Falhou em</th>
          </tr>
        </thead>
        <tbody>
          ${itemList}
        </tbody>
      </table>
      
      <p><strong>Ação recomendada:</strong> Verifique as configurações do sistema ou reprocesse manualmente via chat.</p>
      
      <p style="color: #666; font-size: 12px;">
        Este é um alerta automático do sistema de monitoramento de filas.
      </p>
    </div>
  `;
  
  // Enviar para admin e atendimento
  const recipients = ['adriano@jacometo.com.br', 'atendimento@jacometo.com.br'];
  
  for (const email of recipients) {
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`
        },
        body: JSON.stringify({
          to: email,
          subject: `⚠️ ${failedItems.length} mensagem(ns) não processada(s) - Ação necessária`,
          html
        })
      });
      
      if (response.ok) {
        console.log(`[CleanupQueues] 📧 Failed messages alert sent to ${email}`);
      } else {
        console.error(`[CleanupQueues] Failed to send alert to ${email}:`, await response.text());
      }
    } catch (err) {
      console.error(`[CleanupQueues] Error sending alert to ${email}:`, err);
    }
  }
  
  // Marcar itens como alertados para evitar spam
  for (const item of failedItems) {
    const currentError = item.error_message || '';
    await supabase
      .from('nina_processing_queue')
      .update({ 
        error_message: `${currentError} [ALERTA ENVIADO ${new Date().toISOString()}]`
      })
      .eq('id', item.id);
  }
  
  console.log(`[CleanupQueues] Marked ${failedItems.length} failed items as alerted`);
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('[CleanupQueues] Starting queue cleanup...');

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Execute cleanup_processed_queues (removes completed >24h, failed >7d from nina_processing_queue and send_queue)
    console.log('[CleanupQueues] Running cleanup_processed_queues...');
    const { error: cleanupError1 } = await supabase.rpc('cleanup_processed_queues');
    if (cleanupError1) {
      console.error('[CleanupQueues] Error in cleanup_processed_queues:', cleanupError1);
    } else {
      console.log('[CleanupQueues] cleanup_processed_queues completed successfully');
    }

    // Execute cleanup_processed_message_queue (removes processed >1h from message_grouping_queue)
    console.log('[CleanupQueues] Running cleanup_processed_message_queue...');
    const { error: cleanupError2 } = await supabase.rpc('cleanup_processed_message_queue');
    if (cleanupError2) {
      console.error('[CleanupQueues] Error in cleanup_processed_message_queue:', cleanupError2);
    } else {
      console.log('[CleanupQueues] cleanup_processed_message_queue completed successfully');
    }

    // Reset stuck processing items (processing for more than 5 minutes)
    console.log('[CleanupQueues] Checking for stuck processing items...');
    const stuckThreshold = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 minutes ago
    
    const { data: stuckItems, error: stuckError } = await supabase
      .from('nina_processing_queue')
      .update({ 
        status: 'pending',
        error_message: 'Reset from stuck processing state',
        scheduled_for: new Date().toISOString()
      })
      .eq('status', 'processing')
      .lt('updated_at', stuckThreshold)
      .select('id, conversation_id');
    
    if (stuckError) {
      console.error('[CleanupQueues] Error resetting stuck items:', stuckError);
    } else if (stuckItems && stuckItems.length > 0) {
      console.warn(`[CleanupQueues] Reset ${stuckItems.length} stuck processing items:`, 
        stuckItems.map(i => i.id));
    } else {
      console.log('[CleanupQueues] No stuck processing items found');
    }

    // ============================================
    // HEALTH CHECK: Documentos sem media_url
    // ============================================
    console.log('[CleanupQueues] Checking for documents without media_url...');

    // Documentos criados há mais de 5 minutos sem media_url (excluir já alertados)
    const docHealthThreshold = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { data: orphanedDocs, error: orphanError } = await supabase
      .from('messages')
      .select(`
        id,
        content,
        type,
        created_at,
        metadata,
        conversation_id,
        conversations!inner (
          contact_id,
          contacts!inner (
            name,
            phone_number
          )
        )
      `)
      .in('type', ['document', 'image'])
      .is('media_url', null)
      .eq('from_type', 'user')
      .lt('created_at', docHealthThreshold)
      .gt('created_at', oneHourAgo)
      .limit(20);

    if (orphanError) {
      console.error('[CleanupQueues] Error checking orphaned documents:', orphanError);
    } else if (orphanedDocs && orphanedDocs.length > 0) {
      // Filtrar documentos que ainda não foram alertados
      const docsToAlert = orphanedDocs.filter(doc => {
        const metadata = doc.metadata as Record<string, any> | null;
        return !metadata?.media_alert_sent;
      });

      if (docsToAlert.length > 0) {
        console.warn(`[CleanupQueues] ⚠️ Found ${docsToAlert.length} documents without media_url!`);
        await sendDocumentHealthAlert(supabase, docsToAlert);
      } else {
        console.log('[CleanupQueues] ✓ All orphaned documents already alerted');
      }
    } else {
      console.log('[CleanupQueues] ✓ All recent documents have media_url');
    }

    // ============================================
    // HEALTH CHECK: Mensagens failed há mais de 1 hora
    // ============================================
    console.log('[CleanupQueues] Checking for failed messages > 1 hour...');

    const failedThreshold = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour ago

    const { data: failedMessages, error: failedError } = await supabase
      .from('nina_processing_queue')
      .select(`
        id,
        conversation_id,
        error_message,
        processed_at,
        conversations!inner (
          contact_id,
          contacts!inner (
            name,
            phone_number
          )
        )
      `)
      .eq('status', 'failed')
      .lt('processed_at', failedThreshold)
      .limit(20);

    if (failedError) {
      console.error('[CleanupQueues] Error checking failed messages:', failedError);
    } else if (failedMessages && failedMessages.length > 0) {
      // Filtrar itens que ainda não foram alertados
      const itemsToAlert = failedMessages.filter(item => 
        !item.error_message?.includes('[ALERTA ENVIADO')
      );

      if (itemsToAlert.length > 0) {
        console.warn(`[CleanupQueues] ⚠️ Found ${itemsToAlert.length} failed messages > 1 hour!`);
        await sendFailedMessagesAlert(supabase, itemsToAlert);
      } else {
        console.log('[CleanupQueues] ✓ All failed messages already alerted');
      }
    } else {
      console.log('[CleanupQueues] ✓ No failed messages older than 1 hour');
    }
    const { data: ninaStats } = await supabase
      .from('nina_processing_queue')
      .select('status', { count: 'exact' });
    
    const { data: sendStats } = await supabase
      .from('send_queue')
      .select('status', { count: 'exact' });
    
    const { data: messageStats } = await supabase
      .from('message_grouping_queue')
      .select('id', { count: 'exact' });

    const stats = {
      nina_processing_queue: ninaStats?.length || 0,
      send_queue: sendStats?.length || 0,
      message_grouping_queue: messageStats?.length || 0,
      cleaned_at: new Date().toISOString()
    };

    console.log('[CleanupQueues] Cleanup completed. Current stats:', stats);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Queue cleanup completed successfully',
        stats
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('[CleanupQueues] Unexpected error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
