import React from 'react';
import { Rocket, X, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOnboardingStatus } from '@/hooks/useOnboardingStatus';

interface OnboardingBannerProps {
  onOpenWizard: () => void;
}

export const OnboardingBanner: React.FC<OnboardingBannerProps> = ({ onOpenWizard }) => {
  const { isComplete, completionPercentage, steps, loading } = useOnboardingStatus();
  const [isDismissed, setIsDismissed] = React.useState(false);

  // Don't show if complete, dismissed, or still loading
  if (loading || isComplete || isDismissed) return null;

  const completedSteps = steps.filter(s => s.isComplete).length;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="mx-4 mt-4 mb-2"
      >
        <div className="bg-gradient-to-r from-cyan-900/30 to-violet-900/20 border border-cyan-500/30 rounded-lg px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center flex-shrink-0">
              <Rocket className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-200">
                Configure seu sistema
              </p>
              <p className="text-xs text-slate-400">
                {completedSteps} de {steps.length} etapas concluídas
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="hidden sm:flex items-center gap-3 flex-1 max-w-[200px]">
            <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${completionPercentage}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className="h-full bg-gradient-to-r from-cyan-500 to-violet-500"
              />
            </div>
            <span className="text-xs text-slate-400 font-mono">{completionPercentage}%</span>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={onOpenWizard}
              className="flex items-center gap-1 px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 text-xs font-medium rounded-md transition-colors"
            >
              Continuar
              <ChevronRight className="w-3 h-3" />
            </button>
            <button
              onClick={() => setIsDismissed(true)}
              className="p-1 hover:bg-slate-800 rounded transition-colors text-slate-500 hover:text-slate-300"
              title="Dispensar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};