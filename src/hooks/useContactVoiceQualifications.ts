import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { VoiceQualification } from './useVoiceQualification';

export const useContactVoiceQualifications = (contactId: string | null) => {
  const [voiceQualifications, setVoiceQualifications] = useState<VoiceQualification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!contactId) {
      setVoiceQualifications([]);
      setLoading(false);
      return;
    }

    const fetchVoiceQualifications = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('voice_qualifications')
        .select('*')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error fetching voice qualifications:', error);
      } else {
        setVoiceQualifications((data || []) as VoiceQualification[]);
      }
      setLoading(false);
    };

    fetchVoiceQualifications();

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`contact-voice-qualifications-${contactId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'voice_qualifications',
          filter: `contact_id=eq.${contactId}`
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setVoiceQualifications(prev => [payload.new as VoiceQualification, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as VoiceQualification;
            setVoiceQualifications(prev =>
              prev.map(v => v.id === updated.id ? updated : v)
            );
          } else if (payload.eventType === 'DELETE') {
            const deletedId = payload.old?.id;
            setVoiceQualifications(prev => prev.filter(v => v.id !== deletedId));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [contactId]);

  return { voiceQualifications, loading };
};
