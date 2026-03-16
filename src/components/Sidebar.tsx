import React, { useState } from 'react';
import { LayoutDashboard, MessageSquare, Users, Settings as SettingsIcon, LogOut, ShieldCheck, Calendar, Kanban, Code2, Megaphone, Target, Headphones, Phone } from 'lucide-react';
import { useLocation, Link } from 'react-router-dom';
import { Sidebar, SidebarBody, SidebarLink, useSidebar } from '@/components/ui/sidebar';
import { motion } from 'framer-motion';
import jacometoLogo from '@/assets/jacometo-logo.png';
import { useUserRole } from '@/hooks/useUserRole';
import { useAuth } from '@/hooks/useAuth';
import { useUnreadMessages } from '@/contexts/UnreadMessagesContext';
import { useAutoAttendantFlag } from '@/hooks/useAutoAttendantFlag';

const allMenuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, access: 'all' as const },
  { id: 'kanban', label: 'Pipeline', icon: Kanban, access: 'all' as const },
  { id: 'chat', label: 'Chat Ao Vivo', icon: MessageSquare, access: 'all' as const },
  { id: 'contacts', label: 'Contatos', icon: Users, access: 'all' as const },
  { id: 'scheduling', label: 'Agendamentos', icon: Calendar, access: 'all' as const },
  { id: 'campaigns', label: 'Campanhas', icon: Target, access: 'manager' as const },
  { id: 'prospecting', label: 'Prospecção', icon: Megaphone, access: 'manager' as const },
  { id: 'voice-dashboard', label: 'Ligações IA', icon: Headphones, access: 'manager' as const },
  { id: 'team', label: 'Equipe', icon: ShieldCheck, access: 'admin' as const },
  { id: 'functions', label: 'Funções', icon: Code2, access: 'admin' as const },
  { id: 'settings', label: 'Configurações', icon: SettingsIcon, access: 'admin' as const },
];

const Logo = () => {
  return (
    <Link to="/dashboard" className="flex items-center space-x-3 py-1 group">
      <div className="relative w-11 h-11 flex items-center justify-center flex-shrink-0">
        {/* Glow effect */}
        <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/30 to-teal-500/30 blur-xl rounded-full" />
        {/* Ring */}
        <div className="absolute inset-0 rounded-xl ring-1 ring-white/10 group-hover:ring-cyan-500/30 transition-all" />
        <img src={jacometoLogo} alt="Jacometo" className="relative w-10 h-10 object-contain rounded-xl" />
      </div>
      <motion.div
        initial={false}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="flex flex-col overflow-hidden"
      >
        <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-white to-slate-300 bg-clip-text text-transparent whitespace-nowrap">
          Jacometo
        </span>
        <span className="text-[10px] uppercase tracking-wider bg-gradient-to-r from-cyan-400 to-teal-400 bg-clip-text text-transparent font-bold">
          Íris Sdr
        </span>
      </motion.div>
    </Link>
  );
};

const LogoIcon = () => {
  return (
    <Link to="/dashboard" className="flex items-center py-1 group">
      <div className="relative w-11 h-11 flex items-center justify-center flex-shrink-0">
        {/* Glow effect */}
        <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/30 to-teal-500/30 blur-xl rounded-full" />
        {/* Ring */}
        <div className="absolute inset-0 rounded-xl ring-1 ring-white/10 group-hover:ring-cyan-500/30 transition-all" />
        <img src={jacometoLogo} alt="Jacometo" className="relative w-10 h-10 object-contain rounded-xl" />
      </div>
    </Link>
  );
};

