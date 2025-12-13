import { Keyboard, X } from 'lucide-react';
import { shortcuts } from '@/hooks/useKeyboardShortcuts';

interface KeyboardShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

export const KeyboardShortcutsHelp = ({ isOpen, onClose }: KeyboardShortcutsHelpProps) => {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-cyan-400" />
            Atalhos de Teclado
          </h3>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid gap-2">
          {shortcuts.map(({ key, action }) => (
            <div 
              key={key} 
              className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-800/50 transition-colors"
            >
              <span className="text-slate-300 text-sm">{action}</span>
              <kbd className="bg-slate-800 border border-slate-700 px-2.5 py-1 rounded text-xs font-mono text-cyan-400 min-w-[2.5rem] text-center">
                {key}
              </kbd>
            </div>
          ))}
        </div>

        <p className="mt-5 text-xs text-slate-500 text-center">
          Pressione <kbd className="bg-slate-800 px-1.5 py-0.5 rounded text-cyan-400">?</kbd> a qualquer momento para ver os atalhos
        </p>
      </div>
    </div>
  );
};
