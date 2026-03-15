

# Adicionar toggle de Prospecção Ativa no ScheduleCampaignModal

## Mudanças em `src/components/ScheduleCampaignModal.tsx`

1. **Novo estado**: `const [isProspecting, setIsProspecting] = useState(true)`

2. **Imports**: Adicionar `Switch` de `./ui/switch` e `Zap` de `lucide-react`

3. **UI**: Adicionar bloco idêntico ao do BulkSendTemplateModal, entre o bloco de intervalos e o footer:
   - Ícone `Zap` amarelo + Label "Prospecção Ativa" + descrição "Ativar agente Atlas para qualificação"
   - `Switch` controlado por `isProspecting`

4. **Submit**: Passar `is_prospecting: isProspecting` no `createCampaign()` (já existe o campo, apenas tornar dinâmico em vez de hardcoded `true`)

5. **Reset**: Adicionar `setIsProspecting(true)` no `resetAndClose()`

### Arquivo editado
- `src/components/ScheduleCampaignModal.tsx`

