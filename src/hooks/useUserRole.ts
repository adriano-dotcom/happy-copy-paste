import { useAuth } from './useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

type AppRole = 'admin' | 'operator' | 'viewer';

interface UseUserRoleReturn {
  role: AppRole | null;
  isAdmin: boolean;
  isOperator: boolean;
  loading: boolean;
}

export function useUserRole(): UseUserRoleReturn {
  const { user } = useAuth();

  const { data: role = null, isLoading: loading } = useQuery({
    queryKey: ['user-role', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user!.id)
        .maybeSingle();

      if (error) {
        console.error('Error fetching user role:', error);
        return null;
      }
      return (data?.role as AppRole) ?? null;
    },
    enabled: !!user?.id,
    staleTime: Infinity,
  });

  return {
    role,
    isAdmin: role === 'admin',
    isOperator: role === 'operator',
    loading: !!user?.id && loading,
  };
}
