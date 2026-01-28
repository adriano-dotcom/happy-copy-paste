

## Plano: Intervalo Aleatório no Envio de Templates em Massa

### Problema Identificado

Atualmente, o slider "Intervalo entre envios" define um valor **fixo** (ex: 1 minuto). Todos os envios utilizam exatamente o mesmo intervalo, o que pode parecer padrão de automação para a Meta e aumentar risco de limitação.

**Comportamento atual:**
```
Envio 1 → espera 60s → Envio 2 → espera 60s → Envio 3
```

**Comportamento desejado:**
```
Envio 1 → espera 45s → Envio 2 → espera 72s → Envio 3 → espera 53s
```

---

### Solução Proposta

#### 1. Alterar UI: Slider com Intervalo Mínimo e Máximo

**Arquivo:** `src/components/BulkSendTemplateModal.tsx`

Substituir o slider único por dois controles (mínimo e máximo):

**De:**
```typescript
const [intervalMinutes, setIntervalMinutes] = useState(1);
```

**Para:**
```typescript
const [intervalMinSeconds, setIntervalMinSeconds] = useState(30);  // 30 segundos mínimo
const [intervalMaxSeconds, setIntervalMaxSeconds] = useState(90);  // 90 segundos máximo
```

#### 2. Nova UI com Range Slider

Alterar a seção de intervalo (~linhas 411-433):

```tsx
{/* Random Interval slider */}
<div className="space-y-3">
  <div className="flex items-center justify-between">
    <Label className="text-slate-300 flex items-center gap-2">
      <Clock className="w-4 h-4 text-amber-400" />
      Intervalo entre envios (aleatório)
    </Label>
    <span className="text-sm font-medium text-white bg-slate-800 px-2 py-1 rounded">
      {intervalMinSeconds}s - {intervalMaxSeconds}s
    </span>
  </div>
  
  {/* Slider mínimo */}
  <div className="space-y-1">
    <Label className="text-xs text-slate-500">Mínimo</Label>
    <Slider
      value={[intervalMinSeconds]}
      onValueChange={(v) => {
        const newMin = v[0];
        setIntervalMinSeconds(newMin);
        if (newMin > intervalMaxSeconds) {
          setIntervalMaxSeconds(newMin);
        }
      }}
      min={10}
      max={180}
      step={5}
      disabled={sending}
    />
  </div>
  
  {/* Slider máximo */}
  <div className="space-y-1">
    <Label className="text-xs text-slate-500">Máximo</Label>
    <Slider
      value={[intervalMaxSeconds]}
      onValueChange={(v) => {
        const newMax = v[0];
        setIntervalMaxSeconds(newMax);
        if (newMax < intervalMinSeconds) {
          setIntervalMinSeconds(newMax);
        }
      }}
      min={10}
      max={180}
      step={5}
      disabled={sending}
    />
  </div>
  
  <p className="text-xs text-slate-500">
    Tempo estimado: ~{Math.round(contacts.length * ((intervalMinSeconds + intervalMaxSeconds) / 2) / 60)} min
  </p>
</div>
```

#### 3. Calcular Intervalo Aleatório no Envio

Alterar a lógica de espera (~linha 302):

**De:**
```typescript
const waitSeconds = intervalMinutes * 60;
startCountdown(waitSeconds);
```

**Para:**
```typescript
// Calcular intervalo aleatório entre min e max
const waitSeconds = Math.floor(
  Math.random() * (intervalMaxSeconds - intervalMinSeconds + 1)
) + intervalMinSeconds;
console.log(`[BulkSend] Random interval: ${waitSeconds}s`);
startCountdown(waitSeconds);
```

---

### Fluxo Após Implementação

```text
UI mostra: "Intervalo: 30s - 90s"
         ↓
Envio 1 → Math.random() gera 47s de espera
         ↓
Envio 2 → Math.random() gera 83s de espera
         ↓
Envio 3 → Math.random() gera 35s de espera
         ↓
...cada envio com intervalo único e imprevisível
```

---

### Valores Padrão Sugeridos

| Parâmetro | Valor | Justificativa |
|-----------|-------|---------------|
| Mínimo padrão | 30s | Evitar rate limit da Meta |
| Máximo padrão | 90s | Variação suficiente para parecer humano |
| Step | 5s | Granularidade prática |
| Range | 10s - 180s | Flexibilidade para diferentes volumes |

---

### Alterações Necessárias

| Arquivo | Linhas | Alteração |
|---------|--------|-----------|
| BulkSendTemplateModal.tsx | 43 | Substituir `intervalMinutes` por `intervalMinSeconds` e `intervalMaxSeconds` |
| BulkSendTemplateModal.tsx | 411-433 | Nova UI com 2 sliders (min/max) |
| BulkSendTemplateModal.tsx | 302 | Calcular `waitSeconds` aleatoriamente |
| BulkSendTemplateModal.tsx | 510 | Atualizar display do tempo restante |

---

### Seção Técnica

**Por que intervalo aleatório?**

- Comportamento mais natural/humano
- Reduz risco de detecção de automação pela Meta
- Padrão comum em ferramentas de automação profissionais

**Cálculo do intervalo:**
```typescript
Math.floor(Math.random() * (max - min + 1)) + min
// Exemplo: min=30, max=90
// Math.random() = 0.5 → Math.floor(0.5 * 61) + 30 = 60s
```

**Tempo estimado:**
- Usa a média entre min e max para estimar
- Ex: (30+90)/2 = 60s médio por envio

