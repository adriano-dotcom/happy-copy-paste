import React, { useRef, useState } from 'react';
import { Shield, Bot, Plug, Loader2, Save, RotateCcw, Users, Mail } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import AgentSettings, { AgentSettingsRef } from './settings/AgentSettings';
import ApiSettings, { ApiSettingsRef } from './settings/ApiSettings';
import AgentsSettings, { AgentsSettingsRef } from './settings/AgentsSettings';
import EmailTemplatesSettings from './settings/EmailTemplatesSettings';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { Button } from './Button';
import { useOnboardingStatus } from '@/hooks/useOnboardingStatus';
import { useOutletContext } from 'react-router-dom';

interface OutletContext {
  showOnboarding: boolean;
  setShowOnboarding: (show: boolean) => void;
}

const Settings: React.FC = () => {
  const { companyName } = useCompanySettings();
  const agentRef = useRef<AgentSettingsRef>(null);
  const apiRef = useRef<ApiSettingsRef>(null);
  const agentsRef = useRef<AgentsSettingsRef>(null);
  const [activeTab, setActiveTab] = useState('agent');
  const { resetWizard } = useOnboardingStatus();
  const { setShowOnboarding } = useOutletContext<OutletContext>();

  const handleReopenOnboarding = () => {
    resetWizard();
    setShowOnboarding(true);
  };

  const handleSave = async () => {
    if (activeTab === 'agent') {
      await agentRef.current?.save();
    } else if (activeTab === 'apis') {
      await apiRef.current?.save();
    } else if (activeTab === 'agents') {
      await agentsRef.current?.save();
    }
  };

  const handleCancel = () => {
    if (activeTab === 'agent') {
      agentRef.current?.cancel();
    } else if (activeTab === 'apis') {
      apiRef.current?.cancel();
    } else if (activeTab === 'agents') {
      agentsRef.current?.cancel();
    }
  };

  const isSaving = activeTab === 'agent' 
    ? agentRef.current?.isSaving 
    : activeTab === 'apis'
    ? apiRef.current?.isSaving
    : agentsRef.current?.isSaving;

  const showSaveButtons = activeTab !== 'templates';
  
  return (
    <div className="p-8 max-w-5xl mx-auto h-full overflow-y-auto bg-slate-950 text-slate-50 custom-scrollbar">
      <div className="mb-10 flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white">Configurações</h2>
          <p className="text-sm text-slate-400 mt-1">Central de controle da sua instância {companyName}.</p>
        </div>
        <div className="flex gap-2 items-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReopenOnboarding}
            className="text-slate-400 hover:text-white gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Refazer Onboarding
          </Button>
          <span className="px-3 py-1 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs rounded-full font-mono flex items-center">
            <Shield className="w-3 h-3 mr-1" /> Ambiente Seguro
          </span>
        </div>
      </div>

      <Tabs defaultValue="agent" className="w-full" onValueChange={setActiveTab}>
        <div className="flex items-center justify-between mb-8">
          <TabsList>
            <TabsTrigger value="agent" className="gap-2">
              <Bot className="w-4 h-4" />
              Agente
            </TabsTrigger>
            <TabsTrigger value="agents" className="gap-2">
              <Users className="w-4 h-4" />
              Agentes
            </TabsTrigger>
            <TabsTrigger value="apis" className="gap-2">
              <Plug className="w-4 h-4" />
              APIs
            </TabsTrigger>
            <TabsTrigger value="templates" className="gap-2">
              <Mail className="w-4 h-4" />
              Templates
            </TabsTrigger>
          </TabsList>

          {showSaveButtons && (
            <div className="flex gap-3">
              <Button
                variant="ghost"
                onClick={handleCancel}
                disabled={isSaving}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={handleSave}
                disabled={isSaving}
                className="gap-2"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Salvar Alterações
                  </>
                )}
              </Button>
            </div>
          )}
        </div>

        <TabsContent value="agent">
          <AgentSettings ref={agentRef} />
        </TabsContent>

        <TabsContent value="agents">
          <AgentsSettings ref={agentsRef} />
        </TabsContent>

        <TabsContent value="apis">
          <ApiSettings ref={apiRef} />
        </TabsContent>

        <TabsContent value="templates">
          <EmailTemplatesSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Settings;
