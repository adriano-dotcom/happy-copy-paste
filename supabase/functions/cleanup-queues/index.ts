import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================
// HELPER: Verificar taxa de "Foi Engano" nos botões
// ============================================
async function checkButtonEnganoRate(supabase: any) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  
  console.log('[CleanupQueues] Checking button engano rate...');
  
  // Período: últimas 24 horas
  const periodStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  
  // Buscar mensagens interativas enviadas (triagem Íris)
  const { data: sentMessages, error: sentError } = await supabase
    .from('messages')
    .select('id, metadata')
    .eq('from_type', 'nina')
    .gte('sent_at', periodStart)
    .not('metadata', 'is', null);
  
  if (sentError) {
    console.error('[CleanupQueues] Error fetching sent messages:', sentError);
    return;
  }
  
  // Filtrar apenas mensagens interativas (botões de triagem)
  const interactiveMessages = (sentMessages || []).filter((m: { id: string; metadata: Record<string, unknown> | null }) => {
    const meta = m.metadata as Record<string, unknown>;
    return meta?.is_interactive === true;
  });
  
  const interactiveCount = interactiveMessages.length;
  
  console.log(`[CleanupQueues] Interactive buttons sent (24h): ${interactiveCount}`);
  
  // Se não tem volume suficiente, não verificar
  if (interactiveCount < 10) {
    console.log('[CleanupQueues] ⏭️ Not enough samples for engano rate check (need ≥10)');
    return;
  }
  
  // Buscar cliques em botões (respostas do usuário)
  const { data: buttonClicks, error: clicksError } = await supabase
    .from('messages')
    .select('id, metadata')
    .eq('from_type', 'user')
    .gte('sent_at', periodStart)
    .not('metadata', 'is', null);
  
  if (clicksError) {
    console.error('[CleanupQueues] Error fetching button clicks:', clicksError);
    return;
  }
  
  // Filtrar cliques em "Foi engano"
  const enganoClicks = (buttonClicks || []).filter((m: { id: string; metadata: Record<string, unknown> | null }) => {
    const meta = m.metadata as Record<string, unknown>;
    return meta?.button_id === 'btn_engano' || (meta?.is_button_reply === true && meta?.button_id === 'btn_engano');
  });
  
  const enganoCount = enganoClicks.length;
  
  // Calcular taxa
  const enganoRate = (enganoCount / interactiveCount) * 100;
  
  console.log(`[CleanupQueues] 📊 Button stats (24h): 
    - Interactive sent: ${interactiveCount}
    - Engano clicks: ${enganoCount}
    - Engano rate: ${enganoRate.toFixed(1)}%`);
  
  // Limiar de alerta: 15%
  const THRESHOLD = 15;
  
  if (enganoRate > THRESHOLD) {
    // Verificar se já enviou alerta hoje
    const today = new Date().toISOString().split('T')[0];
    
    const { data: settings, error: settingsError } = await supabase
      .from('nina_settings')
      .select('id, button_engano_alert_date')
      .maybeSingle();
    
    if (settingsError) {
      console.error('[CleanupQueues] Error fetching settings:', settingsError);
      return;
    }
    
    const lastAlertDate = settings?.button_engano_alert_date;
    
    if (lastAlertDate === today) {
      console.log('[CleanupQueues] ⏭️ Engano rate alert already sent today');
      return;
    }
    
    console.warn(`[CleanupQueues] 🚨 High engano rate detected: ${enganoRate.toFixed(1)}% (threshold: ${THRESHOLD}%)`);
    
    // Enviar alerta
    await sendEnganoRateAlert(supabaseUrl, supabaseKey, {
      interactiveCount,
      enganoCount,
      enganoRate,
      threshold: THRESHOLD
    });
    
    // Marcar que alertou hoje
    if (settings?.id) {
      await supabase
        .from('nina_settings')
        .update({ button_engano_alert_date: today })
        .eq('id', settings.id);
      
      console.log('[CleanupQueues] ✓ Marked engano alert as sent for today');
    }
  } else {
    console.log(`[CleanupQueues] ✓ Engano rate within acceptable limits (${enganoRate.toFixed(1)}% ≤ ${THRESHOLD}%)`);
  }
}

