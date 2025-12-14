import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, User, Phone, Mail, Building2, Tag } from 'lucide-react';
import { api } from '@/services/api';
import type { TagDefinition } from '@/types';

interface Contact {
  id: string;
  name?: string | null;
  phone_number: string;
  email?: string | null;
  company?: string | null;
  tags?: string[] | null;
}

interface SendToPipedriveModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: Contact;
  dealId?: string;
  conversationId?: string;
  onSent?: () => void;
}

export function SendToPipedriveModal({
  open,
  onOpenChange,
  contact,
  dealId,
  conversationId,
  onSent
}: SendToPipedriveModalProps) {
  const [notes, setNotes] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string>('');
  const [availableTags, setAvailableTags] = useState<TagDefinition[]>([]);

  useEffect(() => {
    api.fetchTagDefinitions().then(setAvailableTags).catch(console.error);
  }, []);

  const handleSend = async () => {
    setIsSending(true);
    try {
      const { error } = await supabase.functions.invoke('sync-pipedrive', {
        body: { 
          contactId: contact.id, 
          dealId,
          conversationId,
          notes: notes.trim() || undefined,
          pipedriveTag: selectedTag || undefined
        }
      });

      if (error) throw error;

      // Mover deal para etapa "Enviado Pipedrive" (sync_to_pipedrive = true)
      if (dealId) {
        const { data: deal } = await supabase
          .from('deals')
          .select('pipeline_id')
          .eq('id', dealId)
          .single();

        if (deal?.pipeline_id) {
          const { data: pipedriveStage } = await supabase
            .from('pipeline_stages')
            .select('id')
            .eq('pipeline_id', deal.pipeline_id)
            .eq('sync_to_pipedrive', true)
            .eq('is_active', true)
            .limit(1)
            .maybeSingle();

          if (pipedriveStage) {
            await supabase
              .from('deals')
              .update({ stage_id: pipedriveStage.id })
              .eq('id', dealId);
          }
        }
      }

      toast.success('Contato enviado para Pipedrive!');
      setNotes('');
      setSelectedTag('');
      onOpenChange(false);
      onSent?.();
    } catch (error) {
      console.error('Erro ao sincronizar com Pipedrive:', error);
      toast.error('Erro ao enviar para Pipedrive');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enviar para Pipedrive</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Contact Preview */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-sm">
            {contact.name && (
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{contact.name}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span>{contact.phone_number}</span>
            </div>
            {contact.email && (
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>{contact.email}</span>
              </div>
            )}
            {contact.company && (
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span>{contact.company}</span>
              </div>
            )}
            {contact.tags && contact.tags.length > 0 && (
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-muted-foreground" />
                <div className="flex flex-wrap gap-1">
                  {contact.tags.map((tag) => (
                    <span 
                      key={tag} 
                      className="px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Tag Selector */}
          <div className="space-y-2">
            <Label>Etiqueta Pipedrive (opcional)</Label>
            <Select value={selectedTag} onValueChange={setSelectedTag}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma etiqueta..." />
              </SelectTrigger>
              <SelectContent>
                {availableTags.map(tag => (
                  <SelectItem key={tag.id} value={tag.label}>
                    <div className="flex items-center gap-2">
                      <span 
                        className="w-3 h-3 rounded-full flex-shrink-0" 
                        style={{ backgroundColor: tag.color }} 
                      />
                      {tag.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes Field */}
          <div className="space-y-2">
            <Label htmlFor="pipedrive-notes">Observações (opcional)</Label>
            <Textarea
              id="pipedrive-notes"
              placeholder="Adicione observações sobre este contato..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSend} disabled={isSending}>
            {isSending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Enviar para Pipedrive
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
