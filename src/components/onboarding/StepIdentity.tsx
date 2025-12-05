import React from 'react';
import { Building2, User, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface StepIdentityProps {
  companyName: string;
  sdrName: string;
  onCompanyNameChange: (value: string) => void;
  onSdrNameChange: (value: string) => void;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1,
    },
  },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { type: "spring" as const, stiffness: 300, damping: 24 }
  },
};

export const StepIdentity: React.FC<StepIdentityProps> = ({
  companyName,
  sdrName,
  onCompanyNameChange,
  onSdrNameChange,
}) => {
  return (
    <motion.div 
      className="space-y-8"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div variants={itemVariants} className="text-center mb-8">
        <motion.div 
          className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-violet-500/20 border border-cyan-500/30 flex items-center justify-center"
          whileHover={{ scale: 1.05, rotate: 5 }}
          transition={{ type: "spring", stiffness: 400 }}
        >
          <Building2 className="w-8 h-8 text-cyan-400" />
        </motion.div>
        <h3 className="text-xl font-semibold text-white mb-2">Identidade da Empresa</h3>
        <p className="text-slate-400 text-sm max-w-md mx-auto">
          Configure como sua empresa e agente de IA serão identificados no sistema.
        </p>
      </motion.div>

      <div className="space-y-6 max-w-md mx-auto">
        <motion.div variants={itemVariants} className="space-y-2">
          <Label htmlFor="companyName" className="text-slate-300 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-500" />
            Nome da Empresa
          </Label>
          <Input
            id="companyName"
            value={companyName}
            onChange={(e) => onCompanyNameChange(e.target.value)}
            placeholder="Ex: Minha Empresa LTDA"
            className="bg-slate-800/50 border-slate-700 focus:border-cyan-500 text-white placeholder:text-slate-500"
          />
          <p className="text-xs text-slate-500">Aparecerá no header e comunicações</p>
        </motion.div>

        <motion.div variants={itemVariants} className="space-y-2">
          <Label htmlFor="sdrName" className="text-slate-300 flex items-center gap-2">
            <User className="w-4 h-4 text-slate-500" />
            Nome do Agente (SDR)
          </Label>
          <Input
            id="sdrName"
            value={sdrName}
            onChange={(e) => onSdrNameChange(e.target.value)}
            placeholder="Ex: Julia, Carlos, Nina..."
            className="bg-slate-800/50 border-slate-700 focus:border-cyan-500 text-white placeholder:text-slate-500"
          />
          <p className="text-xs text-slate-500">Nome que a IA usará ao se apresentar</p>
        </motion.div>
      </div>

      {/* Preview */}
      {(companyName || sdrName) && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 24 }}
          className="mt-8 p-4 rounded-xl bg-slate-800/30 border border-slate-700/50 max-w-md mx-auto"
        >
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-3">
            <Sparkles className="w-3 h-3" />
            Preview
          </div>
          <div className="space-y-2 text-sm">
            <p className="text-slate-300">
              <span className="text-slate-500">Empresa:</span>{' '}
              <span className="text-white font-medium">{companyName || 'Sua Empresa'}</span>
            </p>
            <p className="text-slate-300">
              <span className="text-slate-500">Agente:</span>{' '}
              <span className="text-cyan-400 font-medium">{sdrName || 'Agente'}</span>
            </p>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
};