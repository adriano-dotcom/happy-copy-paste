import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  isComplete: boolean;
  isRequired: boolean;
}

export interface OnboardingStatus {
  loading: boolean;
  isComplete: boolean;
  currentStep: number;
  steps: OnboardingStep[];
  completionPercentage: number;
  hasSeenWizard: boolean;
  refetch: () => Promise<void>;
  markWizardSeen: () => void;
  resetWizard: () => void;
}

const WIZARD_SEEN_KEY = 'onboarding_wizard_seen';

export function useOnboardingStatus(): OnboardingStatus {
  const [loading, setLoading] = useState(true);
  const [steps, setSteps] = useState<OnboardingStep[]>([
    {
      id: 'identity',
      title: 'Identidade',
      description: 'Configure o nome da empresa e do agente',
      isComplete: false,
      isRequired: true,
    },
    {
      id: 'whatsapp',
      title: 'WhatsApp',
      description: 'Configure a API do WhatsApp Cloud',
      isComplete: false,
      isRequired: true,
    },
    {
      id: 'agent',
      title: 'Agente',
      description: 'Configure o prompt e comportamento do agente',
      isComplete: false,
      isRequired: false,
    },
    {
      id: 'finish',
      title: 'Finalização',
      description: 'Revise e teste sua configuração',
      isComplete: false,
      isRequired: false,
    },
  ]);
  const [hasSeenWizard, setHasSeenWizard] = useState(() => {
    return localStorage.getItem(WIZARD_SEEN_KEY) === 'true';
  });

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const { data: settings } = await supabase
        .from('nina_settings')
        .select('*')
        .maybeSingle();

      if (settings) {
        setSteps(prev => prev.map(step => {
          switch (step.id) {
            case 'identity':
              return {
                ...step,
                isComplete: !!(settings.company_name && settings.sdr_name),
              };
            case 'whatsapp':
              return {
                ...step,
                isComplete: !!(settings.whatsapp_access_token && settings.whatsapp_phone_number_id),
              };
            case 'agent':
              return {
                ...step,
                isComplete: !!settings.system_prompt_override,
              };
            case 'finish':
              return {
                ...step,
                isComplete: hasSeenWizard,
              };
            default:
              return step;
          }
        }));
      }
    } catch (error) {
      console.error('Error fetching onboarding status:', error);
    } finally {
      setLoading(false);
    }
  }, [hasSeenWizard]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const markWizardSeen = useCallback(() => {
    localStorage.setItem(WIZARD_SEEN_KEY, 'true');
    setHasSeenWizard(true);
    setSteps(prev => prev.map(step => 
      step.id === 'finish' ? { ...step, isComplete: true } : step
    ));
  }, []);

  const resetWizard = useCallback(() => {
    localStorage.removeItem(WIZARD_SEEN_KEY);
    setHasSeenWizard(false);
    setSteps(prev => prev.map(step => 
      step.id === 'finish' ? { ...step, isComplete: false } : step
    ));
  }, []);

  const requiredSteps = steps.filter(s => s.isRequired);
  const completedRequired = requiredSteps.filter(s => s.isComplete).length;
  const allStepsComplete = steps.every(s => s.isComplete);
  const currentStepIndex = steps.findIndex(s => !s.isComplete);
  const completionPercentage = Math.round((steps.filter(s => s.isComplete).length / steps.length) * 100);

  return {
    loading,
    isComplete: allStepsComplete,
    currentStep: currentStepIndex === -1 ? steps.length - 1 : currentStepIndex,
    steps,
    completionPercentage,
    hasSeenWizard,
    refetch: fetchStatus,
    markWizardSeen,
    resetWizard,
  };
}
