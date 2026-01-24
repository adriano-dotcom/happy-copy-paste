import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Disqualification tag definitions
const DISQUALIFICATION_TAGS: Record<string, { name: string; emoji: string }> = {
  'emprego': { name: 'Procura Emprego', emoji: '💼' },
  'fornecedor': { name: 'Fornecedores', emoji: '🏭' },
  'parceria': { name: 'Parcerias', emoji: '🤝' },
  'engano': { name: 'Número Errado/Engano', emoji: '❓' },
  'spam': { name: 'Spam/Golpes', emoji: '🚫' },
  'frete': { name: 'Busca Transportadora', emoji: '🚚' },
  'mudou_dono': { name: 'Mudança de Dono', emoji: '🔄' },
};

// DDD to region mapping
const DDD_REGIONS: Record<string, string> = {
  '11': 'São Paulo', '12': 'São José dos Campos', '13': 'Santos', '14': 'Bauru',
  '15': 'Sorocaba', '16': 'Ribeirão Preto', '17': 'São José do Rio Preto', '18': 'Presidente Prudente',
  '19': 'Campinas', '21': 'Rio de Janeiro', '22': 'Campos dos Goytacazes', '24': 'Petrópolis',
  '27': 'Vitória', '28': 'Cachoeiro de Itapemirim', '31': 'Belo Horizonte', '32': 'Juiz de Fora',
  '33': 'Governador Valadares', '34': 'Uberlândia', '35': 'Poços de Caldas', '37': 'Divinópolis',
  '38': 'Montes Claros', '41': 'Curitiba', '42': 'Ponta Grossa', '43': 'Londrina',
  '44': 'Maringá', '45': 'Foz do Iguaçu', '46': 'Francisco Beltrão', '47': 'Joinville',
  '48': 'Florianópolis', '49': 'Chapecó', '51': 'Porto Alegre', '53': 'Pelotas',
  '54': 'Caxias do Sul', '55': 'Santa Maria', '61': 'Brasília', '62': 'Goiânia',
  '63': 'Palmas', '64': 'Rio Verde', '65': 'Cuiabá', '66': 'Rondonópolis',
  '67': 'Campo Grande', '68': 'Rio Branco', '69': 'Porto Velho', '71': 'Salvador',
  '73': 'Ilhéus', '74': 'Juazeiro', '75': 'Feira de Santana', '77': 'Vitória da Conquista',
  '79': 'Aracaju', '81': 'Recife', '82': 'Maceió', '83': 'João Pessoa',
  '84': 'Natal', '85': 'Fortaleza', '86': 'Teresina', '87': 'Petrolina',
  '88': 'Juazeiro do Norte', '89': 'Picos', '91': 'Belém', '92': 'Manaus',
  '93': 'Santarém', '94': 'Marabá', '95': 'Boa Vista', '96': 'Macapá',
  '97': 'Coari', '98': 'São Luís', '99': 'Imperatriz',
};

