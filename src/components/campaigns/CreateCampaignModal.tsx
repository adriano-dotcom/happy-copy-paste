import React, { useState, useEffect } from 'react';
import { CreateCampaignParams } from '@/hooks/useCampaigns';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Switch } from '../ui/switch';
import { Slider } from '../ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { ScrollArea } from '../ui/scroll-area';
import { Checkbox } from '../ui/checkbox';
import { toast } from 'sonner';
import { 
  Send, Users, Clock, Zap, Loader2, Search, 
  Building2, Phone, User 
} from 'lucide-react';
import { Json } from '@/integrations/supabase/types';
import { displayPhoneInternational } from '@/utils/phoneFormatter';

interface WhatsAppTemplate {
  id: string;
  name: string;
  status: string | null;
  language: string | null;
  components: Json | null;
  variables_count: number | null;
}

interface Contact {
  id: string;
  name: string | null;
  phone_number: string;
  company: string | null;
}

interface Pipeline {
  id: string;
  name: string;
  slug: string;
}

interface PipelineStage {
  id: string;
  title: string;
  pipeline_id: string;
}

interface CreateCampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (params: CreateCampaignParams) => Promise<void>;
  preselectedContactIds?: string[];
}

export const CreateCampaignModal: React.FC<CreateCampaignModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  preselectedContactIds = []
}) => {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [intervalSeconds, setIntervalSeconds] = useState(60);
  const [isProspecting, setIsProspecting] = useState(true);
  const [selectedPipelineId, setSelectedPipelineId] = useState('');
  const [selectedStageId, setSelectedStageId] = useState('');
  
  // Data
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchData();
      if (preselectedContactIds.length > 0) {
        setSelectedContacts(new Set(preselectedContactIds));
      }
    }
  }, [isOpen, preselectedContactIds]);

  useEffect(() => {
    // Load stages when pipeline changes
    if (selectedPipelineId) {
      fetchStages(selectedPipelineId);
    } else {
      setStages([]);
      setSelectedStageId('');
    }
  }, [selectedPipelineId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch templates
      const { data: templatesData } = await supabase
        .from('whatsapp_templates')
        .select('*')
        .eq('status', 'APPROVED')
        .order('name');
      setTemplates(templatesData || []);

      // Fetch contacts
      const { data: contactsData } = await supabase
        .from('contacts')
        .select('id, name, phone_number, company')
        .not('phone_number', 'is', null)
        .order('name');
      setContacts(contactsData || []);

      // Fetch pipelines
      const { data: pipelinesData } = await supabase
        .from('pipelines')
        .select('id, name, slug')
        .eq('is_active', true)
        .order('name');
      setPipelines(pipelinesData || []);

      // Set default pipeline to prospecting
      const prospecting = pipelinesData?.find(p => p.slug === 'prospeccao');
      if (prospecting) {
        setSelectedPipelineId(prospecting.id);
      }

    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  const fetchStages = async (pipelineId: string) => {
    try {
      const { data } = await supabase
        .from('pipeline_stages')
        .select('id, title, pipeline_id')
        .eq('pipeline_id', pipelineId)
        .eq('is_active', true)
        .order('position');
      setStages(data || []);
      
      // Set default stage to first one
      if (data && data.length > 0) {
        const templateSent = data.find(s => s.title === 'Template Enviado');
        setSelectedStageId(templateSent?.id || data[0].id);
      }
    } catch (error) {
      console.error('Error fetching stages:', error);
    }
  };

  const filteredContacts = contacts.filter(contact => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      contact.name?.toLowerCase().includes(query) ||
      contact.phone_number.includes(query) ||
      contact.company?.toLowerCase().includes(query)
    );
  });

  const toggleContact = (contactId: string) => {
    setSelectedContacts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(contactId)) {
        newSet.delete(contactId);
      } else {
        newSet.add(contactId);
      }
      return newSet;
    });
  };

  const selectAllFiltered = () => {
    setSelectedContacts(new Set(filteredContacts.map(c => c.id)));
  };

  const clearSelection = () => {
    setSelectedContacts(new Set());
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error('Nome da campanha é obrigatório');
      return;
    }
    if (!selectedTemplateId) {
      toast.error('Selecione um template');
      return;
    }
    if (selectedContacts.size === 0) {
      toast.error('Selecione pelo menos um contato');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || undefined,
        template_id: selectedTemplateId,
        contact_ids: Array.from(selectedContacts),
        interval_seconds: intervalSeconds,
        is_prospecting: isProspecting,
        target_pipeline_id: isProspecting ? selectedPipelineId : undefined,
        target_stage_id: isProspecting ? selectedStageId : undefined
      });
      
      // Reset form
      setName('');
      setDescription('');
      setSelectedTemplateId('');
      setIntervalSeconds(60);
      setSelectedContacts(new Set());
      setSearchQuery('');
      
    } catch (error) {
      console.error('Error creating campaign:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);
  const getTemplatePreview = () => {
    if (!selectedTemplate?.components) return '';
    const components = selectedTemplate.components as any[];
    if (!Array.isArray(components)) return '';
    const body = components.find((c: any) => c.type === 'BODY');
    return body?.text || '';
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-5 h-5 text-primary" />
            Criar Nova Campanha
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-6 py-4">
            {/* Campaign name */}
            <div className="space-y-2">
              <Label htmlFor="name">Nome da Campanha *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Prospecção Janeiro 2026"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descrição opcional da campanha..."
                rows={2}
              />
            </div>

            {/* Template selector */}
            <div className="space-y-2">
              <Label>Template WhatsApp *</Label>
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map(template => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedTemplate && (
                <div className="p-3 bg-muted rounded-lg text-sm">
                  {getTemplatePreview() || 'Preview não disponível'}
                </div>
              )}
            </div>

            {/* Interval slider */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-400" />
                  Intervalo entre envios
                </Label>
                <span className="text-sm font-medium bg-muted px-2 py-1 rounded">
                  {intervalSeconds}s
                </span>
              </div>
              <Slider
                value={[intervalSeconds]}
                onValueChange={(v) => setIntervalSeconds(v[0])}
                min={5}
                max={300}
                step={5}
              />
              <p className="text-xs text-muted-foreground">
                Tempo estimado: ~{Math.round((selectedContacts.size * intervalSeconds) / 60)} min para {selectedContacts.size} contatos
              </p>
            </div>

            {/* Prospecting toggle */}
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-3">
                <Zap className="w-5 h-5 text-amber-400" />
                <div>
                  <Label>Prospecção Ativa</Label>
                  <p className="text-xs text-muted-foreground">Criar deals e ativar agente Atlas</p>
                </div>
              </div>
              <Switch checked={isProspecting} onCheckedChange={setIsProspecting} />
            </div>

            {/* Pipeline and Stage selectors (only if prospecting) */}
            {isProspecting && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Pipeline</Label>
                  <Select value={selectedPipelineId} onValueChange={setSelectedPipelineId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {pipelines.map(pipeline => (
                        <SelectItem key={pipeline.id} value={pipeline.id}>
                          {pipeline.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Etapa Inicial</Label>
                  <Select value={selectedStageId} onValueChange={setSelectedStageId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {stages.map(stage => (
                        <SelectItem key={stage.id} value={stage.id}>
                          {stage.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Contacts selector */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Contatos ({selectedContacts.size} selecionados)
                </Label>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={selectAllFiltered}>
                    Selecionar todos
                  </Button>
                  <Button variant="ghost" size="sm" onClick={clearSelection}>
                    Limpar
                  </Button>
                </div>
              </div>
              
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar contatos..."
                  className="pl-9"
                />
              </div>

              {/* Contacts list */}
              <ScrollArea className="h-48 border rounded-lg">
                <div className="p-2 space-y-1">
                  {filteredContacts.map(contact => (
                    <div
                      key={contact.id}
                      className="flex items-center gap-3 p-2 rounded hover:bg-muted cursor-pointer"
                      onClick={() => toggleContact(contact.id)}
                    >
                      <Checkbox checked={selectedContacts.has(contact.id)} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <User className="w-3 h-3 text-muted-foreground" />
                          <span className="text-sm font-medium truncate">
                            {contact.name || 'Sem nome'}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {displayPhoneInternational(contact.phone_number)}
                          </span>
                          {contact.company && (
                            <span className="flex items-center gap-1">
                              <Building2 className="w-3 h-3" />
                              {contact.company}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || loading}>
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Criando...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Criar Campanha ({selectedContacts.size} contatos)
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
