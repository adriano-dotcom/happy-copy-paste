import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ReasonBreakdown {
  count: number;
  percentage: number;
}

interface ClosureData {
  agent_id: string;
  agent_name: string;
  lost_reason: string | null;
  count: number;
  avg_minutes: number;
}

interface AgentReport {
  agent_id: string;
  agent_name: string;
  report_date: string;
  period_start: string;
  period_end: string;
  total_closures: number;
  by_reason: Record<string, ReasonBreakdown>;
  comparison_previous: Record<string, { current: number; previous: number; change: number }>;
  top_reasons: Array<{ reason: string; count: number; percentage: number }>;
  avg_time_to_close: number | null;
  insights: string[];
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function generateInsights(
  agentName: string,
  byReason: Record<string, ReasonBreakdown>,
  comparison: Record<string, { current: number; previous: number; change: number }>,
  totalClosures: number
): string[] {
  const insights: string[] = [];

  // Check for dominant reasons (>40%)
  for (const [reason, data] of Object.entries(byReason)) {
    if (data.percentage > 40) {
      insights.push(`${agentName} tem ${data.percentage.toFixed(0)}% de encerramentos por "${reason}" - verificar fluxo relacionado`);
    }
  }

  // Check for significant increases
  for (const [reason, data] of Object.entries(comparison)) {
    if (data.previous > 0 && data.change > 100) {
      insights.push(`${agentName}: aumento de ${data.change.toFixed(0)}% em "${reason}" vs. dia anterior`);
    }
  }

  // Zero closures is positive
  if (totalClosures === 0) {
    insights.push(`${agentName} zerou encerramentos hoje - excelente performance!`);
  }

  // Check for "Sem resposta" pattern
  const semResposta = byReason['Sem resposta'];
  if (semResposta && semResposta.percentage > 30) {
    insights.push(`${agentName}: alta taxa de "Sem resposta" (${semResposta.percentage.toFixed(0)}%) - revisar follow-ups e timing`);
  }

  return insights;
}

function generateHTMLEmailReport(reports: AgentReport[], periodStart: Date, periodEnd: Date): string {
  const totalClosures = reports.reduce((sum, r) => sum + r.total_closures, 0);
  
  // Aggregate reasons across all agents
  const allReasons: Record<string, number> = {};
  for (const report of reports) {
    for (const [reason, data] of Object.entries(report.by_reason)) {
      allReasons[reason] = (allReasons[reason] || 0) + Math.round((data.count || (data.percentage * report.total_closures / 100)));
    }
  }

  const sortedReasons = Object.entries(allReasons).sort(([, a], [, b]) => b - a);

  let agentCards = '';
  for (const report of reports) {
    const topReasons = report.top_reasons.slice(0, 3);
    let reasonsList = '';
    for (const r of topReasons) {
      reasonsList += `<li style="margin-bottom: 4px;">${r.reason}: ${r.count} (${r.percentage.toFixed(0)}%)</li>`;
    }

    agentCards += `
      <div style="background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h3 style="margin: 0; font-size: 16px; color: #1f2937;">${report.agent_name}</h3>
          <span style="background: ${report.total_closures > 10 ? '#fef2f2' : '#f0fdf4'}; color: ${report.total_closures > 10 ? '#dc2626' : '#16a34a'}; padding: 4px 12px; border-radius: 16px; font-weight: 600;">
            ${report.total_closures} fechamentos
          </span>
        </div>
        <ul style="margin: 0; padding-left: 20px; color: #4b5563; font-size: 14px;">
          ${reasonsList || '<li>Nenhum fechamento</li>'}
        </ul>
        ${report.insights.length > 0 ? `
          <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb;">
            <p style="margin: 0; font-size: 12px; color: #f59e0b;">
              💡 ${report.insights[0]}
            </p>
          </div>
        ` : ''}
      </div>
    `;
  }

  let reasonsTable = '';
  for (const [reason, count] of sortedReasons) {
    const percentage = totalClosures > 0 ? ((count / totalClosures) * 100).toFixed(0) : '0';
    reasonsTable += `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${reason}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; text-align: center; font-weight: 600;">${count}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; text-align: center;">${percentage}%</td>
      </tr>
    `;
  }

  // Collect all insights
  const allInsights = reports.flatMap(r => r.insights).slice(0, 5);
  let insightsList = '';
  for (const insight of allInsights) {
    insightsList += `<li style="margin-bottom: 8px;">${insight}</li>`;
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Relatório Diário - Motivos de Fechamento por Agente</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px; color: #1f2937;">
  
  <div style="background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%); color: white; padding: 24px; border-radius: 12px; margin-bottom: 24px;">
    <h1 style="margin: 0 0 8px 0; font-size: 24px;">📊 Relatório Diário - Motivos de Fechamento</h1>
    <p style="margin: 0; opacity: 0.9;">Período: ${formatDate(periodStart)} - ${formatDate(periodEnd)}</p>
  </div>

  <div style="background: #f9fafb; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
    <h2 style="margin: 0 0 16px 0; font-size: 18px; color: #374151;">📈 Resumo Geral</h2>
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;">
      <div style="background: white; padding: 16px; border-radius: 8px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <div style="font-size: 28px; font-weight: 700; color: #7c3aed;">${totalClosures}</div>
        <div style="font-size: 12px; color: #6b7280;">Total Fechamentos</div>
      </div>
      <div style="background: white; padding: 16px; border-radius: 8px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <div style="font-size: 28px; font-weight: 700; color: #06b6d4;">${reports.length}</div>
        <div style="font-size: 12px; color: #6b7280;">Agentes Analisados</div>
      </div>
    </div>
  </div>

  <div style="margin-bottom: 24px;">
    <h2 style="margin: 0 0 16px 0; font-size: 18px; color: #374151;">🤖 Por Agente</h2>
    ${agentCards || '<p style="color: #6b7280;">Nenhum fechamento no período</p>'}
  </div>

  ${reasonsTable ? `
  <div style="background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
    <h2 style="margin: 0 0 16px 0; font-size: 18px; color: #374151;">📋 Motivos Consolidados</h2>
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr style="background: #f9fafb;">
          <th style="padding: 10px; text-align: left; font-weight: 600;">Motivo</th>
          <th style="padding: 10px; text-align: center; font-weight: 600;">Qtd</th>
          <th style="padding: 10px; text-align: center; font-weight: 600;">%</th>
        </tr>
      </thead>
      <tbody>
        ${reasonsTable}
      </tbody>
    </table>
  </div>
  ` : ''}

  ${insightsList ? `
  <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
    <h2 style="margin: 0 0 16px 0; font-size: 18px; color: #92400e;">💡 Insights do Dia</h2>
    <ul style="margin: 0; padding-left: 20px; color: #78350f;">
      ${insightsList}
    </ul>
  </div>
  ` : ''}

  <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
    <p>Este relatório foi gerado automaticamente pelo sistema.</p>
  </div>

</body>
</html>
  `;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const triggeredBy = body.triggered_by || 'manual';

    console.log(`[ClosureReport] Starting report generation. Triggered by: ${triggeredBy}`);

    // Calculate period (last 24 hours)
    const periodEnd = new Date();
    periodEnd.setMinutes(59, 59, 999);
    const periodStart = new Date(periodEnd);
    periodStart.setDate(periodStart.getDate() - 1);
    periodStart.setHours(periodEnd.getHours(), 0, 0, 0);

    // Previous day for comparison
    const prevPeriodEnd = new Date(periodStart);
    prevPeriodEnd.setMilliseconds(-1);
    const prevPeriodStart = new Date(prevPeriodEnd);
    prevPeriodStart.setDate(prevPeriodStart.getDate() - 1);

    const reportDate = new Date().toISOString().split('T')[0];

    console.log(`[ClosureReport] Period: ${periodStart.toISOString()} to ${periodEnd.toISOString()}`);

    // Fetch active agents
    const { data: agents, error: agentsError } = await supabase
      .from('agents')
      .select('id, name')
      .eq('is_active', true);

    if (agentsError) {
      throw new Error(`Failed to fetch agents: ${agentsError.message}`);
    }

    console.log(`[ClosureReport] Found ${agents?.length || 0} active agents`);

    const reports: AgentReport[] = [];

    for (const agent of agents || []) {
      console.log(`[ClosureReport] Processing agent: ${agent.name}`);

      // Direct query for closures
      let closures: ClosureData[] = [];
      
      const { data: dealsData } = await supabase
        .from('deals')
        .select(`
          id,
          lost_reason,
          lost_at,
          created_at,
          contact_id
        `)
        .not('lost_reason', 'is', null)
        .gte('lost_at', periodStart.toISOString())
        .lte('lost_at', periodEnd.toISOString());

      if (dealsData && dealsData.length > 0) {
        // Get conversations for these contacts to check agent
        const contactIds = dealsData.map(d => d.contact_id).filter(Boolean);
        const { data: conversations } = await supabase
          .from('conversations')
          .select('contact_id, current_agent_id')
          .in('contact_id', contactIds)
          .eq('current_agent_id', agent.id);

        const agentContactIds = new Set((conversations || []).map(c => c.contact_id));
        
        // Filter deals by agent's contacts
        const agentDeals = dealsData.filter(d => agentContactIds.has(d.contact_id));
        
        // Group by reason
        const reasonGroups: Record<string, { count: number; totalMinutes: number }> = {};
        for (const deal of agentDeals) {
          const reason = deal.lost_reason || 'Sem motivo';
          if (!reasonGroups[reason]) {
            reasonGroups[reason] = { count: 0, totalMinutes: 0 };
          }
          reasonGroups[reason].count++;
          if (deal.lost_at && deal.created_at) {
            const minutes = (new Date(deal.lost_at).getTime() - new Date(deal.created_at).getTime()) / (1000 * 60);
            reasonGroups[reason].totalMinutes += minutes;
          }
        }

        closures = Object.entries(reasonGroups).map(([reason, data]) => ({
          agent_id: agent.id,
          agent_name: agent.name,
          lost_reason: reason,
          count: data.count,
          avg_minutes: data.count > 0 ? data.totalMinutes / data.count : 0
        }));
      }

      // Previous day data
      const { data: prevDealsData } = await supabase
        .from('deals')
        .select('id, lost_reason, contact_id')
        .not('lost_reason', 'is', null)
        .gte('lost_at', prevPeriodStart.toISOString())
        .lte('lost_at', prevPeriodEnd.toISOString());

      const prevContactIds = (prevDealsData || []).map(d => d.contact_id).filter(Boolean);
      const { data: prevConversations } = await supabase
        .from('conversations')
        .select('contact_id')
        .in('contact_id', prevContactIds.length > 0 ? prevContactIds : ['none'])
        .eq('current_agent_id', agent.id);

      const prevAgentContactIds = new Set((prevConversations || []).map(c => c.contact_id));
      const prevAgentDeals = (prevDealsData || []).filter(d => prevAgentContactIds.has(d.contact_id));

      const prevByReason: Record<string, number> = {};
      for (const deal of prevAgentDeals) {
        const reason = deal.lost_reason || 'Sem motivo';
        prevByReason[reason] = (prevByReason[reason] || 0) + 1;
      }

      // Calculate metrics
      const totalClosures = closures.reduce((sum, c) => sum + c.count, 0);
      const byReason: Record<string, ReasonBreakdown> = {};
      let totalAvgMinutes = 0;
      let reasonCount = 0;

      for (const closure of closures) {
        const reason = closure.lost_reason || 'Sem motivo';
        byReason[reason] = {
          count: closure.count,
          percentage: totalClosures > 0 ? (closure.count / totalClosures) * 100 : 0
        };
        if (closure.avg_minutes > 0) {
          totalAvgMinutes += closure.avg_minutes;
          reasonCount++;
        }
      }

      // Comparison with previous day
      const comparison: Record<string, { current: number; previous: number; change: number }> = {};
      const allReasons = new Set([...Object.keys(byReason), ...Object.keys(prevByReason)]);
      for (const reason of allReasons) {
        const current = byReason[reason]?.count || 0;
        const previous = prevByReason[reason] || 0;
        const change = previous > 0 ? ((current - previous) / previous) * 100 : (current > 0 ? 100 : 0);
        comparison[reason] = { current, previous, change };
      }

      // Top reasons
      const topReasons = Object.entries(byReason)
        .map(([reason, data]) => ({ reason, count: data.count, percentage: data.percentage }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);

      // Generate insights
      const insights = generateInsights(agent.name, byReason, comparison, totalClosures);

      const report: AgentReport = {
        agent_id: agent.id,
        agent_name: agent.name,
        report_date: reportDate,
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
        total_closures: totalClosures,
        by_reason: byReason,
        comparison_previous: comparison,
        top_reasons: topReasons,
        avg_time_to_close: reasonCount > 0 ? Math.round(totalAvgMinutes / reasonCount) : null,
        insights
      };

      // Save to database
      const { error: insertError } = await supabase
        .from('closure_reason_reports')
        .insert(report);

      if (insertError) {
        console.error(`[ClosureReport] Error saving report for ${agent.name}:`, insertError);
      } else {
        console.log(`[ClosureReport] Saved report for ${agent.name}: ${totalClosures} closures`);
        reports.push(report);
      }
    }

    // Send email summary to admins
    if (reports.length > 0) {
      const htmlEmail = generateHTMLEmailReport(reports, periodStart, periodEnd);
      
      // Get admin emails from team_members or use default
      const { data: admins } = await supabase
        .from('team_members')
        .select('email')
        .eq('is_active', true)
        .not('email', 'is', null);

      const recipients = (admins || [])
        .map(a => a.email)
        .filter((email): email is string => !!email && email.includes('@'));

      if (recipients.length === 0) {
        recipients.push('adriano@jacometo.com.br');
      }

      const emailSubject = `📊 Relatório Diário - Motivos de Fechamento (${formatDate(periodStart)})`;

      for (const recipient of recipients) {
        try {
          const { error: emailError } = await supabase.functions.invoke('send-email', {
            body: {
              to: recipient,
              subject: emailSubject,
              html: htmlEmail
            }
          });

          if (emailError) {
            console.error(`[ClosureReport] Error sending email to ${recipient}:`, emailError);
          } else {
            console.log(`[ClosureReport] Email sent to ${recipient}`);
          }
        } catch (emailErr) {
          console.error(`[ClosureReport] Email error:`, emailErr);
        }
      }

      // Update sent_at for today's reports
      await supabase
        .from('closure_reason_reports')
        .update({ sent_at: new Date().toISOString() })
        .eq('report_date', reportDate);
    }

    console.log(`[ClosureReport] Completed. Generated ${reports.length} reports.`);

    return new Response(
      JSON.stringify({
        success: true,
        reports_count: reports.length,
        period: { start: periodStart.toISOString(), end: periodEnd.toISOString() }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error('[ClosureReport] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
