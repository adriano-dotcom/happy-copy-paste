import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Send, Clock, Loader2, Users, Zap, User, Phone, Building2, CheckCircle2, XCircle, Pause, Play, SkipForward, ChevronDown, ChevronUp, ListFilter } from 'lucide-react';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Slider } from './ui/slider';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { ScrollArea } from './ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { api } from '@/services/api';
import { Contact } from '@/types';
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

interface BulkSendTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  contacts: Contact[];
  onComplete: () => void;
}

export const BulkSendTemplateModal: React.FC<BulkSendTemplateModalProps> = ({
  isOpen,
  onClose,
  contacts,
  onComplete
}) => {
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [intervalMinutes, setIntervalMinutes] = useState(1);
  const [isProspecting, setIsProspecting] = useState(true);
  const [progress, setProgress] = useState({ current: 0, total: 0, failed: 0, success: 0, skipped: 0 });
  
  // New states for visual progress
  const [currentContact, setCurrentContact] = useState<Contact | null>(null);
  const [currentPhase, setCurrentPhase] = useState<'sending' | 'waiting'>('sending');
  const [waitingTimeLeft, setWaitingTimeLeft] = useState(0);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  
  // Pause/Resume states
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false);
  
  // Skip contact state
  const skipRequestedRef = useRef(false);
  
  // Multiple contacts skip state
  const [contactsToSkip, setContactsToSkip] = useState<Set<string>>(new Set());
  const [showPendingList, setShowPendingList] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (isOpen) {
      fetchTemplates();
      setProgress({ current: 0, total: contacts.length, failed: 0, success: 0, skipped: 0 });
      setCurrentContact(null);
      setCurrentPhase('sending');
      setWaitingTimeLeft(0);
      setIsPaused(false);
      isPausedRef.current = false;
      skipRequestedRef.current = false;
      setContactsToSkip(new Set());
      setShowPendingList(false);
      setCurrentIndex(0);
    }
    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, [isOpen, contacts.length]);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('whatsapp_templates')
        .select('*')
        .eq('status', 'APPROVED')
        .order('name');

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('Erro ao carregar templates:', error);
      toast.error('Erro ao carregar templates');
    } finally {
      setLoading(false);
    }
  };

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);

  const getTemplatePreview = () => {
    if (!selectedTemplate?.components) return '';
    const components = selectedTemplate.components as any[];
    if (!Array.isArray(components)) return '';
    const bodyComponent = components.find((c: any) => c.type === 'BODY');
    return bodyComponent?.text || '';
  };

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const handlePause = () => {
    isPausedRef.current = true;
    setIsPaused(true);
  };

  const handleResume = () => {
    isPausedRef.current = false;
    setIsPaused(false);
  };

  const handleSkipContact = () => {
    if (currentContact) {
      skipRequestedRef.current = true;
      toast.info(`Pulando ${currentContact.name || 'contato'}...`);
    }
  };

  // Get pending contacts (after current)
  const pendingContacts = useMemo(() => {
    if (!sending) return [];
    return contacts.slice(currentIndex + 1).filter(c => !contactsToSkip.has(c.id));
  }, [contacts, currentIndex, contactsToSkip, sending]);

  const toggleContactToSkip = (contactId: string) => {
    setContactsToSkip(prev => {
      const newSet = new Set(prev);
      if (newSet.has(contactId)) {
        newSet.delete(contactId);
      } else {
        newSet.add(contactId);
      }
      return newSet;
    });
  };

  const selectAllPending = () => {
    const allPending = contacts.slice(currentIndex + 1);
    setContactsToSkip(new Set(allPending.map(c => c.id)));
  };

  const clearSelection = () => {
    setContactsToSkip(new Set());
  };

  const startCountdown = (seconds: number) => {
    setWaitingTimeLeft(seconds);
    setCurrentPhase('waiting');
    
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
    }
    
    countdownRef.current = setInterval(() => {
      setWaitingTimeLeft(prev => {
        if (prev <= 1) {
          if (countdownRef.current) {
            clearInterval(countdownRef.current);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const formatCountdown = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStartSending = async () => {
    if (!selectedTemplateId || contacts.length === 0) return;

    setSending(true);
    setProgress({ current: 0, total: contacts.length, failed: 0, success: 0, skipped: 0 });

    let successCount = 0;
    let failCount = 0;
    let skipCount = 0;

    for (let i = 0; i < contacts.length; i++) {
      // Wait if paused
      while (isPausedRef.current) {
        await sleep(100);
      }
      
      const contact = contacts[i];
      setCurrentIndex(i);
      
      // Check if this contact is marked to skip
      if (contactsToSkip.has(contact.id)) {
        skipCount++;
        setProgress(prev => ({ ...prev, current: prev.current + 1, skipped: prev.skipped + 1 }));
        toast.info(`Pulando ${contact.name || 'contato'} (marcado)`);
        // Remove from skip set after processing
        setContactsToSkip(prev => {
          const newSet = new Set(prev);
          newSet.delete(contact.id);
          return newSet;
        });
        continue;
      }
      
      setCurrentContact(contact);
      setCurrentPhase('sending');
      
      try {
        // Get or create conversation
        const conversationResult = await api.getOrCreateConversation(contact.id);
        
        if (!conversationResult) {
          throw new Error('Falha ao criar conversa');
        }

        const conversationId = typeof conversationResult === 'string' 
          ? conversationResult 
          : (conversationResult as any).id;

        // Build variables from contact data
        const variables = [
          contact.name || contact.call_name || 'Cliente'
        ];

        // Send template
        const { error } = await supabase.functions.invoke('send-whatsapp-template', {
          body: {
            contact_id: contact.id,
            conversation_id: conversationId,
            template_name: selectedTemplate?.name,
            language: selectedTemplate?.language || 'pt_BR',
            variables,
            is_prospecting: isProspecting
          }
        });

        if (error) throw error;
        
        successCount++;
        setProgress(prev => ({ ...prev, current: prev.current + 1, success: prev.success + 1 }));

      } catch (error) {
        console.error(`Erro ao enviar para ${contact.name}:`, error);
        failCount++;
        setProgress(prev => ({ ...prev, current: prev.current + 1, failed: prev.failed + 1 }));
      }

      // Wait interval before next send (except for last contact)
      if (i < contacts.length - 1) {
        const waitSeconds = intervalMinutes * 60;
        startCountdown(waitSeconds);
        
        // Interruptible sleep that respects pause and skip
        let elapsed = 0;
        let skipped = false;
        while (elapsed < waitSeconds * 1000) {
          // Check if skip was requested
          if (skipRequestedRef.current) {
            skipRequestedRef.current = false;
            skipped = true;
            skipCount++;
            setProgress(prev => ({ ...prev, skipped: prev.skipped + 1 }));
            if (countdownRef.current) {
              clearInterval(countdownRef.current);
            }
            break;
          }
          
          if (isPausedRef.current) {
            // Stop countdown while paused
            if (countdownRef.current) {
              clearInterval(countdownRef.current);
            }
            await sleep(100);
            continue;
          }
          await sleep(1000);
          elapsed += 1000;
        }
        
        // If skipped, continue to next iteration (skip the next contact)
        if (skipped) {
          continue;
        }
      }
    }

    if (countdownRef.current) {
      clearInterval(countdownRef.current);
    }
    
    setSending(false);
    setCurrentContact(null);
    
    if (skipCount > 0) {
      toast.warning(`${successCount} enviadas, ${skipCount} pulados, ${failCount} falhas`);
    } else if (failCount === 0) {
      toast.success(`${successCount} mensagens enviadas com sucesso!`);
    } else {
      toast.warning(`${successCount} enviadas, ${failCount} falhas`);
    }
    
    onComplete();
    onClose();
  };

  const progressPercentage = progress.total > 0 
    ? Math.round((progress.current / progress.total) * 100) 
    : 0;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Send className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-semibold text-white">Enviar Template em Massa</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} disabled={sending}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-5">
          {/* Contact count badge */}
          <div className="flex items-center gap-2 p-3 bg-slate-800/50 rounded-lg">
            <Users className="w-4 h-4 text-cyan-400" />
            <span className="text-sm text-slate-300">
              <span className="font-semibold text-white">{contacts.length}</span> contato(s) selecionado(s)
            </span>
          </div>

          {/* Template selector */}
          <div className="space-y-2">
            <Label className="text-slate-300">Template</Label>
            <Select 
              value={selectedTemplateId} 
              onValueChange={setSelectedTemplateId}
              disabled={loading || sending}
            >
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                <SelectValue placeholder={loading ? "Carregando..." : "Selecione um template"} />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                {templates.map(template => (
                  <SelectItem key={template.id} value={template.id} className="text-white">
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Interval slider */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-slate-300 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                Intervalo entre envios
              </Label>
              <span className="text-sm font-medium text-white bg-slate-800 px-2 py-1 rounded">
                {intervalMinutes}m
              </span>
            </div>
            <Slider
              value={[intervalMinutes]}
              onValueChange={(v) => setIntervalMinutes(v[0])}
              min={1}
              max={20}
              step={1}
              disabled={sending}
              className="py-2"
            />
            <p className="text-xs text-slate-500">
              Tempo estimado: ~{contacts.length * intervalMinutes} min
            </p>
          </div>

          {/* Prospecting toggle */}
          <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <div>
                <Label className="text-white">Prospecção Ativa</Label>
                <p className="text-xs text-slate-400">Ativar agente Leonardo para qualificação</p>
              </div>
            </div>
            <Switch
              checked={isProspecting}
              onCheckedChange={setIsProspecting}
              disabled={sending}
            />
          </div>

          {/* Template preview */}
          {selectedTemplate && !sending && (
            <div className="space-y-2">
              <Label className="text-slate-300">Preview</Label>
              <div className="p-3 bg-slate-800/80 rounded-lg border border-slate-700">
                <p className="text-sm text-slate-300 whitespace-pre-wrap">
                  {getTemplatePreview() || 'Sem preview disponível'}
                </p>
              </div>
            </div>
          )}

          {/* Progress section - only show when sending */}
          {sending && (
            <div className="space-y-4">
              {/* Progress bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">Progresso</span>
                  <span className="text-white font-medium">
                    {progress.current}/{progress.total} ({progressPercentage}%)
                  </span>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all duration-300"
                    style={{ width: `${progressPercentage}%` }}
                  />
                </div>
              </div>

              {/* Current contact card */}
              {currentContact && (
                <div className="p-4 bg-slate-800/80 rounded-lg border border-slate-700 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                      {currentPhase === 'sending' ? '📤 Enviando para' : '⏳ Próximo envio'}
                    </span>
                    {currentPhase === 'sending' ? (
                      <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Enviando...
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-xs text-amber-400 font-mono">
                        <Clock className="w-3 h-3" />
                        {formatCountdown(waitingTimeLeft)}
                      </div>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-white">
                      <User className="w-4 h-4 text-cyan-400" />
                      <span className="font-medium">
                        {currentContact.name || currentContact.call_name || 'Sem nome'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-400 text-sm">
                      <Phone className="w-3.5 h-3.5" />
                      <span>{displayPhoneInternational(currentContact.phone)}</span>
                    </div>
                    {currentContact.company && (
                      <div className="flex items-center gap-2 text-slate-400 text-sm">
                        <Building2 className="w-3.5 h-3.5" />
                        <span>{currentContact.company}</span>
                      </div>
                    )}
                    
                    {/* Skip button - only show during waiting phase */}
                    {currentPhase === 'waiting' && !isPaused && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSkipContact}
                        className="w-full mt-2 border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white"
                      >
                        <SkipForward className="w-4 h-4 mr-2" />
                        Pular este contato
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Pending contacts list - expandable */}
              {currentPhase === 'waiting' && contacts.slice(currentIndex + 1).length > 0 && (
                <div className="border border-slate-700 rounded-lg overflow-hidden">
                  {/* Header - toggle */}
                  <button
                    onClick={() => setShowPendingList(!showPendingList)}
                    className="w-full flex items-center justify-between p-3 bg-slate-800/50 hover:bg-slate-800 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <ListFilter className="w-4 h-4 text-cyan-400" />
                      <span className="text-sm text-slate-300">
                        {contacts.slice(currentIndex + 1).length} contatos pendentes
                      </span>
                      {contactsToSkip.size > 0 && (
                        <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded-full">
                          {contactsToSkip.size} para pular
                        </span>
                      )}
                    </div>
                    {showPendingList ? (
                      <ChevronUp className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    )}
                  </button>

                  {/* Expandable content */}
                  {showPendingList && (
                    <div className="border-t border-slate-700">
                      {/* Select all / Clear */}
                      <div className="flex items-center justify-between px-3 py-2 bg-slate-800/30 border-b border-slate-700">
                        <button
                          onClick={selectAllPending}
                          className="text-xs text-cyan-400 hover:text-cyan-300"
                        >
                          Selecionar todos
                        </button>
                        {contactsToSkip.size > 0 && (
                          <button
                            onClick={clearSelection}
                            className="text-xs text-slate-400 hover:text-slate-300"
                          >
                            Limpar seleção
                          </button>
                        )}
                      </div>

                      {/* Contact list */}
                      <ScrollArea className="max-h-40">
                        <div className="p-2 space-y-1">
                          {contacts.slice(currentIndex + 1).map(contact => (
                            <label
                              key={contact.id}
                              className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                                contactsToSkip.has(contact.id) 
                                  ? 'bg-amber-500/10 border border-amber-500/30' 
                                  : 'hover:bg-slate-800'
                              }`}
                            >
                              <Checkbox
                                checked={contactsToSkip.has(contact.id)}
                                onCheckedChange={() => toggleContactToSkip(contact.id)}
                                className="border-slate-600 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm text-white truncate">
                                  {contact.name || contact.call_name || 'Sem nome'}
                                </div>
                                <div className="text-xs text-slate-500 truncate">
                                  {displayPhoneInternational(contact.phone)}
                                </div>
                              </div>
                              {contactsToSkip.has(contact.id) && (
                                <SkipForward className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                              )}
                            </label>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  )}
                </div>
              )}

              {/* Success/Skipped/Fail counters */}
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-1.5 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400 font-medium">{progress.success}</span>
                  <span className="text-slate-500">enviados</span>
                </div>
                {progress.skipped > 0 && (
                  <div className="flex items-center gap-1.5 text-sm">
                    <SkipForward className="w-4 h-4 text-amber-400" />
                    <span className="text-amber-400 font-medium">{progress.skipped}</span>
                    <span className="text-slate-500">pulados</span>
                  </div>
                )}
                {progress.failed > 0 && (
                  <div className="flex items-center gap-1.5 text-sm">
                    <XCircle className="w-4 h-4 text-red-400" />
                    <span className="text-red-400 font-medium">{progress.failed}</span>
                    <span className="text-slate-500">falhas</span>
                  </div>
                )}
              </div>

              {/* Pause indicator badge */}
              {isPaused && (
                <div className="flex items-center gap-2 p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <Pause className="w-4 h-4 text-amber-400" />
                  <span className="text-sm text-amber-400 font-medium">Envio pausado</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-slate-800">
          <Button 
            variant="ghost" 
            onClick={onClose}
            disabled={sending}
            className="text-slate-400"
          >
            Cancelar
          </Button>
          
          {/* Pause/Resume button - only show when sending */}
          {sending && (
            <Button
              variant="outline"
              onClick={isPaused ? handleResume : handlePause}
              className={isPaused 
                ? "border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10" 
                : "border-amber-500/50 text-amber-400 hover:bg-amber-500/10"
              }
            >
              {isPaused ? (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Retomar
                </>
              ) : (
                <>
                  <Pause className="w-4 h-4 mr-2" />
                  Pausar
                </>
              )}
            </Button>
          )}
          
          <Button
            onClick={handleStartSending}
            disabled={!selectedTemplateId || sending || contacts.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {sending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Iniciar Envio
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};