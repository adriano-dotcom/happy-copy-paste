

# Adicionar intervalo aleatório (mín/máx) no ScheduleCampaignModal

Substituir o slider único de intervalo fixo por dois sliders de mínimo e máximo, igualando o comportamento do "Enviar Template em Massa".

## Mudanças em `src/components/ScheduleCampaignModal.tsx`

1. **Trocar estado**: substituir `intervalSeconds` por `intervalMinSeconds` (default 30) e `intervalMaxSeconds` (default 90)

2. **UI**: Substituir o slider único por:
   - Header com ícone Clock + "Intervalo entre envios (aleatório)" + badge mostrando "30s - 90s"
   - Slider "Mínimo" (30–300, step 10)
   - Slider "Máximo" (30–300, step 10)
   - Garantir que máximo >= mínimo (ajustar automaticamente)
   - Tempo estimado usando média: `(min + max) / 2`

3. **Salvar no `createCampaign`**: passar `interval_seconds` como a média `Math.round((min + max) / 2)` (o campo existente na tabela é único, não suporta range — a variação aleatória real acontece no `process-campaign`)

