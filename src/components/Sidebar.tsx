import React, { useState } from 'react';
import { LayoutDashboard, MessageSquare, Users, Settings as SettingsIcon, LogOut, ShieldCheck, Calendar, Kanban, Code2, Megaphone, Target } from 'lucide-react';
import { useLocation, Link } from 'react-router-dom';
import { Sidebar, SidebarBody, SidebarLink, useSidebar } from '@/components/ui/sidebar';
import { motion } from 'framer-motion';
import jacometoLogo from '@/assets/jacometo-logo.png';
import { useUserRole } from '@/hooks/useUserRole';
import { useAuth } from '@/hooks/useAuth';
import { useUnreadMessages } from '@/contexts/UnreadMessagesContext';

const allMenuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, adminOnly: false },
  { id: 'kanban', label: 'Pipeline', icon: Kanban, adminOnly: false },
  { id: 'chat', label: 'Chat Ao Vivo', icon: MessageSquare, adminOnly: false },
  { id: 'contacts', label: 'Contatos', icon: Users, adminOnly: false },
  { id: 'scheduling', label: 'Agendamentos', icon: Calendar, adminOnly: false },
  { id: 'campaigns', label: 'Campanhas', icon: Target, adminOnly: true },
  { id: 'prospecting', label: 'Prospecção', icon: Megaphone, adminOnly: true },
  { id: 'team', label: 'Equipe', icon: ShieldCheck, adminOnly: true },
  { id: 'functions', label: 'Funções', icon: Code2, adminOnly: true },
  { id: 'settings', label: 'Configurações', icon: SettingsIcon, adminOnly: true },
];

const Logo = () => {
  return (
    <Link to="/dashboard" className="flex items-center space-x-3 py-1">
      <div className="relative w-10 h-10 flex items-center justify-center flex-shrink-0">
        <div className="absolute inset-0 bg-cyan-500/20 blur-lg rounded-full" />
        <img src={jacometoLogo} alt="Jacometo" className="relative w-10 h-10 object-contain rounded-xl" />
      </div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="flex flex-col overflow-hidden"
      >
        <span className="font-bold text-lg tracking-tight text-white whitespace-nowrap">Jacometo</span>
        <span className="text-[10px] uppercase tracking-wider text-cyan-500 font-semibold">Adri Sdr</span>
      </motion.div>
    </Link>
  );
};

const LogoIcon = () => {
  return (
    <Link to="/dashboard" className="flex items-center py-1">
      <div className="relative w-10 h-10 flex items-center justify-center flex-shrink-0">
        <div className="absolute inset-0 bg-cyan-500/20 blur-lg rounded-full" />
        <img src={jacometoLogo} alt="Jacometo" className="relative w-10 h-10 object-contain rounded-xl" />
      </div>
    </Link>
  );
};

const UnreadPreviewPanel = () => {
  const { unreadConversations, totalUnread } = useUnreadMessages();
  const { open } = useSidebar();
  const location = useLocation();
  const isOnChatPage = location.pathname === '/chat';

  // Não mostrar se está na página de chat, sidebar fechada, ou sem mensagens
  if (isOnChatPage || !open || totalUnread === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-4 border-t border-slate-800/50 pt-4"
    >
      <h4 className="text-xs text-slate-500 uppercase tracking-wider mb-3 px-2 font-medium">
        Mensagens não lidas
      </h4>
      <div className="space-y-1">
        {unreadConversations.slice(0, 5).map(conv => (
          <Link
            key={conv.id}
            to={`/chat?conversation=${conv.id}`}
            className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-800/60 transition-all group"
          >
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-cyan-900 to-slate-800 flex items-center justify-center text-xs font-bold text-cyan-200 border border-slate-700 flex-shrink-0 group-hover:ring-2 group-hover:ring-cyan-500/30 transition-all">
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
            <span className="min-w-[22px] h-[22px] flex items-center justify-center text-[11px] font-bold bg-red-500 text-white rounded-full px-1.5 shadow-lg shadow-red-500/30 flex-shrink-0">
              {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
            </span>
          </Link>
        ))}
      </div>
      {unreadConversations.length > 5 && (
        <Link
          to="/chat"
          className="block text-center text-xs text-cyan-500 hover:text-cyan-400 mt-3 py-2 hover:bg-slate-800/40 rounded-lg transition-colors"
        >
          Ver todas ({totalUnread} mensagens)
        </Link>
      )}
    </motion.div>
  );
};

const SidebarContent = () => {
  const location = useLocation();
  const currentPath = location.pathname.substring(1) || 'dashboard';
  const { open } = useSidebar();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const { user, signOut } = useAuth();
  const { totalUnread } = useUnreadMessages();

  // Filter menu items based on user role
  const menuItems = allMenuItems.filter(item => !item.adminOnly || isAdmin);

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
              badge={link.id === 'chat' ? totalUnread : undefined}
            />
          ))}
        </nav>

        {/* Preview de mensagens não lidas */}
        <UnreadPreviewPanel />
      </div>

      {/* User Footer */}
      <div className="border-t border-slate-800/50 pt-4">
        <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-800/50 transition-colors group">
          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-cyan-900 to-slate-800 flex items-center justify-center text-xs font-bold text-cyan-200 border border-slate-700 ring-2 ring-transparent group-hover:ring-cyan-500/20 transition-all flex-shrink-0">
            {initials}
          </div>
          <motion.div
            animate={{
              display: open ? "block" : "none",
              opacity: open ? 1 : 0,
            }}
            transition={{ duration: 0.2 }}
            className="flex-1 overflow-hidden"
          >
            <p className="text-sm font-medium text-slate-200 group-hover:text-white whitespace-nowrap">{displayName}</p>
            <p className="text-xs text-slate-500 truncate">{displayEmail}</p>
          </motion.div>
          <motion.button
            animate={{
              display: open ? "block" : "none",
              opacity: open ? 1 : 0,
            }}
            transition={{ duration: 0.2 }}
            onClick={handleLogout}
            className="p-1.5 rounded-lg hover:bg-slate-700/50 transition-colors"
            title="Sair"
          >
            <LogOut className="w-4 h-4 text-slate-500 hover:text-red-400 transition-colors" />
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
      <SidebarBody className="justify-between gap-10 bg-slate-950/50 backdrop-blur-xl border-r border-slate-800/50">
        <SidebarContent />
      </SidebarBody>
    </Sidebar>
  );
};

export default AppSidebar;
