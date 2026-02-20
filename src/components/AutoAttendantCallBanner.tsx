import React from 'react';
import { Bot, Phone } from 'lucide-react';
import { IncomingWhatsAppCall } from '@/hooks/useIncomingWhatsAppCall';
import { motion, AnimatePresence } from 'framer-motion';

interface AutoAttendantCallBannerProps {
  call: IncomingWhatsAppCall | null;
}

const AutoAttendantCallBanner: React.FC<AutoAttendantCallBannerProps> = ({ call }) => {
  const displayName = call?.contact_name || call?.from_number || 'Número desconhecido';

  return (
    <AnimatePresence>
      {call && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed top-0 left-0 right-0 z-50 pointer-events-none flex justify-center"
        >
          <div className="mt-2 mx-auto flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan-900/80 backdrop-blur-sm border border-cyan-700/50 shadow-lg pointer-events-auto">
            <Bot className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="text-xs text-cyan-200 whitespace-nowrap">
              Iris atendendo
            </span>
            <span className="text-xs text-slate-400 truncate max-w-[140px]">
              {displayName}
            </span>
            <Phone className="w-3 h-3 text-emerald-400 animate-pulse shrink-0" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AutoAttendantCallBanner;
