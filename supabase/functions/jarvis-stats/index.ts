import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-jarvis-token",
};

function periodoInicio(periodo: string): string {
  const now = new Date();
  if (periodo === "semana") { const d = new Date(now); d.setDate(d.getDate() - 7); return d.toISOString(); }
  if (periodo === "mes") { const d = new Date(now); d.setDate(d.getDate() - 30); return d.toISOString(); }
  const d = new Date(now); d.setHours(0, 0, 0, 0); return d.toISOString();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const token = req.headers.get("x-jarvis-token");
  const expectedToken = Deno.env.get("JARVIS_STATS_TOKEN");
  if (expectedToken && token !== expectedToken) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const url = new URL(req.url);
  const periodo = url.searchParams.get("periodo") || "hoje";
  const desde = periodoInicio(periodo);

  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

  try {
    const { data: contacts } = await supabase.from("contacts").select("utm_source, lead_source, vertical, tags, created_at").gte("created_at", desde);

    const leads = { total: contacts?.length ?? 0, inbound: 0, outbound: 0, meta: 0, google: 0, organico: 0, carga: 0, saude: 0, outros: 0 };
    for (const c of contacts ?? []) {
      const src = (c.utm_source ?? c.lead_source ?? "").toLowerCase();
      const vert = (c.vertical ?? "").toLowerCase();
      const tags = (c.tags ?? []).join(" ").toLowerCase();
      if (src.includes("meta") || src.includes("facebook") || src.includes("instagram")) leads.meta++;
      else if (src.includes("google")) leads.google++;
      else leads.organico++;
      if (c.lead_source === "prospecting" || c.lead_source === "outbound") leads.outbound++;
      else leads.inbound++;
      if (vert.includes("transporte") || vert.includes("carga") || tags.includes("transporte")) leads.carga++;
      else if (vert.includes("saude") || vert.includes("saúde") || tags.includes("saude")) leads.saude++;
      else leads.outros++;
    }

    const { data: convAgentes } = await supabase.from("conversations").select("current_agent_id, agents(name)").gte("created_at", desde);
    const porAgente: Record<string, number> = {};
    for (const c of convAgentes ?? []) { const nome = (c.agents as any)?.name ?? "Sem agente"; porAgente[nome] = (porAgente[nome] ?? 0) + 1; }

    const { data: convVendedores } = await supabase.from("conversations").select("assigned_user_id, team_members!conversations_assigned_user_id_fkey(name)").not("assigned_user_id", "is", null).gte("created_at", desde);
    const porVendedor: Record<string, number> = {};
    for (const c of convVendedores ?? []) { const nome = (c.team_members as any)?.name ?? "Desconhecido"; porVendedor[nome] = (porVendedor[nome] ?? 0) + 1; }

    const { count: totalConversas } = await supabase.from("conversations").select("id", { count: "exact", head: true }).gte("created_at", desde);
    const { count: conversoesAtivas } = await supabase.from("conversations").select("id", { count: "exact", head: true }).eq("is_active", true).gte("created_at", desde);

    const { count: enviadosPipedrive } = await supabase.from("contacts").select("id", { count: "exact", head: true }).not("sent_to_pipedrive_at", "is", null).eq("pipedrive_sync_status", "sent").gte("sent_to_pipedrive_at", desde);
    const { count: falhasPipedrive } = await supabase.from("contacts").select("id", { count: "exact", head: true }).eq("pipedrive_sync_status", "failed").gte("updated_at", desde);

    const { data: deals } = await supabase.from("deals").select("stage, value, won_at, lost_at, created_at").gte("created_at", desde);
    const dealsStats = { total: deals?.length ?? 0, em_andamento: 0, ganhos: 0, perdidos: 0, valor_ganho: 0 };
    for (const d of deals ?? []) {
      if (d.won_at || d.stage === "won") { dealsStats.ganhos++; dealsStats.valor_ganho += Number(d.value ?? 0); }
      else if (d.lost_at || d.stage === "lost") dealsStats.perdidos++;
      else dealsStats.em_andamento++;
    }

    const { data: campanhas } = await supabase.from("whatsapp_campaigns").select("sent_count, replied_count").in("status", ["running", "completed", "paused"]).gte("created_at", desde);
    const campStats = { total: campanhas?.length ?? 0, templates_enviados: campanhas?.reduce((s, c) => s + (c.sent_count ?? 0), 0) ?? 0, responderam: campanhas?.reduce((s, c) => s + (c.replied_count ?? 0), 0) ?? 0 };

    return new Response(JSON.stringify({
      ok: true, periodo, desde, timestamp: new Date().toISOString(),
      leads,
      conversas: { total: totalConversas ?? 0, ativas: conversoesAtivas ?? 0, por_agente: porAgente, por_vendedor: porVendedor },
      pipedrive: { enviados: enviadosPipedrive ?? 0, falhas: falhasPipedrive ?? 0 },
      deals: dealsStats,
      campanhas: campStats,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ ok: false, erro: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
