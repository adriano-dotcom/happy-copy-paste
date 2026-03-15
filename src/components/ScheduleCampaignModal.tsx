import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Calendar } from './ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Slider } from './ui/slider';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { CalendarDays, Clock, Send, Loader2, Zap } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useCampaigns } from '@/hooks/useCampaigns';
import { toast } from 'sonner';

interface ScheduleCampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
  contactIds: string[];
  onComplete?: () => void;
}

interface WhatsAppTemplate {
  id: string;
  name: string;
  language: string | null;
  status: string | null;
  components: any[] | null;
}

export function ScheduleCampaignModal({ isOpen, onClose, contactIds, onComplete }: ScheduleCampaignModalProps) {
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [selectedTime, setSelectedTime] = useState('09:00');
  const [intervalMinSeconds, setIntervalMinSeconds] = useState(30);
  const [intervalMaxSeconds, setIntervalMaxSeconds] = useState(90);
  const [isProspecting, setIsProspecting] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const { createCampaign } = useCampaigns();

  useEffect(() => {
    if (!isOpen) return;
    setLoadingTemplates(true);
    supabase
      .from('whatsapp_templates')
      .select('id, name, language, status, components')
      .eq('status', 'APPROVED')
      .order('name')
      .then(({ data }) => {
        setTemplates((data as any) || []);
        setLoadingTemplates(false);
      });
  }, [isOpen]);

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);

  const templatePreview = selectedTemplate?.components
    ?.filter((c: any) => c.type === 'BODY')
    .map((c: any) => c.text)
    .join('\n') || '';

  const canSubmit = selectedTemplateId && selectedDate && selectedTime && contactIds.length > 0;

  const averageInterval = Math.round((intervalMinSeconds + intervalMaxSeconds) / 2);

  const handleMinChange = (value: number) => {
    setIntervalMinSeconds(value);
    if (value > intervalMaxSeconds) setIntervalMaxSeconds(value);
  };

  const handleMaxChange = (value: number) => {
    setIntervalMaxSeconds(value);
    if (value < intervalMinSeconds) setIntervalMinSeconds(value);
  };

  const handleSubmit = async () => {
    if (!canSubmit || !selectedDate) return;
    setLoading(true);

    const [hours, minutes] = selectedTime.split(':').map(Number);
    const scheduledAt = new Date(selectedDate);
    scheduledAt.setHours(hours, minutes, 0, 0);

    if (scheduledAt <= new Date()) {
      toast.error('A data/hora deve ser no futuro');
      setLoading(false);
      return;
    }

    const campaignName = `Prospecção ${format(scheduledAt, "dd/MM HH:mm")} - ${contactIds.length} contatos`;

    const result = await createCampaign({
      name: campaignName,
      template_id: selectedTemplateId,
      contact_ids: contactIds,
      interval_seconds: averageInterval,
      is_prospecting: true,
      scheduled_at: scheduledAt.toISOString(),
    });

    setLoading(false);

    if (result) {
      toast.success(`Campanha agendada para ${format(scheduledAt, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`);
      resetAndClose();
      onComplete?.();
    }
  };

  const resetAndClose = () => {
    setSelectedTemplateId('');
    setSelectedDate(undefined);
    setSelectedTime('09:00');
    setIntervalMinSeconds(30);
    setIntervalMaxSeconds(90);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && resetAndClose()}>
      <DialogContent className="bg-slate-900 border-slate-700 text-slate-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-blue-400" />
            Agendar Campanha
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            {contactIds.length} contato{contactIds.length !== 1 ? 's' : ''} selecionado{contactIds.length !== 1 ? 's' : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Template Selection */}
          <div className="space-y-2">
            <Label>Template WhatsApp</Label>
            <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
              <SelectTrigger className="bg-slate-800 border-slate-600">
                <SelectValue placeholder={loadingTemplates ? 'Carregando...' : 'Selecione um template'} />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-600">
                {templates.map(t => (
                  <SelectItem key={t.id} value={t.id} className="text-slate-200 focus:bg-slate-700">
                    {t.name} ({t.language || 'pt_BR'})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Template Preview */}
          {templatePreview && (
            <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700 text-sm text-slate-300 whitespace-pre-wrap max-h-32 overflow-y-auto">
              {templatePreview}
            </div>
          )}

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Data</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn(
                    "w-full justify-start text-left font-normal bg-slate-800 border-slate-600",
                    !selectedDate && "text-muted-foreground"
                  )}>
                    <CalendarDays className="w-4 h-4 mr-2" />
                    {selectedDate ? format(selectedDate, 'dd/MM/yyyy') : 'Selecionar'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-slate-800 border-slate-600" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                    className="p-3 pointer-events-auto"
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Horário</Label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  type="time"
                  value={selectedTime}
                  onChange={(e) => setSelectedTime(e.target.value)}
                  className="pl-10 bg-slate-800 border-slate-600"
                />
              </div>
            </div>
          </div>

          {/* Interval Range */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400" />
                Intervalo entre envios (aleatório)
              </Label>
              <Badge variant="secondary" className="bg-slate-700 text-slate-300">
                {intervalMinSeconds}s - {intervalMaxSeconds}s
              </Badge>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Mínimo</span>
                <span className="text-xs text-slate-500">{intervalMinSeconds}s</span>
              </div>
              <Slider
                value={[intervalMinSeconds]}
                onValueChange={([v]) => handleMinChange(v)}
                min={30}
                max={300}
                step={10}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Máximo</span>
                <span className="text-xs text-slate-500">{intervalMaxSeconds}s</span>
              </div>
              <Slider
                value={[intervalMaxSeconds]}
                onValueChange={([v]) => handleMaxChange(v)}
                min={30}
                max={300}
                step={10}
              />
            </div>

            <p className="text-xs text-slate-500">
              Tempo estimado: ~{Math.ceil((contactIds.length * averageInterval) / 60)} minutos
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={resetAndClose} className="text-slate-400">
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
            Agendar Campanha
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}