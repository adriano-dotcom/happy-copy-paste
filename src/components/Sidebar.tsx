import React, { useState } from 'react';
import { LayoutDashboard, MessageSquare, Users, Settings as SettingsIcon, LogOut, Command, ShieldCheck, Calendar, Kanban, Code2 } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { Sidebar, SidebarBody, SidebarLink, useSidebar } from '@/components/ui/sidebar';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

const menuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'kanban', label: 'Pipeline', icon: Kanban },
  { id: 'chat', label: 'Chat Ao Vivo', icon: MessageSquare },
  { id: 'contacts', label: 'Contatos', icon: Users },
  { id: 'scheduling', label: 'Agendamentos', icon: Calendar },
  { id: 'team', label: 'Equipe', icon: ShieldCheck },
  { id: 'functions', label: 'Funções', icon: Code2 },
  { id: 'settings', label: 'Configurações', icon: SettingsIcon },
];

const Logo = ({ companyName }: { companyName: string }) => {
  return (
    <Link to="/dashboard" className="flex items-center space-x-3 py-1">
      <div className="relative w-10 h-10 flex items-center justify-center flex-shrink-0">
        <div className="absolute inset-0 bg-cyan-500/20 blur-lg rounded-full" />
        <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
          <Command className="w-5 h-5 text-white" />
        </div>
      </div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="flex flex-col overflow-hidden"
      >
        <span className="font-bold text-lg tracking-tight text-white whitespace-nowrap">{companyName}</span>
        <span className="text-[10px] uppercase tracking-wider text-cyan-500 font-semibold">Workspace</span>
      </motion.div>
    </Link>
  );
};

const LogoIcon = () => {
  return (
    <Link to="/dashboard" className="flex items-center py-1">
      <div className="relative w-10 h-10 flex items-center justify-center flex-shrink-0">
        <div className="absolute inset-0 bg-cyan-500/20 blur-lg rounded-full" />
        <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
          <Command className="w-5 h-5 text-white" />
        </div>
      </div>
    </Link>
  );
};

const SidebarContent = () => {
  const { companyName } = useCompanySettings();
  const location = useLocation();
  const currentPath = location.pathname.substring(1) || 'dashboard';
  const { open, setOpen } = useSidebar();

  const links = menuItems.map(item => ({
    label: item.label,
    href: `/${item.id}`,
    icon: <item.icon className="h-5 w-5" />,
  }));

  return (
    <>
      <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
        <div className="mb-6">
          {open ? <Logo companyName={companyName} /> : <LogoIcon />}
        </div>
        
        <nav className="flex flex-col gap-1.5">
          {links.map((link, idx) => (
            <SidebarLink
              key={idx}
              link={link}
              isActive={currentPath.startsWith(link.href.slice(1))}
            />
          ))}
        </nav>
      </div>

      {/* User Footer */}
      <div className="border-t border-slate-800/50 pt-4">
        <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-800/50 transition-colors cursor-pointer group">
          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-cyan-900 to-slate-800 flex items-center justify-center text-xs font-bold text-cyan-200 border border-slate-700 ring-2 ring-transparent group-hover:ring-cyan-500/20 transition-all flex-shrink-0">
            AD
          </div>
          <motion.div
            animate={{
              display: open ? "block" : "none",
              opacity: open ? 1 : 0,
            }}
            transition={{ duration: 0.2 }}
            className="flex-1 overflow-hidden"
          >
            <p className="text-sm font-medium text-slate-200 group-hover:text-white whitespace-nowrap">Administrador</p>
            <p className="text-xs text-slate-500 truncate">admin@empresa.com</p>
          </motion.div>
          <motion.div
            animate={{
              display: open ? "block" : "none",
              opacity: open ? 1 : 0,
            }}
            transition={{ duration: 0.2 }}
          >
            <LogOut className="w-4 h-4 text-slate-500 hover:text-red-400 transition-colors" />
          </motion.div>
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
