import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface UseAutoAttendantFlagReturn {
  isActive: boolean;
  loading: boolean;
  toggle: () => Promise<void>;
}

export function useAutoAttendantFlag(): UseAutoAttendantFlagReturn {
  const [isActive, setIsActive] = useState(false);
  const [loading, setLoading] = useState(true);

  // Initial fetch
  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('nina_settings')
        .select('auto_attendant_active')
        .limit(1)
        .single();
      if (data) setIsActive(data.auto_attendant_active);
      setLoading(false);
    };
    fetch();
  }, []);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('auto-attendant-flag')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'nina_settings',
      }, (payload: any) => {
        if (payload.new && typeof payload.new.auto_attendant_active === 'boolean') {
          setIsActive(payload.new.auto_attendant_active);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const toggle = useCallback(async () => {
    const newValue = !isActive;
    const { data: settings } = await supabase
      .from('nina_settings')
      .select('id')
      .limit(1)
      .single();
    
    if (settings) {
      await supabase
        .from('nina_settings')
        .update({ auto_attendant_active: newValue } as any)
        .eq('id', settings.id);
    }
    setIsActive(newValue);
  }, [isActive]);

  return { isActive, loading, toggle };
}
