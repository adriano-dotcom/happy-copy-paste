import React, { useEffect, useRef } from 'react';
import { Bot } from 'lucide-react';

interface QuestionItem {
  order: number;
  question: string;
}

interface QuickQuestionsDropdownProps {
  questions: QuestionItem[];
  filter: string;
  selectedIndex: number;
  agentName: string;
  onSelect: (question: string) => void;
  onClose: () => void;
}

export const QuickQuestionsDropdown: React.FC<QuickQuestionsDropdownProps> = ({
  questions,
  filter,
  selectedIndex,
  agentName,
  onSelect,
  onClose,
}) => {
  const listRef = useRef<HTMLDivElement>(null);
  
  const filteredQuestions = questions.filter(q => 
    q.question.toLowerCase().includes(filter.toLowerCase())
  );

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedElement = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      selectedElement?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (filteredQuestions.length === 0) {
    return (
      <div className="absolute bottom-full left-0 right-0 mb-2 mx-4 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50">
        <div className="p-4 text-center">
          <p className="text-slate-500 text-sm">Nenhuma pergunta corresponde ao filtro</p>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 mx-4 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-h-64 overflow-hidden z-50">
      <div className="px-4 py-2.5 border-b border-slate-700 bg-slate-800/50">
        <span className="text-xs text-slate-400 flex items-center gap-2">
          <Bot className="w-4 h-4 text-violet-400" />
          Perguntas de {agentName || 'Qualificação'}
          <span className="ml-auto text-slate-500">↑↓ navegar · Enter selecionar · Esc fechar</span>
        </span>
      </div>
      <div ref={listRef} className="p-2 space-y-1 overflow-y-auto max-h-48 custom-scrollbar">
        {filteredQuestions.map((q, idx) => (
          <button
            key={q.order}
            data-index={idx}
            onClick={() => onSelect(q.question)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-start gap-2 transition-colors ${
              idx === selectedIndex 
                ? 'bg-cyan-500/20 text-cyan-100 border border-cyan-500/30' 
                : 'hover:bg-slate-800 text-slate-200 border border-transparent'
            }`}
          >
            <span className={`font-mono text-xs mt-0.5 ${idx === selectedIndex ? 'text-cyan-400' : 'text-slate-500'}`}>
              {q.order}.
            </span>
            <span className="flex-1">{q.question}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