const UnreadPreviewPanel = () => {
  const { pendingLeads, unreadMessages, totalUnread } = useUnreadMessages();
  const { open } = useSidebar();
  const location = useLocation();
  const isOnChatPage = location.pathname === '/chat';

  // Não mostrar se está na página de chat, sidebar fechada, ou sem mensagens
  if (isOnChatPage || !open || totalUnread === 0) return null;

  return (
    <motion.div
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      className="mt-4 pt-4"
    >
      {/* Divider with gradient */}
      <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mb-4" />
      
      {/* Leads aguardando atendimento */}
      {pendingLeads.length > 0 && (
        <>
          <h4 className="text-xs text-slate-400 uppercase tracking-wider mb-3 px-2 font-medium flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-amber-400 to-orange-400" />
            Leads aguardando
            <span className="ml-auto min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-full px-1">
              {pendingLeads.length}
            </span>
          </h4>
          <div className="space-y-1.5 mb-4">
            {pendingLeads.slice(0, 3).map(conv => (
              <Link
                key={conv.id}
                to={`/chat?conversation=${conv.id}`}
                className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.02] hover:bg-gradient-to-r hover:from-amber-500/10 hover:to-transparent border border-white/[0.03] hover:border-amber-500/20 backdrop-blur-sm transition-all duration-300 group"
              >
                <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-amber-800 to-slate-800 flex items-center justify-center text-xs font-bold text-amber-200 ring-2 ring-amber-500/20 group-hover:ring-amber-400/40 shadow-lg shadow-amber-500/10 transition-all flex-shrink-0">
                  {conv.contactInitials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-200 truncate group-hover:text-white transition-colors">
                    {conv.contactName}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {conv.lastMessage.length > 30 ? conv.lastMessage.slice(0, 30) + '...' : conv.lastMessage}
                  </p>
                </div>
                <span className="min-w-[22px] h-[22px] flex items-center justify-center text-[10px] font-bold bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-full px-1.5 shadow-lg shadow-amber-500/40 ring-2 ring-amber-400/30 flex-shrink-0">
                  🆕
                </span>
              </Link>
            ))}
          </div>
        </>
      )}

      {/* Mensagens não lidas */}
      {unreadMessages.length > 0 && (
        <>
          <h4 className="text-xs text-slate-400 uppercase tracking-wider mb-3 px-2 font-medium flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-rose-400 to-pink-400" />
            Mensagens não lidas
          </h4>
          <div className="space-y-1.5">
            {unreadMessages.slice(0, 3).map(conv => (
              <Link
                key={conv.id}
                to={`/chat?conversation=${conv.id}`}
                className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.02] hover:bg-gradient-to-r hover:from-cyan-500/10 hover:to-transparent border border-white/[0.03] hover:border-cyan-500/20 backdrop-blur-sm transition-all duration-300 group"
              >
                <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-cyan-800 to-slate-800 flex items-center justify-center text-xs font-bold text-cyan-200 ring-2 ring-cyan-500/20 group-hover:ring-cyan-400/40 shadow-lg shadow-cyan-500/10 transition-all flex-shrink-0">
                  {conv.contactInitials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-200 truncate group-hover:text-white transition-colors">
                    {conv.contactName}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {conv.lastMessage.length > 30 ? conv.lastMessage.slice(0, 30) + '...' : conv.lastMessage}
                  </p>
                </div>
                <span className="min-w-[22px] h-[22px] flex items-center justify-center text-[11px] font-bold bg-gradient-to-r from-rose-500 to-pink-500 text-white rounded-full px-1.5 shadow-lg shadow-rose-500/40 ring-2 ring-rose-400/30 flex-shrink-0">
                  {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
      
      {(pendingLeads.length > 3 || unreadMessages.length > 3) && (
        <Link
          to="/chat"
          className="block text-center text-xs bg-gradient-to-r from-cyan-400 to-teal-400 bg-clip-text text-transparent font-medium hover:from-cyan-300 hover:to-teal-300 mt-3 py-2 hover:bg-white/[0.03] rounded-lg transition-all"
        >
          Ver todas as conversas
        </Link>
      )}
    </motion.div>
  );
};

const SidebarContent = () => {
  const location = useLocation();
  const currentPath = location.pathname.substring(1) || 'dashboard';
  const { open } = useSidebar();
  const { isAdmin, isAdminOrManager, loading: roleLoading } = useUserRole();
  const { user, signOut } = useAuth();
  const { pendingLeadsCount, unreadMessagesCount } = useUnreadMessages();
  const { isActive: autoAttendantActive, toggle: toggleAutoAttendant } = useAutoAttendantFlag();

  // Filter menu items based on user role
  const menuItems = allMenuItems.filter(item => {
    if (item.access === 'all') return true;
    if (item.access === 'manager') return isAdminOrManager;
    if (item.access === 'admin') return isAdmin;
    return false;
  });

  const links = menuItems.map(item => ({
    id: item.id,
    label: item.label,
    href: `/${item.id}`,
    icon: <item.icon className="h-5 w-5" />,
  }));

  // Get display name from email
  const displayName = user?.email 
    ? user.email.split('@')[0].split('.').map(
        word => word.charAt(0).toUpperCase() + word.slice(1)
      ).join(' ')
    : 'Usuário';
  const displayEmail = user?.email || '';
  const initials = displayName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

  const handleLogout = async () => {
    await signOut();
  };

  return (
    <>
      <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
        <div className="mb-6">
          {open ? <Logo /> : <LogoIcon />}
        </div>
        
        <nav className="flex flex-col gap-1.5">
          {links.map((link, idx) => (
            <SidebarLink
              key={idx}
              link={link}
              isActive={currentPath.startsWith(link.href.slice(1))}
              badge={link.id === 'chat' ? unreadMessagesCount : undefined}
              secondaryBadge={link.id === 'chat' ? pendingLeadsCount : undefined}
            />
          ))}
        </nav>

        {/* Preview de mensagens não lidas */}
        <UnreadPreviewPanel />

        {/* Auto-Attendant Toggle */}
        {isAdmin && (
          <div className="mt-4 pt-4">
            <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mb-4" />
            <button
              onClick={toggleAutoAttendant}
              className={`w-full flex items-center gap-3 p-2.5 rounded-xl border transition-all duration-300 ${
                autoAttendantActive
                  ? 'bg-gradient-to-r from-green-500/10 to-transparent border-green-500/20'
                  : 'bg-white/[0.02] border-white/[0.03] hover:bg-white/[0.04]'
              }`}
            >
              <div className={`relative w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                autoAttendantActive
                  ? 'bg-gradient-to-tr from-green-800 to-slate-800 ring-2 ring-green-500/30'
                  : 'bg-gradient-to-tr from-slate-800 to-slate-900 ring-2 ring-white/10'
              }`}>
                <Phone className={`w-4 h-4 ${autoAttendantActive ? 'text-green-400' : 'text-slate-400'}`} />
                {autoAttendantActive && (
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse ring-2 ring-slate-950" />
                )}
              </div>
              <motion.div
                initial={false}
                animate={{ display: open ? 'block' : 'none', opacity: open ? 1 : 0 }}
                transition={{ duration: 0.2 }}
                className="flex-1 text-left overflow-hidden"
              >
                <p className={`text-sm font-medium whitespace-nowrap ${autoAttendantActive ? 'text-green-300' : 'text-slate-400'}`}>
                  {autoAttendantActive ? 'Iris Ativa' : 'Iris Desligada'}
                </p>
                <p className="text-[10px] text-slate-500 whitespace-nowrap">
                  Auto-Attendant
                </p>
              </motion.div>
            </button>
          </div>
        )}
      </div>

      {/* User Footer */}
      <div className="pt-4">
        {/* Divider with gradient */}
        <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mb-4" />
        
        <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] hover:bg-gradient-to-r hover:from-cyan-500/10 hover:to-transparent border border-white/[0.03] hover:border-cyan-500/20 transition-all duration-300 group">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-slate-800 to-slate-900 flex items-center justify-center text-xs font-bold text-cyan-300 border border-white/10 ring-2 ring-transparent group-hover:ring-cyan-500/30 transition-all flex-shrink-0 shadow-lg shadow-black/20">
            {initials}
          </div>
          <motion.div
            initial={false}
            animate={{
              display: open ? "block" : "none",
              opacity: open ? 1 : 0,
            }}
            transition={{ duration: 0.2 }}
            className="flex-1 overflow-hidden"
          >
            <p className="text-sm font-semibold text-slate-200 group-hover:text-white whitespace-nowrap transition-colors">{displayName}</p>
            <p className="text-xs text-slate-500 truncate">{displayEmail}</p>
          </motion.div>
          <motion.button
            initial={false}
            animate={{
              display: open ? "flex" : "none",
              opacity: open ? 1 : 0,
            }}
            transition={{ duration: 0.2 }}
            onClick={handleLogout}
            className="p-2 rounded-lg bg-white/[0.03] hover:bg-rose-500/20 hover:text-rose-400 border border-transparent hover:border-rose-500/30 transition-all duration-200 flex items-center justify-center"
            title="Sair"
          >
            <LogOut className="w-4 h-4 text-slate-400 group-hover:text-rose-400 transition-colors" />
          </motion.button>
        </div>
      </div>
    </>
  );
};

const AppSidebar: React.FC = () => {
  const [open, setOpen] = useState(false);

  return (
    <Sidebar open={open} setOpen={setOpen}>
      <SidebarBody className="justify-between gap-6">
        <SidebarContent />
      </SidebarBody>
    </Sidebar>
  );
};

export default AppSidebar;
