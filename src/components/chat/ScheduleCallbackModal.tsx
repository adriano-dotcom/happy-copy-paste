import React, { useState, useEffect } from 'react';
import { Loader2, Calendar, Clock, User } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface ScheduleCallbackModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId: string;
  contactName: string;
  onScheduled: () => void;
}

interface TeamMember {
  id: string;
  name: string;
  role: string;
  weight: number | null;
}

export function ScheduleCallbackModal({
  open,
  onOpenChange,
  dealId,
  contactName,
  onScheduled
}: ScheduleCallbackModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [selectedMember, setSelectedMember] = useState<string>('auto');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [notes, setNotes] = useState('');

  // Set default date/time to next business hour
  useEffect(() => {
    if (open) {
      const now = new Date();
      // Round to next hour
      now.setHours(now.getHours() + 1);
      now.setMinutes(0);
      
      // If weekend, move to Monday
      if (now.getDay() === 0) now.setDate(now.getDate() + 1);
      if (now.getDay() === 6) now.setDate(now.getDate() + 2);
      
      // If after 18:00, move to next day 9:00
      if (now.getHours() >= 18) {
        now.setDate(now.getDate() + 1);
        now.setHours(9);
      }
      // If before 9:00, set to 9:00
      if (now.getHours() < 9) {
        now.setHours(9);
      }

      setScheduledDate(now.toISOString().split('T')[0]);
      setScheduledTime(now.toTimeString().slice(0, 5));
    }
  }, [open]);

  // Fetch team members
  useEffect(() => {
    const fetchTeamMembers = async () => {
      const { data } = await supabase
        .from('team_members')
        .select('id, name, role, weight')
        .eq('status', 'active')
        .order('name');
      
      if (data) setTeamMembers(data);
    };

    if (open) fetchTeamMembers();
  }, [open]);

  const handleSchedule = async () => {
    if (!scheduledDate || !scheduledTime) {
      toast.error('Selecione data e hora');
      return;
    }

    setIsLoading(true);
    try {
      let assignedMemberId = selectedMember;

      // If auto, use weighted round-robin
      if (selectedMember === 'auto' && teamMembers.length > 0) {
        // Get callback assignment tracking
        const { data: assignmentData } = await supabase
          .from('callback_assignments')
          .select('*')
          .single();

        // Simple weighted selection: pick member with lowest assignment count adjusted by weight
        const memberScores = teamMembers.map(m => ({
          id: m.id,
          score: (assignmentData?.assignment_count || 0) / (m.weight || 1)
        }));

        memberScores.sort((a, b) => a.score - b.score);
        assignedMemberId = memberScores[0]?.id || teamMembers[0].id;
      }

      const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();

      // Create activity in deal_activities
      const { error } = await supabase
        .from('deal_activities')
        .insert({
          deal_id: dealId,
          type: 'callback',
          title: `Callback: ${contactName}`,
          description: notes || null,
          scheduled_at: scheduledAt,
          created_by: assignedMemberId !== 'auto' ? assignedMemberId : null,
          is_completed: false
        });

      if (error) throw error;

      const assignedMember = teamMembers.find(m => m.id === assignedMemberId);
      
      toast.success('Callback agendado!', {
        description: `${scheduledDate} às ${scheduledTime}${assignedMember ? ` - ${assignedMember.name}` : ''}`
      });

      // Reset form
      setNotes('');
      setSelectedMember('auto');
      onScheduled();
    } catch (error) {
      console.error('Error scheduling callback:', error);
      toast.error('Erro ao agendar callback');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-slate-100 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-400" />
            Agendar Callback
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Contact Name */}
          <div className="text-sm text-slate-400">
            Lead: <span className="text-slate-200 font-medium">{contactName}</span>
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-slate-300 text-xs flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                Data
              </Label>
              <Input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="bg-slate-950/50 border-slate-700 text-slate-200"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300 text-xs flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Hora
              </Label>
              <Input
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                className="bg-slate-950/50 border-slate-700 text-slate-200"
              />
            </div>
          </div>

          {/* Team Member */}
          <div className="space-y-2">
            <Label className="text-slate-300 text-xs flex items-center gap-1">
              <User className="w-3 h-3" />
              Responsável
            </Label>
            <Select value={selectedMember} onValueChange={setSelectedMember}>
              <SelectTrigger className="bg-slate-950/50 border-slate-700 text-slate-200">
                <SelectValue placeholder="Selecionar responsável" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700">
                <SelectItem value="auto" className="text-slate-200">
                  Automático (round-robin)
                </SelectItem>
                {teamMembers.map(member => (
                  <SelectItem key={member.id} value={member.id} className="text-slate-200">
                    {member.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label className="text-slate-300 text-xs">Observações (opcional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas sobre o callback..."
              className="bg-slate-950/50 border-slate-700 text-slate-200 resize-none h-20"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-slate-600 text-slate-300 hover:bg-slate-800"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSchedule}
            disabled={isLoading}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Calendar className="w-4 h-4 mr-2" />
            )}
            Agendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
