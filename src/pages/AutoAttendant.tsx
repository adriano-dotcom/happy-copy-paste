import React from 'react';
import { Activity, Radio } from 'lucide-react';
import { useAutoAttendantFlag } from '@/hooks/useAutoAttendantFlag';

const AutoAttendant: React.FC = () => {
  const { isActive, toggle } = useAutoAttendantFlag();

  return (
    <div className="h-full flex flex-col items-center justify-center bg-slate-950 p-8">
      <div className="max-w-2xl w-full space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-3">
            <Radio className="w-8 h-8 text-cyan-400" />
            <h1 className="text-3xl font-bold text-white">Auto-Attendant</h1>
          </div>
          <p className="text-slate-400">
            Bridge de áudio Meta WhatsApp ↔ ElevenLabs (Iris)
          </p>
        </div>

        {/* Status Card */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isActive ? (
                <>
                  <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-green-400 font-semibold">Ativo — Escutando chamadas em background</span>
                </>
              ) : (
                <>
                  <div className="w-3 h-3 rounded-full bg-slate-600" />
                  <span className="text-slate-400 font-semibold">Desativado</span>
                </>
              )}
            </div>
            <button
              onClick={toggle}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-red-600/20 hover:bg-red-600/30 text-red-400'
                  : 'bg-cyan-600 hover:bg-cyan-500 text-white'
              }`}
            >
              {isActive ? 'Desativar' : 'Ativar'}
            </button>
          </div>
        </div>

        {/* Info */}
        <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-4 text-sm text-cyan-300/80">
          <strong className="text-cyan-300">ℹ️ Como funciona:</strong> O Auto-Attendant agora roda em background em qualquer página do sistema.
          Basta ativar pela Sidebar ou por aqui — a Iris atenderá as chamadas automaticamente enquanto qualquer aba do sistema estiver aberta.
        </div>

        {/* Logs placeholder */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-sm text-slate-300 mb-3">
            <Activity className="w-4 h-4" />
            Monitoramento
          </div>
          <div className="text-sm text-slate-500">
            Os logs de chamadas aparecem no console do navegador com o prefixo <code className="text-cyan-400">[AutoAttendantEngine]</code>.
          </div>
        </div>
      </div>
    </div>
  );
};

export default AutoAttendant;
