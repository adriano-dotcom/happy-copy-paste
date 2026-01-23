import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Bot, Plus, Trash2, Edit2, Check, X, Loader2, 
  MessageSquare, Sparkles, Star, Users, FlaskConical, ArrowRight, Volume2,
  ChevronDown, ChevronUp, Play, Settings2, UserCheck, RefreshCw
} from 'lucide-react';
import { Checkbox } from '../ui/checkbox';
import { Button } from '../Button';
import { Switch } from '../ui/switch';
import { Slider } from '../ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';

interface TestResult {
  success: boolean;
  detectedAgent: string | null;
  previousAgent: string | null;
  handoffOccurred: boolean;
  message: string;
  matchedKeyword: string | null;
  testedMessage: string;
}

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
  cargo_focused_greeting: string | null;
  qualification_questions: Array<{ order: number; question: string }>;
  audio_response_enabled: boolean;
  elevenlabs_voice_id: string | null;
  elevenlabs_model: string | null;
  elevenlabs_stability: number | null;
  elevenlabs_similarity_boost: number | null;
  elevenlabs_style: number | null;
  elevenlabs_speed: number | null;
  elevenlabs_speaker_boost: boolean | null;
  owner_distribution_type: 'fixed' | 'round_robin' | null;
  default_owner_id: string | null;
  owner_rotation_ids: string[];
  created_at: string;
  updated_at: string;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  status: string;
}

export interface AgentsSettingsRef {
  save: () => Promise<void>;
  cancel: () => void;
  isSaving: boolean;
}

