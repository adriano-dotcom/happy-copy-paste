import React, { useState } from 'react';
import { CheckCircle, Circle, Rocket, Send, Loader2, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/Button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { OnboardingStep } from '@/hooks/useOnboardingStatus';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface StepFinishProps {
  steps: OnboardingStep[];
  companyName: string;
  sdrName: string;
  onComplete: () => void;
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

const listItemVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: { 
    opacity: 1, 
    x: 0,
    transition: { type: "spring" as const, stiffness: 300, damping: 24 }
  },
};

export const StepFinish: React.FC<StepFinishProps> = ({
  steps,
  companyName,
  sdrName,
  onComplete,
}) => {
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState(`Olá! Aqui é ${sdrName || 'o agente'} da ${companyName || 'empresa'}. Este é um teste do sistema! 🚀`);
  const [isSending, setIsSending] = useState(false);

  const completedSteps = steps.filter(s => s.isComplete);
  const requiredIncomplete = steps.filter(s => s.isRequired && !s.isComplete);

  const handleSendTest = async () => {
    if (!testPhone) {
      toast.error('Digite um número de telefone');
      return;
    }

    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('test-whatsapp-message', {
        body: {
          phone: testPhone.replace(/\D/g, ''),
          message: testMessage,
        },
      });

      if (error) throw error;

      toast.success('Mensagem de teste enviada!');
    } catch (error: any) {
      console.error('Error sending test:', error);
      toast.error(error.message || 'Erro ao enviar mensagem de teste');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <motion.div 
      className="space-y-8"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div variants={itemVariants} className="text-center mb-8">
        <motion.div 
          className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center"
          whileHover={{ scale: 1.05, rotate: 5 }}
          animate={{ 
            boxShadow: ["0 0 0 0 rgba(16, 185, 129, 0)", "0 0 0 10px rgba(16, 185, 129, 0.1)", "0 0 0 0 rgba(16, 185, 129, 0)"]
          }}
          transition={{ 
            boxShadow: { duration: 2, repeat: Infinity },
            scale: { type: "spring", stiffness: 400 }
          }}
        >
          <Rocket className="w-8 h-8 text-emerald-400" />
        </motion.div>
        <h3 className="text-xl font-semibold text-white mb-2">Tudo Pronto!</h3>
        <p className="text-slate-400 text-sm max-w-md mx-auto">
          Revise suas configurações e teste o sistema antes de começar.
        </p>
      </motion.div>

      {/* Configuration Summary */}
      <motion.div variants={itemVariants} className="max-w-md mx-auto space-y-4">
        <h4 className="text-sm font-medium text-slate-300 mb-3">Resumo da Configuração</h4>
        
        <motion.div 
          className="space-y-2"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {steps.slice(0, -1).map((step, index) => (
            <motion.div
              key={step.id}
              variants={listItemVariants}
              custom={index}
              whileHover={{ scale: 1.02, x: 4 }}
              className={`flex items-center gap-3 p-3 rounded-lg border ${
                step.isComplete
                  ? 'bg-emerald-500/10 border-emerald-500/20'
                  : step.isRequired
                  ? 'bg-red-500/10 border-red-500/20'
                  : 'bg-slate-800/30 border-slate-700/50'
              }`}
            >
              {step.isComplete ? (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 25 }}
                >
                  <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                </motion.div>
              ) : step.isRequired ? (
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
              ) : (
                <Circle className="w-5 h-5 text-slate-500 flex-shrink-0" />
              )}
              <div className="flex-1">
                <p className={`text-sm font-medium ${step.isComplete ? 'text-emerald-400' : step.isRequired ? 'text-red-400' : 'text-slate-400'}`}>
                  {step.title}
                </p>
                <p className="text-xs text-slate-500">{step.description}</p>
              </div>
              {step.isRequired && !step.isComplete && (
                <motion.span 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded"
                >
                  Obrigatório
                </motion.span>
              )}
            </motion.div>
          ))}
        </motion.div>

        {requiredIncomplete.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20"
          >
            <p className="text-xs text-amber-400">
              ⚠️ Complete os passos obrigatórios antes de finalizar.
            </p>
          </motion.div>
        )}
      </motion.div>

      {/* Test Message Section */}
      <motion.div variants={itemVariants} className="max-w-md mx-auto pt-6 border-t border-slate-700/50">
        <h4 className="text-sm font-medium text-slate-300 mb-4 flex items-center gap-2">
          <Send className="w-4 h-4" />
          Enviar Mensagem de Teste
        </h4>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="testPhone" className="text-slate-400 text-xs">
              Número de Telefone (com DDD)
            </Label>
            <Input
              id="testPhone"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="5511999999999"
              className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 font-mono"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="testMessage" className="text-slate-400 text-xs">
              Mensagem de Teste
            </Label>
            <Input
              id="testMessage"
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
              className="bg-slate-800/50 border-slate-700 text-white"
            />
          </div>

          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Button
              variant="secondary"
              onClick={handleSendTest}
              disabled={isSending || !testPhone}
              className="w-full"
            >
              {isSending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Enviar Teste
                </>
              )}
            </Button>
          </motion.div>
        </div>
      </motion.div>

      {/* Complete Button */}
      <motion.div variants={itemVariants} className="max-w-md mx-auto pt-6">
        <motion.div 
          whileHover={{ scale: requiredIncomplete.length === 0 ? 1.02 : 1 }} 
          whileTap={{ scale: requiredIncomplete.length === 0 ? 0.98 : 1 }}
        >
          <Button
            variant="primary"
            onClick={onComplete}
            disabled={requiredIncomplete.length > 0}
            className="w-full py-3 text-base"
          >
            <Rocket className="w-5 h-5 mr-2" />
            Começar a Usar o Sistema
          </Button>
        </motion.div>
        {requiredIncomplete.length > 0 && (
          <p className="text-xs text-slate-500 text-center mt-2">
            Complete os passos obrigatórios para continuar
          </p>
        )}
      </motion.div>
    </motion.div>
  );
};