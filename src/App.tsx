import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import Sidebar from './components/Sidebar';
import Auth from './pages/Auth';
const ResetPassword = React.lazy(() => import('./pages/ResetPassword'));

// Core routes - sempre carregados (chat é a rota principal)
import ChatInterface from './components/ChatInterface';
import Kanban from './components/Kanban';
import Contacts from './components/Contacts';
import Scheduling from './components/Scheduling';

// Lazy loading para rotas menos frequentes
const Dashboard = React.lazy(() => import('./components/Dashboard'));
const ProspectingDashboard = React.lazy(() => import('./components/ProspectingDashboard'));
const CampaignsDashboard = React.lazy(() => import('./components/CampaignsDashboard'));
const VoiceDashboard = React.lazy(() => import('./components/VoiceDashboard'));
const Settings = React.lazy(() => import('./components/Settings'));
const Team = React.lazy(() => import('./components/Team'));
const Functions = React.lazy(() => import('./components/Functions'));
const MeetingRoom = React.lazy(() => import('./components/MeetingRoom'));
const AutoAttendant = React.lazy(() => import('./pages/AutoAttendant'));

// Loading fallback para lazy routes
const RouteLoader: React.FC = () => (
  <div className="h-full flex items-center justify-center bg-slate-950">
    <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
  </div>
);
import { CompanySettingsProvider } from './hooks/useCompanySettings';
import { AuthProvider } from './hooks/useAuth';
import { UnreadMessagesProvider } from './contexts/UnreadMessagesContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminRoute } from './components/AdminRoute';
import { Toaster } from 'sonner';
import { useIncomingWhatsAppCall } from './hooks/useIncomingWhatsAppCall';
import { IncomingCallModal } from './components/IncomingCallModal';
import AutoAttendantCallBanner from './components/AutoAttendantCallBanner';
import { useAutoAttendantFlag } from './hooks/useAutoAttendantFlag';
import AutoAttendantEngine from './components/AutoAttendantEngine';

// Default redirect component - redirects all users to /chat
const DefaultRedirect: React.FC = () => {
  return <Navigate to="/chat" replace />;
};

// Componente de Layout que envolve a aplicação principal
const AppLayout: React.FC = () => {
  const { incomingCall, suppressedByAutoAttendant, dismissCall, stopRingtone } = useIncomingWhatsAppCall();
  const { isActive: autoAttendantActive } = useAutoAttendantFlag();

  return (
    <div className="flex flex-col md:flex-row h-screen w-full bg-slate-950 text-slate-50 overflow-hidden">
      {/* Background Ambient Glows */}
      <div className="fixed top-0 left-0 w-[500px] h-[500px] bg-cyan-900/20 rounded-full blur-[128px] pointer-events-none -translate-x-1/2 -translate-y-1/2 z-0"></div>
      <div className="fixed bottom-0 right-0 w-[500px] h-[500px] bg-violet-900/10 rounded-full blur-[128px] pointer-events-none translate-x-1/2 translate-y-1/2 z-0"></div>
      
      {/* Auto-Attendant Engine — runs in background when active */}
      {autoAttendantActive && <AutoAttendantEngine />}
      
      {suppressedByAutoAttendant ? (
        <AutoAttendantCallBanner call={incomingCall} />
      ) : (
        <IncomingCallModal 
          call={incomingCall} 
          onDismiss={dismissCall} 
          onStopRingtone={stopRingtone} 
        />
      )}
      
      <Sidebar />
      
      <main className="flex-1 h-full overflow-hidden relative z-10 flex flex-col">
        {/* Top Border Gradient */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-slate-700 to-transparent opacity-50 z-20"></div>
        
        <div className="flex-1 w-full h-full relative overflow-hidden">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});

const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <CompanySettingsProvider>
        <BrowserRouter>
          <Routes>
            {/* Auth Route */}
            <Route path="/auth" element={<Auth />} />
            <Route path="/reset-password" element={
              <Suspense fallback={<RouteLoader />}>
                <ResetPassword />
              </Suspense>
            } />
            
            {/* Rota Externa: Sala de Reunião (Sem Sidebar) */}
            <Route path="/meeting/:id" element={
              <Suspense fallback={<RouteLoader />}>
                <MeetingRoom />
              </Suspense>
            } />

            {/* Auto-Attendant: WhatsApp ↔ ElevenLabs Bridge */}
            <Route path="/auto-attendant" element={
              <ProtectedRoute>
                <Suspense fallback={<RouteLoader />}>
                  <AutoAttendant />
                </Suspense>
              </ProtectedRoute>
            } />

            {/* Rotas Internas (Com Sidebar) - Protected */}
            <Route element={
              <ProtectedRoute>
                <UnreadMessagesProvider>
                  <AppLayout />
                </UnreadMessagesProvider>
              </ProtectedRoute>
            }>
              <Route path="/" element={<DefaultRedirect />} />
              <Route path="/dashboard" element={
                <Suspense fallback={<RouteLoader />}>
                  <Dashboard />
                </Suspense>
              } />
              <Route path="/kanban" element={<Kanban />} />
              <Route path="/chat" element={<ChatInterface />} />
              <Route path="/contacts" element={<Contacts />} />
              <Route path="/scheduling" element={<Scheduling />} />
              <Route path="/team" element={
                <AdminRoute adminOnly>
                  <Suspense fallback={<RouteLoader />}>
                    <Team />
                  </Suspense>
                </AdminRoute>
              } />
              <Route path="/functions" element={
                <AdminRoute adminOnly>
                  <Suspense fallback={<RouteLoader />}>
                    <Functions />
                  </Suspense>
                </AdminRoute>
              } />
              <Route path="/prospecting" element={
                <AdminRoute>
                  <Suspense fallback={<RouteLoader />}>
                    <ProspectingDashboard />
                  </Suspense>
                </AdminRoute>
              } />
              <Route path="/campaigns" element={
                <AdminRoute>
                  <Suspense fallback={<RouteLoader />}>
                    <CampaignsDashboard />
                  </Suspense>
                </AdminRoute>
              } />
              <Route path="/voice-dashboard" element={
                <AdminRoute>
                  <Suspense fallback={<RouteLoader />}>
                    <VoiceDashboard />
                  </Suspense>
                </AdminRoute>
              } />
              <Route path="/settings" element={
                <AdminRoute>
                  <Suspense fallback={<RouteLoader />}>
                    <Settings />
                  </Suspense>
                </AdminRoute>
              } />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster 
          position="top-right"
          richColors
          theme="dark"
        />
      </CompanySettingsProvider>
    </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