function extractDDD(phone: string): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('55') && cleaned.length >= 4) {
    return cleaned.substring(2, 4);
  }
  if (cleaned.length >= 2) {
    return cleaned.substring(0, 2);
  }
  return null;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function generateHTMLReport(data: {
  periodStart: Date;
  periodEnd: Date;
  totalDisqualified: number;
  totalLeads: number;
  byCategory: Record<string, number>;
  previousWeek: Record<string, number>;
  topDDDs: Array<{ ddd: string; count: number; region: string }>;
  peakHours: Array<{ hour: number; count: number; percentage: number }>;
  insights: string[];
}): string {
  const percentOfTotal = data.totalLeads > 0 
    ? ((data.totalDisqualified / data.totalLeads) * 100).toFixed(1) 
    : '0';
  
  const previousTotal = Object.values(data.previousWeek).reduce((a, b) => a + b, 0);
  const weekTrend = previousTotal > 0 
    ? (((data.totalDisqualified - previousTotal) / previousTotal) * 100).toFixed(0)
    : null;
  
  let categoryRows = '';
  const sortedCategories = Object.entries(data.byCategory)
    .sort(([, a], [, b]) => b - a);
  
  for (const [tag, count] of sortedCategories) {
    const config = DISQUALIFICATION_TAGS[tag] || { name: tag, emoji: '📌' };
    const percentage = data.totalDisqualified > 0 
      ? ((count / data.totalDisqualified) * 100).toFixed(0) 
      : '0';
    const prevCount = data.previousWeek[tag] || 0;
    const diff = count - prevCount;
    const trendIcon = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';
    const trendColor = diff > 0 ? '#ef4444' : diff < 0 ? '#22c55e' : '#6b7280';
    
    categoryRows += `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
          ${config.emoji} ${config.name}
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center; font-weight: 600;">
          ${count}
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">
          ${percentage}%
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center; color: ${trendColor};">
          ${trendIcon} ${diff > 0 ? '+' : ''}${diff}
        </td>
      </tr>
    `;
  }

  let dddRows = '';
  for (const item of data.topDDDs.slice(0, 5)) {
    dddRows += `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${item.ddd}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${item.region}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: center; font-weight: 600;">${item.count}</td>
      </tr>
    `;
  }

  let peakHoursHtml = '';
  for (const item of data.peakHours.slice(0, 3)) {
    peakHoursHtml += `<li>${String(item.hour).padStart(2, '0')}:00 - ${String(item.hour + 1).padStart(2, '0')}:00: ${item.percentage}% das desqualificações</li>`;
  }

  let insightsHtml = '';
  for (const insight of data.insights) {
    insightsHtml += `<li style="margin-bottom: 8px;">${insight}</li>`;
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Relatório Semanal - Leads Desqualificados</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px; color: #1f2937;">
  
  <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: white; padding: 24px; border-radius: 12px; margin-bottom: 24px;">
    <h1 style="margin: 0 0 8px 0; font-size: 24px;">📊 Relatório Semanal de Leads Desqualificados</h1>
    <p style="margin: 0; opacity: 0.9;">Período: ${formatDate(data.periodStart)} - ${formatDate(data.periodEnd)}</p>
  </div>

  <div style="background: #f9fafb; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
    <h2 style="margin: 0 0 16px 0; font-size: 18px; color: #374151;">📈 Resumo Geral</h2>
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;">
      <div style="background: white; padding: 16px; border-radius: 8px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <div style="font-size: 28px; font-weight: 700; color: #1e40af;">${data.totalDisqualified}</div>
        <div style="font-size: 12px; color: #6b7280;">Total Desqualificados</div>
      </div>
      <div style="background: white; padding: 16px; border-radius: 8px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <div style="font-size: 28px; font-weight: 700; color: ${weekTrend && parseInt(weekTrend) > 0 ? '#ef4444' : '#22c55e'};">
          ${weekTrend ? (parseInt(weekTrend) > 0 ? '+' : '') + weekTrend + '%' : 'N/A'}
        </div>
        <div style="font-size: 12px; color: #6b7280;">vs. Semana Anterior</div>
      </div>
      <div style="background: white; padding: 16px; border-radius: 8px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <div style="font-size: 28px; font-weight: 700; color: #6366f1;">${percentOfTotal}%</div>
        <div style="font-size: 12px; color: #6b7280;">do Total de Leads</div>
      </div>
    </div>
  </div>

  <div style="background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
    <h2 style="margin: 0 0 16px 0; font-size: 18px; color: #374151;">📋 Por Categoria</h2>
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr style="background: #f9fafb;">
          <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151;">Categoria</th>
          <th style="padding: 12px; text-align: center; font-weight: 600; color: #374151;">Qtd</th>
          <th style="padding: 12px; text-align: center; font-weight: 600; color: #374151;">%</th>
          <th style="padding: 12px; text-align: center; font-weight: 600; color: #374151;">Trend</th>
        </tr>
      </thead>
      <tbody>
        ${categoryRows || '<tr><td colspan="4" style="padding: 20px; text-align: center; color: #6b7280;">Nenhuma desqualificação no período</td></tr>'}
      </tbody>
    </table>
  </div>

  ${data.topDDDs.length > 0 ? `
  <div style="background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
    <h2 style="margin: 0 0 16px 0; font-size: 18px; color: #374151;">🌍 Principais DDDs</h2>
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr style="background: #f9fafb;">
          <th style="padding: 8px; text-align: left; font-weight: 600;">DDD</th>
          <th style="padding: 8px; text-align: left; font-weight: 600;">Região</th>
          <th style="padding: 8px; text-align: center; font-weight: 600;">Leads</th>
        </tr>
      </thead>
      <tbody>
        ${dddRows}
      </tbody>
    </table>
  </div>
  ` : ''}

  ${data.peakHours.length > 0 ? `
  <div style="background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
    <h2 style="margin: 0 0 16px 0; font-size: 18px; color: #374151;">⏰ Horários de Pico</h2>
    <ul style="margin: 0; padding-left: 20px; color: #4b5563;">
      ${peakHoursHtml}
    </ul>
  </div>
  ` : ''}

  ${data.insights.length > 0 ? `
  <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
    <h2 style="margin: 0 0 16px 0; font-size: 18px; color: #92400e;">💡 Insights</h2>
    <ul style="margin: 0; padding-left: 20px; color: #78350f;">
      ${insightsHtml}
    </ul>
  </div>
  ` : ''}

  <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
    <p>Este relatório foi gerado automaticamente pelo sistema Jacometo Seguros.</p>
    <p>Para dúvidas ou ajustes, entre em contato com a equipe de tecnologia.</p>
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

    console.log("[DisqualifiedReport] Starting weekly report generation...");

    // Calculate period (last 7 days)
    const periodEnd = new Date();
    periodEnd.setHours(23, 59, 59, 999);
    const periodStart = new Date(periodEnd);
    periodStart.setDate(periodStart.getDate() - 7);
    periodStart.setHours(0, 0, 0, 0);

    // Previous week for comparison
    const prevPeriodEnd = new Date(periodStart);
    prevPeriodEnd.setMilliseconds(-1);
    const prevPeriodStart = new Date(prevPeriodEnd);
    prevPeriodStart.setDate(prevPeriodStart.getDate() - 7);

    console.log(`[DisqualifiedReport] Period: ${periodStart.toISOString()} to ${periodEnd.toISOString()}`);

    // Fetch tag definitions
    const { data: tagDefs } = await supabase
      .from('tag_definitions')
      .select('id, name')
      .in('name', Object.keys(DISQUALIFICATION_TAGS));

    const tagIdToName: Record<string, string> = {};
    for (const tag of tagDefs || []) {
      tagIdToName[tag.id] = tag.name;
    }

    const disqualTagIds = Object.keys(tagIdToName);
    console.log(`[DisqualifiedReport] Found ${disqualTagIds.length} disqualification tags`);

    // Fetch contacts with disqualification tags from current period
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, name, phone_number, tags, created_at')
      .gte('created_at', periodStart.toISOString())
      .lte('created_at', periodEnd.toISOString())
      .not('tags', 'is', null);

    // Fetch contacts from previous period for comparison
    const { data: prevContacts } = await supabase
      .from('contacts')
      .select('id, tags, created_at')
      .gte('created_at', prevPeriodStart.toISOString())
      .lte('created_at', prevPeriodEnd.toISOString())
      .not('tags', 'is', null);

    // Fetch total leads for the period
    const { count: totalLeads } = await supabase
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', periodStart.toISOString())
      .lte('created_at', periodEnd.toISOString());

    // Filter contacts with disqualification tags and group by category
    const byCategory: Record<string, number> = {};
    const previousWeek: Record<string, number> = {};
    const dddCounts: Record<string, number> = {};
    const hourCounts: Record<number, number> = {};
    let totalDisqualified = 0;

    for (const contact of contacts || []) {
      const contactTags = contact.tags || [];
      let hasDisqualTag = false;

      for (const tagId of contactTags) {
        const tagName = tagIdToName[tagId];
        if (tagName) {
          byCategory[tagName] = (byCategory[tagName] || 0) + 1;
          hasDisqualTag = true;
        }
      }

      if (hasDisqualTag) {
        totalDisqualified++;
        
        // Extract DDD
        const ddd = extractDDD(contact.phone_number);
        if (ddd) {
          dddCounts[ddd] = (dddCounts[ddd] || 0) + 1;
        }

        // Extract hour
        const hour = new Date(contact.created_at).getHours();
        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      }
    }

    // Previous week counts
    for (const contact of prevContacts || []) {
      const contactTags = contact.tags || [];
      for (const tagId of contactTags) {
        const tagName = tagIdToName[tagId];
        if (tagName) {
          previousWeek[tagName] = (previousWeek[tagName] || 0) + 1;
        }
      }
    }

    console.log(`[DisqualifiedReport] Found ${totalDisqualified} disqualified contacts out of ${totalLeads} total leads`);
    console.log(`[DisqualifiedReport] By category:`, byCategory);

    // Process top DDDs
    const topDDDs = Object.entries(dddCounts)
      .map(([ddd, count]) => ({
        ddd,
        count,
        region: DDD_REGIONS[ddd] || 'Desconhecido'
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Process peak hours
    const totalHourCount = Object.values(hourCounts).reduce((a, b) => a + b, 0);
    const peakHours = Object.entries(hourCounts)
      .map(([hour, count]) => ({
        hour: parseInt(hour),
        count,
        percentage: totalHourCount > 0 ? Math.round((count / totalHourCount) * 100) : 0
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    // Generate insights
    const insights: string[] = [];
    
    const empregoCount = byCategory['emprego'] || 0;
    const empregoPercentage = totalDisqualified > 0 ? (empregoCount / totalDisqualified) * 100 : 0;
    
    if (empregoPercentage > 50) {
      insights.push(`Alta demanda por emprego (${empregoPercentage.toFixed(0)}%) pode indicar visibilidade da marca em canais de RH. Considerar criar landing page "Trabalhe Conosco" para redirecionar esse tráfego.`);
    }
    
    if (byCategory['engano'] && byCategory['engano'] > 5) {
      insights.push(`${byCategory['engano']} leads marcados como "engano". Verificar se há confusão com outro número de telefone ou empresa similar.`);
    }
    
    if (byCategory['fornecedor'] && byCategory['fornecedor'] > 3) {
      insights.push(`${byCategory['fornecedor']} contatos de fornecedores. Considerar criar formulário específico para fornecedores no site.`);
    }

    const previousTotal = Object.values(previousWeek).reduce((a, b) => a + b, 0);
    if (previousTotal > 0 && totalDisqualified > previousTotal * 1.5) {
      insights.push(`Aumento significativo de ${Math.round(((totalDisqualified - previousTotal) / previousTotal) * 100)}% em desqualificações vs. semana anterior. Investigar possível fonte de tráfego não qualificado.`);
    }

    // Generate HTML report
    const htmlReport = generateHTMLReport({
      periodStart,
      periodEnd,
      totalDisqualified,
      totalLeads: totalLeads || 0,
      byCategory,
      previousWeek,
      topDDDs,
      peakHours,
      insights
    });

    // Save report to database
    const { data: savedReport, error: saveError } = await supabase
      .from('disqualification_reports')
      .insert({
        report_period_start: periodStart.toISOString(),
        report_period_end: periodEnd.toISOString(),
        total_disqualified: totalDisqualified,
        total_leads_period: totalLeads || 0,
        by_category: byCategory,
        comparison_previous_week: previousWeek,
        top_ddds: topDDDs,
        peak_hours: peakHours,
        insights
      })
      .select()
      .single();

    if (saveError) {
      console.error('[DisqualifiedReport] Error saving report:', saveError);
    } else {
      console.log('[DisqualifiedReport] Report saved with ID:', savedReport?.id);
    }

    // Get recipients from nina_settings or use default
    const { data: settings } = await supabase
      .from('nina_settings')
      .select('company_name')
      .limit(1)
      .single();

    const recipients = ['adriano@jacometo.com.br'];
    const companyName = settings?.company_name || 'Jacometo Seguros';

    // Send email
    const emailSubject = `📊 Relatório Semanal - Leads Desqualificados (${formatDate(periodStart)} - ${formatDate(periodEnd)})`;

    for (const recipient of recipients) {
      try {
        const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            to: recipient,
            subject: emailSubject,
            html: htmlReport,
            from: `${companyName} <noreply@jacometo.com.br>`
          })
        });

        if (emailResponse.ok) {
          console.log(`[DisqualifiedReport] Email sent to ${recipient}`);
        } else {
          const errorText = await emailResponse.text();
          console.error(`[DisqualifiedReport] Error sending email to ${recipient}:`, errorText);
        }
      } catch (emailError) {
        console.error(`[DisqualifiedReport] Error sending email to ${recipient}:`, emailError);
      }
    }

    // Update report with sent info
    if (savedReport?.id) {
      await supabase
        .from('disqualification_reports')
        .update({
          sent_to: recipients,
          sent_at: new Date().toISOString()
        })
        .eq('id', savedReport.id);
    }

    console.log('[DisqualifiedReport] Report generation completed successfully');

    return new Response(
      JSON.stringify({
        success: true,
        report_id: savedReport?.id,
        total_disqualified: totalDisqualified,
        by_category: byCategory,
        sent_to: recipients
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[DisqualifiedReport] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
