import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Clock, Zap, History, Play, BarChart3, MessageSquare, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import AutomationsDashboard from './AutomationsDashboard';

interface Template {
  id: string;
  name: string;
  status: string;
}

interface Automation {
  id: string;
  name: string;
  description: string | null;
  hours_without_response: number;
  time_unit: 'hours' | 'minutes';
  automation_type: 'template' | 'free_text';
  template_id: string | null;
  template_variables: Record<string, string>;
  free_text_message: string | null;
  within_window_only: boolean;
  conversation_statuses: string[];
  max_attempts: number;
  cooldown_hours: number;
  active_hours_start: string;
  active_hours_end: string;
  active_days: number[];
  is_active: boolean;
  created_at: string;
}

interface FollowupLog {
  id: string;
  automation_id: string;
  template_name: string | null;
  status: string;
  hours_waited: number | null;
  created_at: string;
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Dom' },
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sáb' },
];

const VARIABLE_OPTIONS = [
  { value: 'contact.name', label: 'Nome do contato' },
  { value: 'contact.call_name', label: 'Nome de tratamento' },
  { value: 'contact.company', label: 'Empresa' },
  { value: 'hours_waiting', label: 'Horas aguardando' },
];

const FREE_TEXT_VARIABLES = [
  { placeholder: '{nome}', description: 'Nome do contato' },
  { placeholder: '{empresa}', description: 'Empresa do contato' },
];

