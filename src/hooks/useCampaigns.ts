import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Campaign {
  id: string;
  name: string;
  description: string | null;
  template_id: string | null;
  template_variables: Record<string, any>;
  status: 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'cancelled' | 'failed';
  total_contacts: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  replied_count: number;
  failed_count: number;
  skipped_count: number;
  interval_seconds: number;
  messages_per_batch: number;
  max_failures_before_pause: number;
  current_failure_streak: number;
  is_prospecting: boolean;
  target_pipeline_id: string | null;
  target_stage_id: string | null;
  scheduled_at: string | null;
  started_at: string | null;
  paused_at: string | null;
  completed_at: string | null;
  last_processed_at: string | null;
  owner_id: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  whatsapp_templates?: {
    name: string;
    language: string | null;
  } | null;
}

export interface CampaignContact {
  id: string;
  campaign_id: string;
  contact_id: string;
  status: 'pending' | 'queued' | 'sent' | 'delivered' | 'read' | 'replied' | 'failed' | 'skipped';
  position: number | null;
  scheduled_at: string | null;
  sent_at: string | null;
  error_message: string | null;
  contacts?: {
    name: string | null;
    phone_number: string;
    company: string | null;
  };
}

export interface CreateCampaignParams {
  name: string;
  description?: string;
  template_id: string;
  template_variables?: Record<string, any>;
  contact_ids: string[];
  interval_seconds?: number;
  messages_per_batch?: number;
  is_prospecting?: boolean;
  target_pipeline_id?: string;
  target_stage_id?: string;
  scheduled_at?: string;
  owner_id?: string;
}

export function useCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCampaigns = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('whatsapp_campaigns')
        .select(`
          *,
          whatsapp_templates (name, language)
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      if (fetchError) throw fetchError;
      setCampaigns((data || []) as Campaign[]);
      setError(null);
    } catch (err) {
      console.error('Error fetching campaigns:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch campaigns');
    } finally {
      setLoading(false);
    }
  }, []);

  const createCampaign = useCallback(async (params: CreateCampaignParams): Promise<Campaign | null> => {
    try {
      // Create campaign
      const { data: campaign, error: campaignError } = await supabase
        .from('whatsapp_campaigns')
        .insert({
          name: params.name,
          description: params.description,
          template_id: params.template_id,
          template_variables: params.template_variables || {},
          total_contacts: params.contact_ids.length,
          interval_seconds: params.interval_seconds || 60,
          messages_per_batch: params.messages_per_batch || 1,
          is_prospecting: params.is_prospecting ?? true,
          target_pipeline_id: params.target_pipeline_id,
          target_stage_id: params.target_stage_id,
          scheduled_at: params.scheduled_at,
          owner_id: params.owner_id,
          status: params.scheduled_at ? 'scheduled' : 'draft'
        })
        .select()
        .single();

      if (campaignError) throw campaignError;

      // Create campaign contacts
      const campaignContacts = params.contact_ids.map((contactId, index) => ({
        campaign_id: campaign.id,
        contact_id: contactId,
        position: index + 1,
        status: 'pending' as const
      }));

      const { error: contactsError } = await supabase
        .from('campaign_contacts')
        .insert(campaignContacts);

      if (contactsError) throw contactsError;

      toast.success(`Campanha "${params.name}" criada com ${params.contact_ids.length} contatos`);
      await fetchCampaigns();
      return campaign as Campaign;
    } catch (err) {
      console.error('Error creating campaign:', err);
      toast.error('Erro ao criar campanha');
      return null;
    }
  }, [fetchCampaigns]);

  const startCampaign = useCallback(async (campaignId: string) => {
    try {
      const { error } = await supabase
        .from('whatsapp_campaigns')
        .update({ 
          status: 'running', 
          started_at: new Date().toISOString() 
        })
        .eq('id', campaignId);

      if (error) throw error;

      // Trigger the processor
      await supabase.functions.invoke('process-campaign');
      
      toast.success('Campanha iniciada');
      await fetchCampaigns();
    } catch (err) {
      console.error('Error starting campaign:', err);
      toast.error('Erro ao iniciar campanha');
    }
  }, [fetchCampaigns]);

  const pauseCampaign = useCallback(async (campaignId: string) => {
    try {
      const { error } = await supabase
        .from('whatsapp_campaigns')
        .update({ 
          status: 'paused', 
          paused_at: new Date().toISOString() 
        })
        .eq('id', campaignId);

      if (error) throw error;
      toast.success('Campanha pausada');
      await fetchCampaigns();
    } catch (err) {
      console.error('Error pausing campaign:', err);
      toast.error('Erro ao pausar campanha');
    }
  }, [fetchCampaigns]);

  const resumeCampaign = useCallback(async (campaignId: string) => {
    try {
      const { error } = await supabase
        .from('whatsapp_campaigns')
        .update({ 
          status: 'running',
          error_message: null,
          current_failure_streak: 0
        })
        .eq('id', campaignId);

      if (error) throw error;

      // Trigger the processor
      await supabase.functions.invoke('process-campaign');
      
      toast.success('Campanha retomada');
      await fetchCampaigns();
    } catch (err) {
      console.error('Error resuming campaign:', err);
      toast.error('Erro ao retomar campanha');
    }
  }, [fetchCampaigns]);

  const cancelCampaign = useCallback(async (campaignId: string) => {
    try {
      const { error } = await supabase
        .from('whatsapp_campaigns')
        .update({ 
          status: 'cancelled', 
          completed_at: new Date().toISOString() 
        })
        .eq('id', campaignId);

      if (error) throw error;
      toast.success('Campanha cancelada');
      await fetchCampaigns();
    } catch (err) {
      console.error('Error cancelling campaign:', err);
      toast.error('Erro ao cancelar campanha');
    }
  }, [fetchCampaigns]);

  const getCampaignContacts = useCallback(async (campaignId: string): Promise<CampaignContact[]> => {
    try {
      const { data, error } = await supabase
        .from('campaign_contacts')
        .select(`
          *,
          contacts (name, phone_number, company)
        `)
        .eq('campaign_id', campaignId)
        .order('position', { ascending: true });

      if (error) throw error;
      return (data || []) as CampaignContact[];
    } catch (err) {
      console.error('Error fetching campaign contacts:', err);
      return [];
    }
  }, []);

  // Subscribe to real-time updates
  useEffect(() => {
    fetchCampaigns();

    const channel = supabase
      .channel('campaigns-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whatsapp_campaigns'
        },
        () => {
          fetchCampaigns();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchCampaigns]);

  return {
    campaigns,
    loading,
    error,
    fetchCampaigns,
    createCampaign,
    startCampaign,
    pauseCampaign,
    resumeCampaign,
    cancelCampaign,
    getCampaignContacts
  };
}
