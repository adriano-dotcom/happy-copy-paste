import { useState, useEffect } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '@/integrations/supabase/client';

type AppRole = 'admin' | 'operator' | 'viewer';

interface UseUserRoleReturn {
  role: AppRole | null;
  isAdmin: boolean;
  isOperator: boolean;
  loading: boolean;
}

export function useUserRole(): UseUserRoleReturn {
  const { user } = useAuth();
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setRole(null);
      setLoading(false);
      return;
    }

    const fetchRole = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error fetching user role:', error);
        setRole(null);
      } else {
        setRole(data?.role ?? null);
      }
      setLoading(false);
    };

    fetchRole();
  }, [user?.id]);

  return {
    role,
    isAdmin: role === 'admin',
    isOperator: role === 'operator',
    loading,
  };
}