// ============================================
// HELPER: Enviar alerta de taxa de engano elevada
// ============================================
async function sendEnganoRateAlert(
  supabaseUrl: string,
  supabaseKey: string,
  stats: {
    interactiveCount: number;
    enganoCount: number;
    enganoRate: number;
    threshold: number;
  }
) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px;">
      <h2 style="color: #e53e3e;">🚨 Alerta: Taxa de "Foi Engano" Elevada</h2>
      
      <p>A taxa de cliques em <strong>"Foi engano"</strong> nos botões de triagem 
      está acima do limite aceitável nas últimas 24 horas.</p>
      
      <div style="background: #fef2f2; border: 1px solid #fecaca; 
                  border-radius: 8px; padding: 16px; margin: 20px 0;">
        <table style="width: 100%;">
          <tr>
            <td style="padding: 8px 0;"><strong>Taxa Atual:</strong></td>
            <td style="color: #dc2626; font-size: 24px; font-weight: bold;">
              ${stats.enganoRate.toFixed(1)}%
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0;"><strong>Limite Aceitável:</strong></td>
            <td style="color: #059669;">${stats.threshold}%</td>
          </tr>
          <tr>
            <td style="padding: 8px 0;"><strong>Botões Enviados:</strong></td>
            <td>${stats.interactiveCount}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0;"><strong>Cliques "Foi Engano":</strong></td>
            <td style="color: #dc2626;">${stats.enganoCount}</td>
          </tr>
        </table>
      </div>
      
      <h3 style="color: #1e293b;">📋 Ações Recomendadas</h3>
      <ul style="line-height: 1.8;">
        <li>Verificar segmentação da campanha de prospecção</li>
        <li>Revisar a lista de contatos usada no disparo</li>
        <li>Confirmar se os leads são do nicho de transporte de cargas</li>
        <li>Avaliar qualidade das fontes de captação (Meta, Google, etc)</li>
      </ul>
      
      <p style="color: #666; font-size: 12px; margin-top: 30px;">
        Este alerta é enviado automaticamente quando a taxa de "Foi engano" 
        ultrapassa ${stats.threshold}% em um período de 24 horas.
        Você receberá no máximo 1 alerta por dia.
      </p>
    </div>
  `;
  
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
          subject: `🚨 Taxa de "Foi Engano" em ${stats.enganoRate.toFixed(1)}% - Verificar Segmentação`,
          html
        })
      });
      
      if (response.ok) {
        console.log(`[CleanupQueues] 📧 Engano rate alert sent to ${email}`);
      } else {
        console.error(`[CleanupQueues] Failed to send engano alert to ${email}:`, await response.text());
      }
    } catch (err) {
      console.error(`[CleanupQueues] Error sending engano alert to ${email}:`, err);
    }
  }
}

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

    // ============================================
    // HEALTH CHECK: Taxa de "Foi Engano" elevada
    // ============================================
    await checkButtonEnganoRate(supabase);

    // ============================================
    // SAFETY NET: Recover orphaned messages
    // Messages saved in DB but never queued for Nina processing
    // ============================================
    console.log('[CleanupQueues] Checking for orphaned messages...');
    
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    
    // Find user messages from last 30 min that have no nina_processing_queue entry
    // and whose conversation is in 'nina' status
    const { data: orphanedMessages, error: orphanError2 } = await supabase
      .from('messages')
      .select(`
        id,
        conversation_id,
        content,
        type,
        sent_at,
        metadata,
        conversations!inner (
          id,
          status,
          contact_id
        )
      `)
      .eq('from_type', 'user')
      .eq('conversations.status', 'nina')
      .gt('sent_at', thirtyMinAgo)
      .lt('sent_at', fiveMinAgo)
      .limit(20);
    
    if (orphanError2) {
      console.error('[CleanupQueues] Error checking orphaned messages:', orphanError2);
    } else if (orphanedMessages && orphanedMessages.length > 0) {
      let recoveredCount = 0;
      
      for (const msg of orphanedMessages) {
        // Check if there's already a nina_processing_queue entry for this message
        const { data: existingQueue } = await supabase
          .from('nina_processing_queue')
          .select('id')
          .eq('message_id', msg.id)
          .limit(1);
        
        if (existingQueue && existingQueue.length > 0) continue;
        
        // Also check by conversation_id in recent entries (hot path placeholder may exist)
        const conv = msg.conversations as any;
        
        const { error: recoveryError } = await supabase
          .from('nina_processing_queue')
          .insert({
            message_id: msg.id,
            conversation_id: msg.conversation_id,
            contact_id: conv.contact_id,
            priority: 1,
            status: 'pending',
            context_data: {
              message_type: msg.type,
              original_type: msg.type,
              recovery: true,
              recovered_by: 'cleanup-queues',
              recovered_at: new Date().toISOString()
            }
          });
        
        if (!recoveryError) {
          recoveredCount++;
          console.warn(`[CleanupQueues] 🔄 Recovered orphaned message ${msg.id} for conversation ${msg.conversation_id}`);
        }
      }
      
      if (recoveredCount > 0) {
        console.warn(`[CleanupQueues] 🔄 Total orphaned messages recovered: ${recoveredCount}`);
      } else {
        console.log('[CleanupQueues] ✓ No orphaned messages found');
      }
    } else {
      console.log('[CleanupQueues] ✓ No orphaned messages found');
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