export default function FollowupAutomationsSettings() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [logs, setLogs] = useState<FollowupLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState<Automation | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    hours_without_response: 2,
    time_unit: 'hours' as 'hours' | 'minutes',
    automation_type: 'free_text' as 'template' | 'free_text',
    template_id: '',
    template_variables: {} as Record<string, string>,
    free_text_message: 'Oi {nome}, ainda consegue continuar?',
    within_window_only: true,
    conversation_statuses: ['nina', 'human'],
    max_attempts: 2,
    cooldown_hours: 4,
    active_hours_start: '09:00',
    active_hours_end: '18:00',
    active_days: [1, 2, 3, 4, 5],
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [automationsRes, templatesRes] = await Promise.all([
        supabase.from('followup_automations').select('*').order('created_at', { ascending: false }),
        supabase.from('whatsapp_templates').select('id, name, status').eq('status', 'APPROVED'),
      ]);

      if (automationsRes.error) throw automationsRes.error;
      if (templatesRes.error) throw templatesRes.error;

      const mappedAutomations: Automation[] = (automationsRes.data || []).map(a => ({
        ...a,
        template_variables: (a.template_variables as Record<string, string>) || {},
        time_unit: (a.time_unit || 'hours') as 'hours' | 'minutes',
        automation_type: (a.automation_type || 'template') as 'template' | 'free_text',
        free_text_message: a.free_text_message || null,
        within_window_only: a.within_window_only ?? false,
      }));

      setAutomations(mappedAutomations);
      setTemplates(templatesRes.data || []);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Erro ao carregar automações');
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('followup_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error('Error loading logs:', error);
      toast.error('Erro ao carregar logs');
    }
  };

  const openCreateModal = () => {
    setEditingAutomation(null);
    setFormData({
      name: '',
      description: '',
      hours_without_response: 2,
      time_unit: 'hours',
      automation_type: 'free_text',
      template_id: '',
      template_variables: {},
      free_text_message: 'Oi {nome}, ainda consegue continuar?',
      within_window_only: true,
      conversation_statuses: ['nina', 'human'],
      max_attempts: 2,
      cooldown_hours: 4,
      active_hours_start: '09:00',
      active_hours_end: '18:00',
      active_days: [1, 2, 3, 4, 5],
    });
    setIsModalOpen(true);
  };

  const openEditModal = (automation: Automation) => {
    setEditingAutomation(automation);
    setFormData({
      name: automation.name,
      description: automation.description || '',
      hours_without_response: automation.hours_without_response,
      time_unit: automation.time_unit || 'hours',
      automation_type: automation.automation_type || 'template',
      template_id: automation.template_id || '',
      template_variables: automation.template_variables || {},
      free_text_message: automation.free_text_message || 'Oi {nome}, ainda consegue continuar?',
      within_window_only: automation.within_window_only ?? false,
      conversation_statuses: automation.conversation_statuses,
      max_attempts: automation.max_attempts,
      cooldown_hours: automation.cooldown_hours,
      active_hours_start: automation.active_hours_start,
      active_hours_end: automation.active_hours_end,
      active_days: automation.active_days,
    });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }

    if (formData.automation_type === 'template' && !formData.template_id) {
      toast.error('Selecione um template para automações do tipo Template');
      return;
    }

    if (formData.automation_type === 'free_text' && !formData.free_text_message?.trim()) {
      toast.error('Mensagem é obrigatória para automações de texto livre');
      return;
    }

    try {
      const payload = {
        name: formData.name,
        description: formData.description || null,
        hours_without_response: formData.hours_without_response,
        time_unit: formData.time_unit,
        automation_type: formData.automation_type,
        template_id: formData.automation_type === 'template' ? formData.template_id : null,
        template_variables: formData.automation_type === 'template' ? formData.template_variables : {},
        free_text_message: formData.automation_type === 'free_text' ? formData.free_text_message : null,
        within_window_only: formData.within_window_only,
        conversation_statuses: formData.conversation_statuses,
        max_attempts: formData.max_attempts,
        cooldown_hours: formData.cooldown_hours,
        active_hours_start: formData.active_hours_start,
        active_hours_end: formData.active_hours_end,
        active_days: formData.active_days,
      };

      if (editingAutomation) {
        const { error } = await supabase
          .from('followup_automations')
          .update(payload)
          .eq('id', editingAutomation.id);

        if (error) throw error;
        toast.success('Automação atualizada');
      } else {
        const { error } = await supabase
          .from('followup_automations')
          .insert(payload);

        if (error) throw error;
        toast.success('Automação criada');
      }

      setIsModalOpen(false);
      loadData();
    } catch (error) {
      console.error('Error saving automation:', error);
      toast.error('Erro ao salvar automação');
    }
  };

  const handleToggleActive = async (automation: Automation) => {
    try {
      const { error } = await supabase
        .from('followup_automations')
        .update({ is_active: !automation.is_active })
        .eq('id', automation.id);

      if (error) throw error;
      
      setAutomations(prev =>
        prev.map(a => a.id === automation.id ? { ...a, is_active: !a.is_active } : a)
      );
      
      toast.success(automation.is_active ? 'Automação desativada' : 'Automação ativada');
    } catch (error) {
      console.error('Error toggling automation:', error);
      toast.error('Erro ao alterar status');
    }
  };

  const handleDelete = async (automation: Automation) => {
    if (!confirm(`Excluir automação "${automation.name}"?`)) return;

    try {
      const { error } = await supabase
        .from('followup_automations')
        .delete()
        .eq('id', automation.id);

      if (error) throw error;
      
      setAutomations(prev => prev.filter(a => a.id !== automation.id));
      toast.success('Automação excluída');
    } catch (error) {
      console.error('Error deleting automation:', error);
      toast.error('Erro ao excluir automação');
    }
  };

  const handleRunNow = async () => {
    setIsRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('process-followups', {});
      
      if (error) throw error;
      
      toast.success(`Processamento concluído: ${data.processed} follow-ups enviados`);
      loadLogs();
    } catch (error) {
      console.error('Error running followups:', error);
      toast.error('Erro ao executar follow-ups');
    } finally {
      setIsRunning(false);
    }
  };

  const toggleDay = (day: number) => {
    setFormData(prev => ({
      ...prev,
      active_days: prev.active_days.includes(day)
        ? prev.active_days.filter(d => d !== day)
        : [...prev.active_days, day].sort(),
    }));
  };

  const toggleStatus = (status: string) => {
    setFormData(prev => ({
      ...prev,
      conversation_statuses: prev.conversation_statuses.includes(status)
        ? prev.conversation_statuses.filter(s => s !== status)
        : [...prev.conversation_statuses, status],
    }));
  };

  const getTemplateName = (templateId: string | null) => {
    if (!templateId) return '-';
    return templates.find(t => t.id === templateId)?.name || 'Template removido';
  };

  const formatTimeDisplay = (automation: Automation) => {
    const unit = automation.time_unit === 'minutes' ? 'min' : 'h';
    return `Após ${automation.hours_without_response}${unit} sem resposta`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <Tabs defaultValue="rules" className="space-y-6">
      <TabsList>
        <TabsTrigger value="rules">
          <Zap className="h-4 w-4 mr-2" />
          Regras
        </TabsTrigger>
        <TabsTrigger value="dashboard">
          <BarChart3 className="h-4 w-4 mr-2" />
          Dashboard
        </TabsTrigger>
      </TabsList>

      <TabsContent value="dashboard">
        <AutomationsDashboard />
      </TabsContent>

      <TabsContent value="rules" className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium">Automações de Follow-up</h3>
            <p className="text-sm text-muted-foreground">
              Configure disparos automáticos quando leads ficam sem responder
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { loadLogs(); setIsLogsModalOpen(true); }}>
              <History className="h-4 w-4 mr-2" />
              Histórico
            </Button>
            <Button variant="outline" size="sm" onClick={handleRunNow} disabled={isRunning}>
              <Play className="h-4 w-4 mr-2" />
              {isRunning ? 'Executando...' : 'Executar Agora'}
            </Button>
            <Button onClick={openCreateModal}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Automação
            </Button>
          </div>
        </div>

      {/* List */}
      {automations.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-muted/20">
          <Zap className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Nenhuma automação configurada</p>
          <Button onClick={openCreateModal} variant="outline" className="mt-4">
            Criar primeira automação
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {automations.map(automation => (
            <div
              key={automation.id}
              className="border rounded-lg p-4 flex items-center justify-between bg-card"
            >
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h4 className="font-medium">{automation.name}</h4>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    automation.is_active 
                      ? 'bg-green-500/20 text-green-600' 
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    {automation.is_active ? 'Ativa' : 'Inativa'}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${
                    automation.automation_type === 'free_text' 
                      ? 'bg-blue-500/20 text-blue-600' 
                      : 'bg-purple-500/20 text-purple-600'
                  }`}>
                    {automation.automation_type === 'free_text' ? (
                      <><MessageSquare className="h-3 w-3" /> Texto Livre</>
                    ) : (
                      <><FileText className="h-3 w-3" /> Template</>
                    )}
                  </span>
                  {automation.within_window_only && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-600">
                      Janela 24h
                    </span>
                  )}
                </div>
                {automation.description && (
                  <p className="text-sm text-muted-foreground mb-2">{automation.description}</p>
                )}
                <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatTimeDisplay(automation)}
                  </span>
                  {automation.automation_type === 'template' && (
                    <span>Template: {getTemplateName(automation.template_id)}</span>
                  )}
                  <span>Máx: {automation.max_attempts}x</span>
                  <span>Horário: {automation.active_hours_start}-{automation.active_hours_end}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={automation.is_active}
                  onCheckedChange={() => handleToggleActive(automation)}
                />
                <Button variant="ghost" size="icon" onClick={() => openEditModal(automation)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(automation)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingAutomation ? 'Editar Automação' : 'Nova Automação'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Nome *</Label>
                <Input
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Ex: Continuar qualificação (2h)"
                />
              </div>

              <div className="col-span-2">
                <Label>Descrição</Label>
                <Textarea
                  value={formData.description}
                  onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Descrição opcional..."
                  rows={2}
                />
              </div>

              {/* Automation Type Toggle */}
              <div className="col-span-2">
                <Label>Tipo de automação</Label>
                <div className="flex gap-2 mt-2">
                  <Button
                    type="button"
                    variant={formData.automation_type === 'free_text' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFormData(prev => ({ ...prev, automation_type: 'free_text', within_window_only: true }))}
                    className="flex items-center gap-2"
                  >
                    <MessageSquare className="h-4 w-4" />
                    Texto Livre (Janela 24h)
                  </Button>
                  <Button
                    type="button"
                    variant={formData.automation_type === 'template' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFormData(prev => ({ ...prev, automation_type: 'template' }))}
                    className="flex items-center gap-2"
                  >
                    <FileText className="h-4 w-4" />
                    Template WhatsApp
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {formData.automation_type === 'free_text' 
                    ? 'Envia mensagem de texto livre. Funciona apenas dentro da janela de 24h do WhatsApp.' 
                    : 'Envia template aprovado pelo WhatsApp. Funciona mesmo fora da janela de 24h.'}
                </p>
              </div>

              {/* Time Configuration */}
              <div>
                <Label>Tempo sem resposta</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min={1}
                    value={formData.hours_without_response}
                    onChange={e => setFormData(prev => ({ ...prev, hours_without_response: parseInt(e.target.value) || 1 }))}
                    className="flex-1"
                  />
                  <Select
                    value={formData.time_unit}
                    onValueChange={(value: 'hours' | 'minutes') => setFormData(prev => ({ ...prev, time_unit: value }))}
                  >
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hours">Horas</SelectItem>
                      <SelectItem value="minutes">Minutos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Within Window Only Checkbox - only for templates */}
              {formData.automation_type === 'template' && (
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.within_window_only}
                    onCheckedChange={checked => setFormData(prev => ({ ...prev, within_window_only: checked }))}
                  />
                  <Label className="text-sm">Apenas dentro da janela 24h</Label>
                </div>
              )}

              {/* Free Text Message */}
              {formData.automation_type === 'free_text' && (
                <div className="col-span-2">
                  <Label>Mensagem *</Label>
                  <Textarea
                    value={formData.free_text_message}
                    onChange={e => setFormData(prev => ({ ...prev, free_text_message: e.target.value }))}
                    placeholder="Oi {nome}, ainda consegue continuar?"
                    rows={3}
                  />
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className="text-xs text-muted-foreground">Variáveis disponíveis:</span>
                    {FREE_TEXT_VARIABLES.map(v => (
                      <span 
                        key={v.placeholder} 
                        className="text-xs px-2 py-0.5 bg-muted rounded cursor-pointer hover:bg-muted/80"
                        onClick={() => setFormData(prev => ({ 
                          ...prev, 
                          free_text_message: prev.free_text_message + ' ' + v.placeholder 
                        }))}
                        title={`Clique para inserir: ${v.description}`}
                      >
                        {v.placeholder}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Template Selection - only for template type */}
              {formData.automation_type === 'template' && (
                <>
                  <div className="col-span-2">
                    <Label>Template WhatsApp *</Label>
                    <Select
                      value={formData.template_id}
                      onValueChange={value => setFormData(prev => ({ ...prev, template_id: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um template" />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.filter(t => t.id && t.id.trim() !== '').map(template => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="col-span-2">
                    <Label>Variáveis do template</Label>
                    <p className="text-xs text-muted-foreground mb-2">
                      Mapeie as variáveis do template para dados do contato
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {[1, 2, 3].map(i => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground w-12">{`{${i}}`}</span>
                          <Select
                            value={formData.template_variables[i.toString()] || ''}
                            onValueChange={value => setFormData(prev => ({
                              ...prev,
                              template_variables: { ...prev.template_variables, [i.toString()]: value === '__none__' ? '' : value }
                            }))}
                          >
                            <SelectTrigger className="flex-1">
                              <SelectValue placeholder="Selecione..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">Não usar</SelectItem>
                              {VARIABLE_OPTIONS.map(opt => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <div>
                <Label>Máximo de tentativas</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={formData.max_attempts}
                  onChange={e => setFormData(prev => ({ ...prev, max_attempts: parseInt(e.target.value) || 1 }))}
                />
              </div>

              <div>
                <Label>Cooldown (horas entre disparos)</Label>
                <Input
                  type="number"
                  min={1}
                  value={formData.cooldown_hours}
                  onChange={e => setFormData(prev => ({ ...prev, cooldown_hours: parseInt(e.target.value) || 4 }))}
                />
              </div>

              <div>
                <Label>Horário início</Label>
                <Input
                  type="time"
                  value={formData.active_hours_start}
                  onChange={e => setFormData(prev => ({ ...prev, active_hours_start: e.target.value }))}
                />
              </div>

              <div>
                <Label>Horário fim</Label>
                <Input
                  type="time"
                  value={formData.active_hours_end}
                  onChange={e => setFormData(prev => ({ ...prev, active_hours_end: e.target.value }))}
                />
              </div>

              <div className="col-span-2">
                <Label>Dias ativos</Label>
                <div className="flex gap-2 mt-2">
                  {DAYS_OF_WEEK.map(day => (
                    <Button
                      key={day.value}
                      type="button"
                      variant={formData.active_days.includes(day.value) ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => toggleDay(day.value)}
                    >
                      {day.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="col-span-2">
                <Label>Status de conversa permitidos</Label>
                <div className="flex gap-2 mt-2">
                  {['nina', 'human', 'paused'].map(status => (
                    <Button
                      key={status}
                      type="button"
                      variant={formData.conversation_statuses.includes(status) ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => toggleStatus(status)}
                    >
                      {status === 'nina' ? '🤖 Nina' : status === 'human' ? '👤 Humano' : '⏸ Pausado'}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave}>
              {editingAutomation ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Logs Modal */}
      <Dialog open={isLogsModalOpen} onOpenChange={setIsLogsModalOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Histórico de Follow-ups</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            {logs.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhum follow-up enviado ainda
              </p>
            ) : (
              logs.map(log => (
                <div
                  key={log.id}
                  className="flex items-center justify-between p-3 border rounded-lg text-sm"
                >
                  <div>
                    <span className="font-medium">{log.template_name || 'Mensagem'}</span>
                    <span className="text-muted-foreground ml-2">
                      após {log.hours_waited?.toFixed(1)}h
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      log.status === 'sent' 
                        ? 'bg-green-500/20 text-green-600' 
                        : 'bg-red-500/20 text-red-600'
                    }`}>
                      {log.status === 'sent' ? 'Enviado' : 'Falhou'}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {format(new Date(log.created_at), "dd/MM HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
      </TabsContent>
    </Tabs>
  );
}