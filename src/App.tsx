import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import ChatInterface from './components/ChatInterface';
import Contacts from './components/Contacts';
import Settings from './components/Settings';
import Team from './components/Team';
import Scheduling from './components/Scheduling';
import Kanban from './components/Kanban';
import MeetingRoom from './components/MeetingRoom';
import Functions from './components/Functions';
import { CompanySettingsProvider } from './hooks/useCompanySettings';
import { Toaster } from 'sonner';
import { OnboardingWizard } from './components/OnboardingWizard';
import { OnboardingBanner } from './components/OnboardingBanner';
import { useOnboardingStatus } from './hooks/useOnboardingStatus';

// Componente de Layout que envolve a aplicação principal
const AppLayout: React.FC = () => {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const { isComplete, hasSeenWizard, loading } = useOnboardingStatus();

  // Show wizard automatically on first load if not complete and never seen
  useEffect(() => {
    if (!loading && !isComplete && !hasSeenWizard) {
      // Just mark as seen, don't auto-open the blocking modal
      // The banner will guide users to open it when ready
    }
  }, [loading, isComplete, hasSeenWizard]);

  return (
    <div className="flex h-screen w-full bg-slate-950 text-slate-50 overflow-hidden">
      {/* Background Ambient Glows */}
      <div className="fixed top-0 left-0 w-[500px] h-[500px] bg-cyan-900/20 rounded-full blur-[128px] pointer-events-none -translate-x-1/2 -translate-y-1/2 z-0"></div>
      <div className="fixed bottom-0 right-0 w-[500px] h-[500px] bg-violet-900/10 rounded-full blur-[128px] pointer-events-none translate-x-1/2 translate-y-1/2 z-0"></div>
      
      <Sidebar />
      
      <main className="flex-1 h-full overflow-hidden relative z-10 flex flex-col">
        {/* Top Border Gradient */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-slate-700 to-transparent opacity-50 z-20"></div>
        
        {/* Onboarding Banner - não-bloqueante */}
        {!isComplete && !loading && (
          <OnboardingBanner onOpenWizard={() => setShowOnboarding(true)} />
        )}
        
        <div className="flex-1 w-full h-full relative overflow-hidden">
          <Outlet context={{ showOnboarding, setShowOnboarding }} />
        </div>
      </main>

      <OnboardingWizard 
        isOpen={showOnboarding} 
        onClose={() => setShowOnboarding(false)} 
      />
    </div>
  );
};
const App: React.FC = () => {
  return (
    <CompanySettingsProvider>
      <BrowserRouter>
        <Routes>
          {/* Rota Externa: Sala de Reunião (Sem Sidebar) */}
          <Route path="/meeting/:id" element={<MeetingRoom />} />

          {/* Rotas Internas (Com Sidebar) */}
          <Route element={<AppLayout />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/kanban" element={<Kanban />} />
            <Route path="/chat" element={<ChatInterface />} />
            <Route path="/contacts" element={<Contacts />} />
            <Route path="/scheduling" element={<Scheduling />} />
            <Route path="/team" element={<Team />} />
            <Route path="/functions" element={<Functions />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster 
        position="top-right"
        richColors
        theme="dark"
      />
    </CompanySettingsProvider>
  );
};

export default App;
