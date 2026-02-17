

## Corrigir dynamic_variables do agente Iris na ElevenLabs

### Problema
O prompt da Iris usa 4 variaveis dinamicas (`lead_name`, `produto_interesse`, `lead_id`, `horario`), mas o codigo atual tem 2 problemas:

1. **`horario`** envia data completa (`17/02/2026 13:45:00`) em vez de `HH:MM` como o prompt espera
2. **`produto_interesse`** esta fixo como "Seguro de Carga", mas deveria refletir o real interesse do lead (Auto, Vida, Saude, Empresarial, Transporte)

### Mudancas

**Arquivo: `supabase/functions/trigger-elevenlabs-call/index.ts`**

**1. Corrigir formato do `horario`**
- Alterar de `getNowInSP().toLocaleString('pt-BR')` para extrair apenas `HH:MM`
- Exemplo: `"13:45"` em vez de `"17/02/2026, 13:45:00"`

**2. Tornar `produto_interesse` dinamico**
- Buscar o deal associado ao contato para identificar o pipeline/produto
- Consultar `deals` + `pipelines` para o `contact_id`
- Mapear o nome do pipeline para o produto de interesse:
  - Pipeline "Transporte" → "Seguro de Transporte e Carga"
  - Pipeline "Saude" → "Plano de Saude"
  - Pipeline "Auto" → "Seguro Auto"
  - Pipeline "Empresarial" → "Seguro Empresarial"
  - Pipeline "Vida" → "Seguro de Vida"
  - Fallback → "seguros" (generico)
- Alternativa: se a conversa do lead tiver `nina_context.qualification_answers`, extrair o produto de la

### Codigo da mudanca

Na funcao `processCall`:

```text
// 1. Horario — extrair so HH:MM
const spNow = getNowInSP();
const horarioFormatado = spNow.getHours().toString().padStart(2, '0') 
  + ':' + spNow.getMinutes().toString().padStart(2, '0');

// 2. Produto — buscar do deal/pipeline do contato
const { data: deal } = await supabase
  .from('deals')
  .select('pipeline_id, pipelines(name)')
  .eq('contact_id', vq.contact_id)
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle();

const pipelineName = deal?.pipelines?.name?.toLowerCase() || '';
const produtoMap = {
  'transporte': 'Seguro de Transporte e Carga',
  'saude': 'Plano de Saúde',
  'saúde': 'Plano de Saúde',
  'auto': 'Seguro Auto',
  'empresarial': 'Seguro Empresarial',
  'vida': 'Seguro de Vida',
};
let produtoInteresse = 'seguros';
for (const [key, value] of Object.entries(produtoMap)) {
  if (pipelineName.includes(key)) {
    produtoInteresse = value;
    break;
  }
}

// 3. Enviar variaveis corrigidas
dynamic_variables: {
  lead_name: leadName,
  lead_id: vq.contact_id,
  vq_id: vq.id,
  produto_interesse: produtoInteresse,
  horario: horarioFormatado,
}
```

### Resumo
- `horario`: de `"17/02/2026, 13:45:00"` para `"13:45"`
- `produto_interesse`: de `"Seguro de Carga"` fixo para valor dinamico baseado no pipeline do deal

