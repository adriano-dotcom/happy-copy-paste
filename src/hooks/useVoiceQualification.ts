import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface VoiceQualification {
  id: string;
  contact_id: string;
  deal_id: string | null;
  agent_id: string | null;
  elevenlabs_conversation_id: string | null;
  status: string;
  qualification_result: string | null;
  interest_level: string | null;
  call_summary: string | null;
  full_transcript: string | null;
  next_step: string | null;
  best_contact_time: string | null;
  observations: string | null;
  attempt_number: number;
  max_attempts: number;
  scheduled_for: string;
  called_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export function useVoiceQualification(contactId: string | null) {
  return useQuery({
    queryKey: ['voice-qualification', contactId],
    queryFn: async (): Promise<VoiceQualification | null> => {
      if (!contactId) return null;
      const { data, error } = await supabase
        .from('voice_qualifications')
        .select('*')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as VoiceQualification | null;
    },
    enabled: !!contactId,
    staleTime: 30000,
  });
}