// Available voices from ElevenLabs
const VOICES = [
  { id: '9BWtsMINqrJLrRacOk9x', name: 'Aria', gender: 'Feminina' },
  { id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger', gender: 'Masculina' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', gender: 'Feminina' },
  { id: 'RGymW84CSmfVugnA5tvA', name: 'Roberta', gender: 'Feminina' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura', gender: 'Feminina' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', gender: 'Masculina' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', gender: 'Masculina' },
  { id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum', gender: 'Masculina' },
  { id: 'SAz9YHcvj6GT2YYXdXww', name: 'River', gender: 'Neutra' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', gender: 'Masculina' },
  { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', gender: 'Feminina' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice', gender: 'Feminina' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', gender: 'Feminina' },
  { id: 'bIHbv24MWmeRgasZH58o', name: 'Will', gender: 'Masculina' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica', gender: 'Feminina' },
  { id: 'cjVigY5qzO86Huf0OWal', name: 'Eric', gender: 'Masculina' },
  { id: 'iP95p4xoKVk53GoZ742B', name: 'Chris', gender: 'Masculina' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', gender: 'Masculina' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', gender: 'Masculina' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', gender: 'Feminina' },
  { id: 'pqHfZKP75CvOlQylNhV4', name: 'Bill', gender: 'Masculina' },
];

const MODELS = [
  { id: 'eleven_turbo_v2_5', name: 'Turbo v2.5 (Recomendado)', description: 'Mais rápido e econômico' },
  { id: 'eleven_turbo_v2', name: 'Turbo v2', description: 'Rápido' },
  { id: 'eleven_multilingual_v2', name: 'Multilingual v2', description: 'Qualidade máxima' },
];

const AgentsSettings = forwardRef<AgentsSettingsRef>((_, ref) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newKeyword, setNewKeyword] = useState('');
  const [newQuestion, setNewQuestion] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testMessage, setTestMessage] = useState('Olá, quero saber sobre plano de saúde');
  
  // Voice settings UI state
  const [showAdvancedVoice, setShowAdvancedVoice] = useState(false);
  const [showAudioTest, setShowAudioTest] = useState(false);
  const [showDistribution, setShowDistribution] = useState(false);
  const [audioTestText, setAudioTestText] = useState('Olá! Sou a assistente virtual da Jacometo Seguros. Como posso ajudar?');
  const [generatingAudio, setGeneratingAudio] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    save: handleSave,
    cancel: handleCancel,
    isSaving: saving
  }));

  useEffect(() => {
    loadAgents();
    loadTeamMembers();
  }, []);

  const loadTeamMembers = async () => {
    try {
      const { data, error } = await supabase
        .from('team_members')
        .select('id, name, email, status')
        .eq('status', 'active')
        .order('name');
      
      if (error) throw error;
      setTeamMembers(data || []);
    } catch (error) {
      console.error('Erro ao carregar membros da equipe:', error);
    }
  };

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
          ? (agent.qualification_questions as Array<{ order: number; question: string }>)
          : []
      })) as Agent[];
      
      setAgents(parsed);
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
          qualification_questions: editingAgent.qualification_questions,
          audio_response_enabled: editingAgent.audio_response_enabled,
          elevenlabs_voice_id: editingAgent.elevenlabs_voice_id || null,
          elevenlabs_model: editingAgent.elevenlabs_model,
          elevenlabs_stability: editingAgent.elevenlabs_stability,
          elevenlabs_similarity_boost: editingAgent.elevenlabs_similarity_boost,
          elevenlabs_style: editingAgent.elevenlabs_style,
          elevenlabs_speed: editingAgent.elevenlabs_speed,
          elevenlabs_speaker_boost: editingAgent.elevenlabs_speaker_boost,
          owner_distribution_type: editingAgent.owner_distribution_type,
          default_owner_id: editingAgent.default_owner_id,
          owner_rotation_ids: editingAgent.owner_rotation_ids
        })
        .eq('id', editingAgent.id);

      if (error) throw error;
      
      toast.success('Agente atualizado!');
      setEditingAgent(null);
      setShowAdvancedVoice(false);
      setShowAudioTest(false);
      setAudioUrl(null);
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
    setShowAdvancedVoice(false);
    setShowAudioTest(false);
    setAudioUrl(null);
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
          qualification_questions: editingAgent.qualification_questions,
          audio_response_enabled: editingAgent.audio_response_enabled,
          elevenlabs_voice_id: editingAgent.elevenlabs_voice_id || null,
          elevenlabs_model: editingAgent.elevenlabs_model,
          elevenlabs_stability: editingAgent.elevenlabs_stability,
          elevenlabs_similarity_boost: editingAgent.elevenlabs_similarity_boost,
          elevenlabs_style: editingAgent.elevenlabs_style,
          elevenlabs_speed: editingAgent.elevenlabs_speed,
          elevenlabs_speaker_boost: editingAgent.elevenlabs_speaker_boost,
          owner_distribution_type: editingAgent.owner_distribution_type,
          default_owner_id: editingAgent.default_owner_id,
          owner_rotation_ids: editingAgent.owner_rotation_ids
        });

      if (error) throw error;
      
      toast.success('Agente criado!');
      setEditingAgent(null);
      setIsCreating(false);
      setShowAdvancedVoice(false);
      setShowAudioTest(false);
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
      cargo_focused_greeting: '',
      qualification_questions: [],
      audio_response_enabled: false,
      elevenlabs_voice_id: 'FGY2WhTYpPnrIDTdsKH5', // Laura default
      elevenlabs_model: 'eleven_turbo_v2_5',
      elevenlabs_stability: 0.75,
      elevenlabs_similarity_boost: 0.80,
      elevenlabs_style: 0.30,
      elevenlabs_speed: 1.0,
      elevenlabs_speaker_boost: true,
      owner_distribution_type: 'fixed',
      default_owner_id: null,
      owner_rotation_ids: [],
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

  const testHandoff = async () => {
    setTesting(true);
    setTestResult(null);
    
    try {
      const activeAgents = agents.filter(a => a.is_active);
      const messageLower = testMessage.toLowerCase();
      
      const defaultAgent = activeAgents.find(a => a.is_default);
      
      let detectedAgent: Agent | null = null;
      let matchedKeyword: string | null = null;
      
      for (const agent of activeAgents) {
        if (!agent.is_default && agent.detection_keywords?.length > 0) {
          const foundKeyword = agent.detection_keywords.find(kw => 
            messageLower.includes(kw.toLowerCase())
          );
          if (foundKeyword) {
            detectedAgent = agent;
            matchedKeyword = foundKeyword;
            break;
          }
        }
      }
      
      const handoffOccurred = detectedAgent !== null && detectedAgent.id !== defaultAgent?.id;
      
      setTestResult({
        success: true,
        detectedAgent: detectedAgent?.name || defaultAgent?.name || 'Nenhum',
        previousAgent: defaultAgent?.name || 'Nenhum',
        handoffOccurred,
        matchedKeyword,
        testedMessage: testMessage,
        message: handoffOccurred 
          ? `Handoff detectado! Transferência de ${defaultAgent?.name || 'padrão'} → ${detectedAgent?.name}`
          : `Sem handoff. Mensagem seria tratada pelo agente padrão: ${defaultAgent?.name || 'Nenhum configurado'}`
      });
      
      toast.success(handoffOccurred ? 'Handoff detectado!' : 'Teste concluído - sem handoff');
    } catch (error) {
      console.error('Erro no teste de handoff:', error);
      setTestResult({
        success: false,
        detectedAgent: null,
        previousAgent: null,
        handoffOccurred: false,
        matchedKeyword: null,
        testedMessage: testMessage,
        message: `Erro ao testar: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
      });
      toast.error('Erro ao testar handoff');
    } finally {
      setTesting(false);
    }
  };

  const testAudio = async () => {
    if (!editingAgent || !audioTestText.trim()) return;
    
    setGeneratingAudio(true);
    setAudioUrl(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('test-elevenlabs-tts', {
        body: { 
          text: audioTestText,
          voiceId: editingAgent.elevenlabs_voice_id,
          model: editingAgent.elevenlabs_model,
          stability: editingAgent.elevenlabs_stability,
          similarity: editingAgent.elevenlabs_similarity_boost,
          style: editingAgent.elevenlabs_style,
          speed: editingAgent.elevenlabs_speed,
          speakerBoost: editingAgent.elevenlabs_speaker_boost
        }
      });

      if (error) throw error;
      
      if (data?.audioContent) {
        const audioBlob = new Blob(
          [Uint8Array.from(atob(data.audioContent), c => c.charCodeAt(0))],
          { type: 'audio/mpeg' }
        );
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
        toast.success('Áudio gerado!');
      } else {
        throw new Error('Sem conteúdo de áudio na resposta');
      }
    } catch (error) {
      console.error('Erro ao gerar áudio:', error);
      toast.error('Erro ao gerar áudio. Verifique a API Key do ElevenLabs.');
    } finally {
      setGeneratingAudio(false);
    }
  };

  const getVoiceName = (voiceId: string | null) => {
    if (!voiceId) return 'Voz do Sistema';
    const voice = VOICES.find(v => v.id === voiceId);
    return voice ? `${voice.name} (${voice.gender})` : voiceId;
  };

  const getDistributionBadge = (agent: Agent) => {
    if (agent.owner_distribution_type === 'round_robin' && agent.owner_rotation_ids?.length > 0) {
      const names = agent.owner_rotation_ids
        .map(id => teamMembers.find(m => m.id === id)?.name)
        .filter(Boolean)
        .slice(0, 2);
      const extra = agent.owner_rotation_ids.length - 2;
      return (
        <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-xs rounded-full flex items-center gap-1">
          <RefreshCw className="w-3 h-3" />
          {names.join(', ')}{extra > 0 ? ` +${extra}` : ''}
        </span>
      );
    }
    if (agent.owner_distribution_type === 'fixed' && agent.default_owner_id) {
      const owner = teamMembers.find(m => m.id === agent.default_owner_id);
      if (owner) {
        return (
          <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs rounded-full flex items-center gap-1">
            <UserCheck className="w-3 h-3" />
            {owner.name}
          </span>
        );
      }
    }
    return null;
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

        {/* Audio Response Settings - Visual Version */}
        <div className="bg-slate-800/30 rounded-lg p-4 space-y-4">
          <h4 className="text-sm font-medium text-slate-300 flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-cyan-400" />
            Resposta em Áudio
          </h4>
          
          {/* Voice and Model Selectors */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Voz</label>
              <Select
                value={editingAgent.elevenlabs_voice_id || 'FGY2WhTYpPnrIDTdsKH5'}
                onValueChange={(value) => setEditingAgent({ ...editingAgent, elevenlabs_voice_id: value })}
              >
                <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
                  <SelectValue placeholder="Selecione uma voz" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-600">
                  {VOICES.map((voice) => (
                    <SelectItem key={voice.id} value={voice.id} className="text-white hover:bg-slate-700">
                      {voice.name} - {voice.gender}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Modelo</label>
              <Select
                value={editingAgent.elevenlabs_model || 'eleven_turbo_v2_5'}
                onValueChange={(value) => setEditingAgent({ ...editingAgent, elevenlabs_model: value })}
              >
                <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
                  <SelectValue placeholder="Selecione um modelo" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-600">
                  {MODELS.map((model) => (
                    <SelectItem key={model.id} value={model.id} className="text-white hover:bg-slate-700">
                      {model.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Audio Response Toggle */}
          <div className="flex items-center justify-between py-2 border-t border-slate-700/50">
            <div>
              <p className="text-sm text-white">Responder em áudio quando cliente envia áudio</p>
              <p className="text-xs text-slate-400">
                Quando ativado, o agente responderá com áudio se o cliente enviar mensagem de voz
              </p>
            </div>
            <Switch
              checked={editingAgent.audio_response_enabled}
              onCheckedChange={(checked) => 
                setEditingAgent({ ...editingAgent, audio_response_enabled: checked })
              }
            />
          </div>

          {/* Advanced Voice Settings - Collapsible */}
          <div className="border-t border-slate-700/50 pt-3">
            <button
              onClick={() => setShowAdvancedVoice(!showAdvancedVoice)}
              className="flex items-center justify-between w-full text-sm text-slate-300 hover:text-white transition-colors"
            >
              <span className="flex items-center gap-2">
                <Settings2 className="w-4 h-4" />
                Configurações Avançadas de Voz
              </span>
              {showAdvancedVoice ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            
            {showAdvancedVoice && (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="flex justify-between text-xs font-medium text-slate-400 mb-2">
                      <span>Stability</span>
                      <span className="text-cyan-400">{(editingAgent.elevenlabs_stability ?? 0.75).toFixed(2)}</span>
                    </label>
                    <Slider
                      value={[editingAgent.elevenlabs_stability ?? 0.75]}
                      onValueChange={([value]) => setEditingAgent({ ...editingAgent, elevenlabs_stability: value })}
                      min={0}
                      max={1}
                      step={0.01}
                      className="w-full"
                    />
                    <p className="text-xs text-slate-500 mt-1">Menor = mais expressivo, Maior = mais consistente</p>
                  </div>
                  <div>
                    <label className="flex justify-between text-xs font-medium text-slate-400 mb-2">
                      <span>Similarity</span>
                      <span className="text-cyan-400">{(editingAgent.elevenlabs_similarity_boost ?? 0.80).toFixed(2)}</span>
                    </label>
                    <Slider
                      value={[editingAgent.elevenlabs_similarity_boost ?? 0.80]}
                      onValueChange={([value]) => setEditingAgent({ ...editingAgent, elevenlabs_similarity_boost: value })}
                      min={0}
                      max={1}
                      step={0.01}
                      className="w-full"
                    />
                    <p className="text-xs text-slate-500 mt-1">Quão próximo da voz original</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="flex justify-between text-xs font-medium text-slate-400 mb-2">
                      <span>Style</span>
                      <span className="text-cyan-400">{(editingAgent.elevenlabs_style ?? 0.30).toFixed(2)}</span>
                    </label>
                    <Slider
                      value={[editingAgent.elevenlabs_style ?? 0.30]}
                      onValueChange={([value]) => setEditingAgent({ ...editingAgent, elevenlabs_style: value })}
                      min={0}
                      max={1}
                      step={0.01}
                      className="w-full"
                    />
                    <p className="text-xs text-slate-500 mt-1">Intensidade de estilo/emoção</p>
                  </div>
                  <div>
                    <label className="flex justify-between text-xs font-medium text-slate-400 mb-2">
                      <span>Speed</span>
                      <span className="text-cyan-400">{(editingAgent.elevenlabs_speed ?? 1.0).toFixed(2)}x</span>
                    </label>
                    <Slider
                      value={[editingAgent.elevenlabs_speed ?? 1.0]}
                      onValueChange={([value]) => setEditingAgent({ ...editingAgent, elevenlabs_speed: value })}
                      min={0.7}
                      max={1.2}
                      step={0.05}
                      className="w-full"
                    />
                    <p className="text-xs text-slate-500 mt-1">Velocidade da fala</p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div>
                    <p className="text-sm text-white">Speaker Boost</p>
                    <p className="text-xs text-slate-400">Aumenta clareza e fidelidade da voz</p>
                  </div>
                  <Switch
                    checked={editingAgent.elevenlabs_speaker_boost ?? true}
                    onCheckedChange={(checked) => 
                      setEditingAgent({ ...editingAgent, elevenlabs_speaker_boost: checked })
                    }
                  />
                </div>
              </div>
            )}
          </div>

          {/* Audio Test - Collapsible */}
          <div className="border-t border-slate-700/50 pt-3">
            <button
              onClick={() => setShowAudioTest(!showAudioTest)}
              className="flex items-center justify-between w-full text-sm text-slate-300 hover:text-white transition-colors"
            >
              <span className="flex items-center gap-2">
                <Play className="w-4 h-4" />
                Testar Áudio
              </span>
              {showAudioTest ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            
            {showAudioTest && (
              <div className="mt-4 space-y-3">
                <textarea
                  value={audioTestText}
                  onChange={(e) => setAudioTestText(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm text-white h-20"
                  placeholder="Texto para testar a voz..."
                />
                
                <div className="flex items-center gap-3">
                  <Button 
                    variant="primary" 
                    size="sm" 
                    onClick={testAudio}
                    disabled={generatingAudio || !audioTestText.trim()}
                  >
                    {generatingAudio ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-1" />
                    ) : (
                      <Volume2 className="w-4 h-4 mr-1" />
                    )}
                    {generatingAudio ? 'Gerando...' : 'Gerar Áudio'}
                  </Button>
                  
                  {audioUrl && (
                    <audio controls src={audioUrl} className="h-8 flex-1">
                      Seu navegador não suporta o elemento de áudio.
                    </audio>
                  )}
                </div>
                
                <p className="text-xs text-slate-500">
                  Requer API Key do ElevenLabs configurada em Configurações → APIs
                </p>
              </div>
            )}
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

        {/* Lead Distribution Settings */}
        <div className="bg-slate-800/30 rounded-lg p-4 space-y-4">
          <button
            type="button"
            onClick={() => setShowDistribution(!showDistribution)}
            className="flex items-center justify-between w-full text-sm font-medium text-slate-300 hover:text-white transition-colors"
          >
            <span className="flex items-center gap-2">
              <Users className="w-4 h-4 text-cyan-400" />
              Distribuição de Responsáveis
            </span>
            {showDistribution ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showDistribution && (
            <div className="space-y-4 pt-2">
              {/* Distribution Type */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">
                  Tipo de Distribuição
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="distribution_type"
                      checked={editingAgent.owner_distribution_type === 'fixed' || !editingAgent.owner_distribution_type}
                      onChange={() => setEditingAgent({ 
                        ...editingAgent, 
                        owner_distribution_type: 'fixed',
                        owner_rotation_ids: []
                      })}
                      className="text-cyan-500"
                    />
                    <span className="text-sm text-slate-300 flex items-center gap-1">
                      <UserCheck className="w-4 h-4" /> Fixo
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="distribution_type"
                      checked={editingAgent.owner_distribution_type === 'round_robin'}
                      onChange={() => setEditingAgent({ 
                        ...editingAgent, 
                        owner_distribution_type: 'round_robin',
                        default_owner_id: null
                      })}
                      className="text-cyan-500"
                    />
                    <span className="text-sm text-slate-300 flex items-center gap-1">
                      <RefreshCw className="w-4 h-4" /> Rodízio
                    </span>
                  </label>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {editingAgent.owner_distribution_type === 'round_robin' 
                    ? 'Leads são distribuídos alternadamente entre os responsáveis selecionados'
                    : 'Todos os leads são atribuídos ao mesmo responsável'}
                </p>
              </div>

              {/* Fixed Owner Selector */}
              {(editingAgent.owner_distribution_type === 'fixed' || !editingAgent.owner_distribution_type) && (
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Responsável Padrão
                  </label>
                  <Select
                    value={editingAgent.default_owner_id || ''}
                    onValueChange={(value) => setEditingAgent({ 
                      ...editingAgent, 
                      default_owner_id: value || null 
                    })}
                  >
                    <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
                      <SelectValue placeholder="Selecione um responsável" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-600">
                      {teamMembers.map((member) => (
                        <SelectItem 
                          key={member.id} 
                          value={member.id} 
                          className="text-white hover:bg-slate-700"
                        >
                          {member.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Round Robin Selector */}
              {editingAgent.owner_distribution_type === 'round_robin' && (
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-2">
                    Responsáveis para Rotação
                  </label>
                  <div className="space-y-2 max-h-48 overflow-y-auto bg-slate-800/50 rounded-lg p-3">
                    {teamMembers.length === 0 ? (
                      <p className="text-xs text-slate-500">Nenhum membro da equipe ativo</p>
                    ) : (
                      teamMembers.map((member) => {
                        const isSelected = editingAgent.owner_rotation_ids?.includes(member.id);
                        return (
                          <label
                            key={member.id}
                            className="flex items-center gap-3 p-2 rounded hover:bg-slate-700/50 cursor-pointer"
                          >
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={(checked) => {
                                const newIds = checked
                                  ? [...(editingAgent.owner_rotation_ids || []), member.id]
                                  : (editingAgent.owner_rotation_ids || []).filter(id => id !== member.id);
                                setEditingAgent({ ...editingAgent, owner_rotation_ids: newIds });
                              }}
                            />
                            <span className="text-sm text-slate-300">{member.name}</span>
                            <span className="text-xs text-slate-500">{member.email}</span>
                          </label>
                        );
                      })
                    )}
                  </div>
                  {editingAgent.owner_rotation_ids?.length > 0 && (
                    <p className="text-xs text-cyan-400 mt-2">
                      {editingAgent.owner_rotation_ids.length} responsável(eis) selecionado(s)
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
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

      {/* Seção de Teste de Handoff */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <FlaskConical className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-medium text-white">Testar Detecção de Agente</span>
        </div>
        
        <div className="flex gap-2">
          <input
            type="text"
            value={testMessage}
            onChange={(e) => setTestMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !testing && testMessage.trim() && testHandoff()}
            className="flex-1 bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500"
            placeholder="Digite uma mensagem para testar..."
          />
          <Button 
            variant="primary" 
            size="sm" 
            onClick={testHandoff}
            disabled={testing || agents.length === 0 || !testMessage.trim()}
          >
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />}
            Testar
          </Button>
        </div>
        
        <p className="text-xs text-slate-500 mt-2">
          Exemplos: "plano de saúde", "seguro de carga", "rctr-c", "convênio médico"
        </p>
      </div>

      {/* Test Result */}
      {testResult && (
        <div className={`p-4 rounded-lg border ${
          testResult.success 
            ? testResult.handoffOccurred 
              ? 'bg-green-500/10 border-green-500/30' 
              : 'bg-slate-800/50 border-slate-700/50'
            : 'bg-red-500/10 border-red-500/30'
        }`}>
          <div className="flex items-center gap-2 mb-2">
            <FlaskConical className={`w-4 h-4 ${
              testResult.success 
                ? testResult.handoffOccurred ? 'text-green-400' : 'text-slate-400'
                : 'text-red-400'
            }`} />
            <span className="text-sm font-medium text-white">Resultado do Teste</span>
          </div>
          <p className="text-sm text-slate-300 mb-3">{testResult.message}</p>
          {testResult.success && (
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-500">Mensagem:</span>
                <code className="px-2 py-1 bg-slate-800 rounded text-cyan-400 max-w-xs truncate">"{testResult.testedMessage}"</code>
              </div>
              {testResult.matchedKeyword && (
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">Keyword:</span>
                  <code className="px-2 py-1 bg-cyan-500/20 rounded text-cyan-400">{testResult.matchedKeyword}</code>
                </div>
              )}
              {testResult.handoffOccurred && (
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 bg-amber-500/20 text-amber-400 rounded">{testResult.previousAgent}</span>
                  <ArrowRight className="w-4 h-4 text-slate-500" />
                  <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded">{testResult.detectedAgent}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

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
                    {agent.audio_response_enabled && (
                      <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-400 text-xs rounded-full flex items-center gap-1">
                        <Volume2 className="w-3 h-3" /> {getVoiceName(agent.elevenlabs_voice_id)}
                      </span>
                    )}
                    {getDistributionBadge(agent as Agent)}
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
                <Button variant="ghost" size="sm" onClick={() => setEditingAgent(agent as Agent)}>
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
