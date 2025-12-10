import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Bot, Plus, Trash2, Edit2, Check, X, Loader2, 
  MessageSquare, Sparkles, Star, Users
} from 'lucide-react';
import { Button } from '../Button';

interface Agent {
  id: string;
  name: string;
  slug: string;
  specialty: string | null;
  description: string | null;
  system_prompt: string;
  is_default: boolean;
  is_active: boolean;
  detection_keywords: string[];
  greeting_message: string | null;
  handoff_message: string | null;
  qualification_questions: Array<{ order: number; question: string }>;
  created_at: string;
  updated_at: string;
}

export interface AgentsSettingsRef {
  save: () => Promise<void>;
  cancel: () => void;
  isSaving: boolean;
}

const AgentsSettings = forwardRef<AgentsSettingsRef>((_, ref) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newKeyword, setNewKeyword] = useState('');
  const [newQuestion, setNewQuestion] = useState('');

  useImperativeHandle(ref, () => ({
    save: handleSave,
    cancel: handleCancel,
    isSaving: saving
  }));

  useEffect(() => {
    loadAgents();
  }, []);

  const loadAgents = async () => {
    try {
      const { data, error } = await supabase
        .from('agents')
        .select('*')
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true });

      if (error) throw error;
      
      const parsed = (data || []).map(agent => ({
        ...agent,
        qualification_questions: Array.isArray(agent.qualification_questions) 
          ? agent.qualification_questions 
          : []
      }));
      
      setAgents(parsed as Agent[]);
    } catch (error) {
      console.error('Erro ao carregar agentes:', error);
      toast.error('Erro ao carregar agentes');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editingAgent) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('agents')
        .update({
          name: editingAgent.name,
          slug: editingAgent.slug,
          specialty: editingAgent.specialty,
          description: editingAgent.description,
          system_prompt: editingAgent.system_prompt,
          is_active: editingAgent.is_active,
          detection_keywords: editingAgent.detection_keywords,
          greeting_message: editingAgent.greeting_message,
          handoff_message: editingAgent.handoff_message,
          qualification_questions: editingAgent.qualification_questions
        })
        .eq('id', editingAgent.id);

      if (error) throw error;
      
      toast.success('Agente atualizado!');
      setEditingAgent(null);
      await loadAgents();
    } catch (error) {
      console.error('Erro ao salvar agente:', error);
      toast.error('Erro ao salvar agente');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditingAgent(null);
    setIsCreating(false);
  };

  const handleCreate = async () => {
    if (!editingAgent) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('agents')
        .insert({
          name: editingAgent.name,
          slug: editingAgent.slug.toLowerCase().replace(/\s+/g, '-'),
          specialty: editingAgent.specialty,
          description: editingAgent.description,
          system_prompt: editingAgent.system_prompt,
          is_default: false,
          is_active: true,
          detection_keywords: editingAgent.detection_keywords,
          greeting_message: editingAgent.greeting_message,
          handoff_message: editingAgent.handoff_message,
          qualification_questions: editingAgent.qualification_questions
        });

      if (error) throw error;
      
      toast.success('Agente criado!');
      setEditingAgent(null);
      setIsCreating(false);
      await loadAgents();
    } catch (error) {
      console.error('Erro ao criar agente:', error);
      toast.error('Erro ao criar agente');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (agentId: string) => {
    const agent = agents.find(a => a.id === agentId);
    if (agent?.is_default) {
      toast.error('Não é possível excluir o agente padrão');
      return;
    }

    if (!confirm('Tem certeza que deseja excluir este agente?')) return;

    try {
      const { error } = await supabase
        .from('agents')
        .delete()
        .eq('id', agentId);

      if (error) throw error;
      
      toast.success('Agente excluído');
      await loadAgents();
    } catch (error) {
      console.error('Erro ao excluir agente:', error);
      toast.error('Erro ao excluir agente');
    }
  };

  const handleToggleActive = async (agentId: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('agents')
        .update({ is_active: isActive })
        .eq('id', agentId);

      if (error) throw error;
      
      toast.success(isActive ? 'Agente ativado' : 'Agente desativado');
      await loadAgents();
    } catch (error) {
      console.error('Erro ao atualizar agente:', error);
      toast.error('Erro ao atualizar agente');
    }
  };

  const startCreating = () => {
    setEditingAgent({
      id: '',
      name: '',
      slug: '',
      specialty: '',
      description: '',
      system_prompt: '',
      is_default: false,
      is_active: true,
      detection_keywords: [],
      greeting_message: '',
      handoff_message: '',
      qualification_questions: [],
      created_at: '',
      updated_at: ''
    });
    setIsCreating(true);
  };

  const addKeyword = () => {
    if (!newKeyword.trim() || !editingAgent) return;
    setEditingAgent({
      ...editingAgent,
      detection_keywords: [...editingAgent.detection_keywords, newKeyword.trim().toLowerCase()]
    });
    setNewKeyword('');
  };

  const removeKeyword = (keyword: string) => {
    if (!editingAgent) return;
    setEditingAgent({
      ...editingAgent,
      detection_keywords: editingAgent.detection_keywords.filter(k => k !== keyword)
    });
  };

  const addQuestion = () => {
    if (!newQuestion.trim() || !editingAgent) return;
    const nextOrder = (editingAgent.qualification_questions?.length || 0) + 1;
    setEditingAgent({
      ...editingAgent,
      qualification_questions: [
        ...(editingAgent.qualification_questions || []),
        { order: nextOrder, question: newQuestion.trim() }
      ]
    });
    setNewQuestion('');
  };

  const removeQuestion = (order: number) => {
    if (!editingAgent) return;
    setEditingAgent({
      ...editingAgent,
      qualification_questions: editingAgent.qualification_questions
        .filter(q => q.order !== order)
        .map((q, idx) => ({ ...q, order: idx + 1 }))
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  // Edit/Create Form
  if (editingAgent) {
    return (
      <div className="space-y-6 bg-slate-900/50 border border-slate-700/50 rounded-lg p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Bot className="w-5 h-5 text-cyan-400" />
            {isCreating ? 'Novo Agente' : `Editando: ${editingAgent.name}`}
          </h3>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              <X className="w-4 h-4 mr-1" /> Cancelar
            </Button>
            <Button 
              variant="primary" 
              size="sm" 
              onClick={isCreating ? handleCreate : handleSave}
              disabled={saving || !editingAgent.name || !editingAgent.slug || !editingAgent.system_prompt}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Check className="w-4 h-4 mr-1" />}
              {isCreating ? 'Criar' : 'Salvar'}
            </Button>
          </div>
        </div>

        {/* Basic Info */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Nome do Agente *</label>
            <input
              type="text"
              value={editingAgent.name}
              onChange={(e) => setEditingAgent({ ...editingAgent, name: e.target.value })}
              className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm text-white"
              placeholder="Ex: Paula"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Slug (identificador único) *</label>
            <input
              type="text"
              value={editingAgent.slug}
              onChange={(e) => setEditingAgent({ ...editingAgent, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
              className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm text-white"
              placeholder="Ex: paula-saude"
              disabled={!isCreating}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Especialidade</label>
            <input
              type="text"
              value={editingAgent.specialty || ''}
              onChange={(e) => setEditingAgent({ ...editingAgent, specialty: e.target.value })}
              className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm text-white"
              placeholder="Ex: planos_saude"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Descrição</label>
            <input
              type="text"
              value={editingAgent.description || ''}
              onChange={(e) => setEditingAgent({ ...editingAgent, description: e.target.value })}
              className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm text-white"
              placeholder="Ex: Especialista em planos de saúde"
            />
          </div>
        </div>

        {/* System Prompt */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Prompt do Sistema *</label>
          <textarea
            value={editingAgent.system_prompt}
            onChange={(e) => setEditingAgent({ ...editingAgent, system_prompt: e.target.value })}
            className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm text-white h-40"
            placeholder="Instruções para o agente..."
          />
        </div>

        {/* Messages */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Mensagem de Saudação</label>
            <textarea
              value={editingAgent.greeting_message || ''}
              onChange={(e) => setEditingAgent({ ...editingAgent, greeting_message: e.target.value })}
              className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm text-white h-20"
              placeholder="Mensagem inicial quando o agente inicia..."
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Mensagem de Handoff</label>
            <textarea
              value={editingAgent.handoff_message || ''}
              onChange={(e) => setEditingAgent({ ...editingAgent, handoff_message: e.target.value })}
              className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm text-white h-20"
              placeholder="Mensagem quando recebe transferência de outro agente..."
            />
          </div>
        </div>

        {/* Detection Keywords */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-2">
            Keywords de Detecção 
            <span className="text-slate-500 ml-1">(palavras que ativam este agente)</span>
          </label>
          <div className="flex flex-wrap gap-2 mb-2">
            {editingAgent.detection_keywords.map((kw, idx) => (
              <span 
                key={idx}
                className="px-2 py-1 bg-cyan-500/20 text-cyan-400 text-xs rounded-full flex items-center gap-1"
              >
                {kw}
                <button onClick={() => removeKeyword(kw)} className="hover:text-red-400">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addKeyword())}
              className="flex-1 bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm text-white"
              placeholder="Adicionar keyword..."
            />
            <Button variant="ghost" size="sm" onClick={addKeyword}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Qualification Questions */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-2">
            Perguntas de Qualificação
            <span className="text-slate-500 ml-1">(perguntas que o agente fará para qualificar o lead)</span>
          </label>
          <div className="space-y-2 mb-2">
            {(editingAgent.qualification_questions || []).map((q) => (
              <div key={q.order} className="flex items-center gap-2 bg-slate-800/50 rounded px-3 py-2">
                <span className="text-cyan-400 text-xs font-mono">{q.order}.</span>
                <span className="flex-1 text-sm text-slate-300">{q.question}</span>
                <button onClick={() => removeQuestion(q.order)} className="text-slate-400 hover:text-red-400">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newQuestion}
              onChange={(e) => setNewQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addQuestion())}
              className="flex-1 bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm text-white"
              placeholder="Adicionar pergunta..."
            />
            <Button variant="ghost" size="sm" onClick={addQuestion}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Agent List
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-cyan-400" />
            Agentes
          </h3>
          <p className="text-sm text-slate-400 mt-1">
            Configure agentes especializados para diferentes tipos de atendimento.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={startCreating}>
          <Plus className="w-4 h-4 mr-1" /> Novo Agente
        </Button>
      </div>

      <div className="grid gap-4">
        {agents.map((agent) => (
          <div 
            key={agent.id}
            className={`bg-slate-900/50 border rounded-lg p-4 ${
              agent.is_active ? 'border-slate-700/50' : 'border-slate-800 opacity-60'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${agent.is_default ? 'bg-amber-500/20' : 'bg-cyan-500/20'}`}>
                  <Bot className={`w-5 h-5 ${agent.is_default ? 'text-amber-400' : 'text-cyan-400'}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-white">{agent.name}</h4>
                    {agent.is_default && (
                      <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded-full flex items-center gap-1">
                        <Star className="w-3 h-3" /> Padrão
                      </span>
                    )}
                    {!agent.is_active && (
                      <span className="px-2 py-0.5 bg-slate-600/50 text-slate-400 text-xs rounded-full">
                        Inativo
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-400">{agent.description || agent.specialty}</p>
                  {agent.detection_keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {agent.detection_keywords.slice(0, 5).map((kw, idx) => (
                        <span key={idx} className="px-2 py-0.5 bg-slate-800 text-slate-400 text-xs rounded">
                          {kw}
                        </span>
                      ))}
                      {agent.detection_keywords.length > 5 && (
                        <span className="px-2 py-0.5 bg-slate-800 text-slate-500 text-xs rounded">
                          +{agent.detection_keywords.length - 5}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleToggleActive(agent.id, !agent.is_active)}
                  className={`px-3 py-1 text-xs rounded ${
                    agent.is_active 
                      ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' 
                      : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                  }`}
                >
                  {agent.is_active ? 'Ativo' : 'Inativo'}
                </button>
                <Button variant="ghost" size="sm" onClick={() => setEditingAgent(agent)}>
                  <Edit2 className="w-4 h-4" />
                </Button>
                {!agent.is_default && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => handleDelete(agent.id)}
                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>

            {agent.qualification_questions && agent.qualification_questions.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-700/50">
                <p className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                  <MessageSquare className="w-3 h-3" />
                  {agent.qualification_questions.length} perguntas de qualificação
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      {agents.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Nenhum agente configurado</p>
          <p className="text-sm">Crie seu primeiro agente para começar</p>
        </div>
      )}
    </div>
  );
});

AgentsSettings.displayName = 'AgentsSettings';

export default AgentsSettings;
