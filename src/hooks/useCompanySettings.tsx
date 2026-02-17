import React, { createContext, useContext } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface CompanySettings {
  companyName: string;
  sdrName: string;
  loading: boolean;
  refetch: () => Promise<void>;
}

const CompanySettingsContext = createContext<CompanySettings | undefined>(undefined);

export const CompanySettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();

  const { data, isLoading: loading } = useQuery({
    queryKey: ['company-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nina_settings')
        .select('company_name, sdr_name')
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        console.log('[useCompanySettings] No settings found, creating default...');
        const { data: newData, error: insertError } = await supabase
          .from('nina_settings')
          .insert({
            company_name: 'Sua Empresa',
            sdr_name: 'Agente'
          })
          .select('company_name, sdr_name')
          .single();

        if (insertError) {
          console.error('[useCompanySettings] Error creating default settings:', insertError);
          return { company_name: 'Sua Empresa', sdr_name: 'Agente' };
        }
        return newData;
      }
      return data;
    },
    staleTime: Infinity,
  });

  const value: CompanySettings = {
    companyName: data?.company_name || 'Sua Empresa',
    sdrName: data?.sdr_name || 'Agente',
    loading,
    refetch: async () => { await queryClient.invalidateQueries({ queryKey: ['company-settings'] }); },
  };

  return (
    <CompanySettingsContext.Provider value={value}>
      {children}
    </CompanySettingsContext.Provider>
  );
};

export const useCompanySettings = () => {
  const context = useContext(CompanySettingsContext);
  if (context === undefined) {
    throw new Error('useCompanySettings must be used within a CompanySettingsProvider');
  }
  return context;
};
