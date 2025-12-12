import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, MoreVertical, Phone, Paperclip, Send, Check, CheckCheck, 
  Smile, Play, Loader2, Mic, MessageSquare, Info, X, Mail, MapPin, 
  Tag, Bot, User, Pause, Brain, Plus, Building2, FileText, Save, Pencil, FileType,
  Briefcase, ExternalLink, Inbox, Archive, ArchiveRestore, PhoneCall, Clock, AlertTriangle
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { MessageDirection, MessageType, UIConversation, UIMessage, ConversationStatus, TagDefinition } from '../types';
import { Button } from './Button';
import { Button as ShadcnButton } from './ui/button';
import { useConversations } from '../hooks/useConversations';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { api } from '@/services/api';
import { supabase } from '@/integrations/supabase/client';
import { TagSelector } from './TagSelector';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Input } from './ui/input';
import { CallConfirmationModal } from './CallConfirmationModal';
import { useActiveCall } from '@/hooks/useActiveCall';
import { ActiveCallIndicator } from './ActiveCallIndicator';
import { CallHistoryPanel } from './CallHistoryPanel';
import { SendWhatsAppTemplateModal } from './SendWhatsAppTemplateModal';

const ChatInterface: React.FC = () => {
  const navigate = useNavigate();
  const { conversations, loading, sendMessage, updateStatus, markAsRead, assignConversation, archiveConversation, unarchiveConversation, fetchArchivedConversations, refetch } = useConversations();
  const { user } = useAuth();
  const { sdrName, companyName } = useCompanySettings();
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [showProfileInfo, setShowProfileInfo] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [availableTags, setAvailableTags] = useState<TagDefinition[]>([]);
  const [isTagSelectorOpen, setIsTagSelectorOpen] = useState(false);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  
  // Pipeline filter state
  const [selectedPipelineFilter, setSelectedPipelineFilter] = useState<string | null>(null);
  const [pipelines, setPipelines] = useState<{ id: string; name: string; icon: string; color: string }[]>([]);
  const [viewingArchived, setViewingArchived] = useState(false);
  const [archivedCount, setArchivedCount] = useState(0);
  
  // Editable contact fields
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [editEmail, setEditEmail] = useState('');
  const [editCnpj, setEditCnpj] = useState('');
  const [editCompany, setEditCompany] = useState('');
  const [isSavingContact, setIsSavingContact] = useState(false);
  const [isLookingUpCnpj, setIsLookingUpCnpj] = useState(false);
  
  // Deal state
  const [existingDeal, setExistingDeal] = useState<any>(null);
  const [isCheckingDeal, setIsCheckingDeal] = useState(false);
  const [isCreatingDeal, setIsCreatingDeal] = useState(false);
  
  // Call modal state
  const [showCallModal, setShowCallModal] = useState(false);
  const [defaultExtension, setDefaultExtension] = useState('1000');
  
  // WhatsApp template modal state
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  
  // Audio player state
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [audioDurations, setAudioDurations] = useState<Record<string, number>>({});
  const [audioProgress, setAudioProgress] = useState<Record<string, number>>({});
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({});
  
  // WhatsApp window real-time timer state
  const [windowTimeRemaining, setWindowTimeRemaining] = useState<{ isOpen: boolean; hoursRemaining: number | null }>({ isOpen: false, hoursRemaining: null });
  
  const activeChat = conversations.find(c => c.id === selectedChatId);
  
  // Calculate WhatsApp window remaining time
  const calculateWindowRemaining = (windowStart: string | null): { isOpen: boolean; hoursRemaining: number | null } => {
    if (!windowStart) return { isOpen: false, hoursRemaining: null };
    const start = new Date(windowStart);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const now = new Date();
    const msRemaining = end.getTime() - now.getTime();
    if (msRemaining <= 0) return { isOpen: false, hoursRemaining: 0 };
    return { 
      isOpen: true, 
      hoursRemaining: msRemaining / (1000 * 60 * 60) 
    };
  };
  
  // Real-time timer for WhatsApp window countdown
  useEffect(() => {
    if (!activeChat?.whatsappWindowStart) {
      setWindowTimeRemaining({ isOpen: false, hoursRemaining: null });
      return;
    }
    
    // Calculate immediately
    setWindowTimeRemaining(calculateWindowRemaining(activeChat.whatsappWindowStart));
    
    // Update every minute
    const interval = setInterval(() => {
      setWindowTimeRemaining(calculateWindowRemaining(activeChat.whatsappWindowStart));
    }, 60000);
    
    return () => clearInterval(interval);
  }, [activeChat?.id, activeChat?.whatsappWindowStart]);
  
  // Get badge color based on remaining time
  const getWindowBadgeStyle = () => {
    const hours = windowTimeRemaining.hoursRemaining;
    if (hours === null || !windowTimeRemaining.isOpen) {
      return 'bg-red-500/20 text-red-400 border-red-500/30';
    }
    if (hours > 6) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    if (hours > 1) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    if (hours > 0.25) return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    return 'bg-red-500/20 text-red-400 border-red-500/30 animate-pulse';
  };
  
  // Format remaining time for display
  const formatWindowTime = () => {
    const hours = windowTimeRemaining.hoursRemaining;
    if (hours === null) return 'Janela aberta';
    if (hours >= 1) {
      const h = Math.floor(hours);
      const m = Math.floor((hours - h) * 60);
      return m > 0 ? `${h}h ${m}min` : `${h}h restantes`;
    }
    return `${Math.max(1, Math.floor(hours * 60))}min restantes`;
  };
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Active call state
  const { activeCall, callHistory, loading: callHistoryLoading, dismissActiveCall } = useActiveCall(selectedChatId);
  
  // Format audio time helper
  const formatAudioTime = (seconds: number): string => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Load tag definitions, team members, and pipelines
  useEffect(() => {
    api.fetchTagDefinitions().then(setAvailableTags).catch(err => {
      console.error('Error loading tags:', err);
      toast.error('Erro ao carregar tags');
    });

    api.fetchTeam().then(setTeamMembers).catch(err => {
      console.error('Error loading team members:', err);
    });

    api.fetchPipelines().then(setPipelines).catch(err => {
      console.error('Error loading pipelines:', err);
    });

    // Fetch archived conversations count
    supabase
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', false)
      .then(({ count }) => {
        setArchivedCount(count || 0);
      });

    // Fetch default extension for calls
    supabase
      .from('nina_settings')
      .select('api4com_default_extension')
      .single()
      .then(({ data }) => {
        if (data?.api4com_default_extension) {
          setDefaultExtension(data.api4com_default_extension);
        }
      });
  }, []);

  // Auto-select first conversation or from URL param (only on initial load)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const conversationParam = urlParams.get('conversation');
    const phoneParam = urlParams.get('phone');
    
    // Only use URL param if no chat is selected yet
    if (!selectedChatId) {
      if (conversationParam && conversations.some(c => c.id === conversationParam)) {
        setSelectedChatId(conversationParam);
        // Clear URL param after initial selection
        window.history.replaceState({}, '', window.location.pathname);
      } else if (phoneParam) {
        // Find conversation by phone number
        const cleanPhone = phoneParam.replace(/\D/g, '');
        const matchingConv = conversations.find(c => 
          c.contactPhone.replace(/\D/g, '').includes(cleanPhone) ||
          cleanPhone.includes(c.contactPhone.replace(/\D/g, ''))
        );
        if (matchingConv) {
          setSelectedChatId(matchingConv.id);
          // Clear URL param after selection
          window.history.replaceState({}, '', window.location.pathname);
        }
      } else if (conversations.length > 0) {
        setSelectedChatId(conversations[0].id);
      }
    }
  }, [conversations, selectedChatId]);

  // Sync editable contact fields when chat changes
  useEffect(() => {
    if (activeChat) {
      setEditEmail(activeChat.contactEmail || '');
      setEditCnpj(activeChat.contactCnpj || '');
      setEditCompany(activeChat.contactCompany || '');
      setIsEditingContact(false);
    }
  }, [activeChat?.id, activeChat?.contactEmail, activeChat?.contactCnpj, activeChat?.contactCompany]);

  // Check for existing deal when chat changes
  useEffect(() => {
    const checkDeal = async () => {
      if (!activeChat?.contactId) {
        setExistingDeal(null);
        return;
      }
      setIsCheckingDeal(true);
      try {
        const deal = await api.getDealByContactId(activeChat.contactId);
        setExistingDeal(deal);
      } catch (error) {
        console.error('Error checking deal:', error);
        setExistingDeal(null);
      } finally {
        setIsCheckingDeal(false);
      }
    };
    checkDeal();
  }, [activeChat?.contactId]);

  // Mark as read when selecting conversation
  useEffect(() => {
    if (selectedChatId && activeChat?.unreadCount > 0) {
      markAsRead(selectedChatId);
    }
  }, [selectedChatId, activeChat?.unreadCount, markAsRead]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (activeChat) {
      scrollToBottom();
    }
  }, [activeChat?.id, selectedChatId]); 

  useEffect(() => {
    scrollToBottom();
  }, [activeChat?.messages]);

  const handleToggleTag = async (tagKey: string) => {
    if (!activeChat) return;
    
    const currentTags = activeChat.tags || [];
    const newTags = currentTags.includes(tagKey)
      ? currentTags.filter(t => t !== tagKey)
      : [...currentTags, tagKey];
    
    try {
      await api.updateContactTags(activeChat.contactId, newTags);
      toast.success('Tag atualizada');
    } catch (error) {
      console.error('Error updating tag:', error);
      toast.error('Erro ao atualizar tag');
    }
  };

  const handleCreateTag = async (tag: { key: string; label: string; color: string; category: string }) => {
    try {
      const newTag = await api.createTagDefinition(tag);
      setAvailableTags(prev => [...prev, newTag]);
      toast.success('Tag criada com sucesso');
      
      // Adicionar a tag ao contato automaticamente
      if (activeChat) {
        await handleToggleTag(tag.key);
      }
    } catch (error) {
      console.error('Error creating tag:', error);
      toast.error('Erro ao criar tag');
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || !activeChat) return;

    // Check if WhatsApp window is closed (using real-time state)
    if (!windowTimeRemaining.isOpen) {
      toast.error('Janela de 24h expirou. Use um template para reabrir a conversa.');
      return;
    }

    const content = inputText.trim();
    setInputText('');
    
    // Extract operator name from email (e.g., "adriano.jacometo@email.com" -> "Adriano Jacometo")
    const operatorName = user?.email 
      ? user.email.split('@')[0]
          .split(/[._-]/)
          .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
          .join(' ')
      : undefined;
    
    await sendMessage(activeChat.id, content, operatorName);
  };

  const handleStatusChange = async (status: ConversationStatus) => {
    if (!activeChat) return;
    // Extract display name from user email
    const userName = user?.email ? 
      user.email.split('@')[0].charAt(0).toUpperCase() + user.email.split('@')[0].slice(1) : 
      undefined;
    await updateStatus(activeChat.id, status, user?.id, userName);
  };

  // CNPJ Lookup via BrasilAPI
  const handleCnpjLookup = async () => {
    const cleanCnpj = editCnpj.replace(/\D/g, '');
    if (cleanCnpj.length !== 14) {
      toast.error('CNPJ inválido. Digite 14 dígitos.');
      return;
    }

    setIsLookingUpCnpj(true);
    try {
      const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`);
      if (!response.ok) {
        throw new Error('CNPJ não encontrado');
      }
      const data = await response.json();
      
      // Auto-fill company name
      const companyName = data.nome_fantasia || data.razao_social || '';
      setEditCompany(companyName);
      
      // Auto-save CNPJ and company after lookup
      if (activeChat) {
        await api.updateContact(activeChat.contactId, {
          cnpj: cleanCnpj,
          company: companyName || null
        });
        // Refresh conversations to update UI with saved data
        await refetch();
        toast.success(`Empresa encontrada e salva: ${companyName}`);
      }
    } catch (error) {
      console.error('CNPJ lookup error:', error);
      toast.error('CNPJ não encontrado na Receita Federal');
    } finally {
      setIsLookingUpCnpj(false);
    }
  };

  // Save contact data
  const handleSaveContactData = async () => {
    if (!activeChat) return;
    
    setIsSavingContact(true);
    try {
      await api.updateContact(activeChat.contactId, {
        email: editEmail.trim() || null,
        cnpj: editCnpj.replace(/\D/g, '') || null,
        company: editCompany.trim() || null
      });
      
      // Refresh conversations to update UI with saved data
      await refetch();
      toast.success('Dados do contato atualizados');
      setIsEditingContact(false);
    } catch (error) {
      console.error('Error saving contact:', error);
      toast.error('Erro ao salvar dados');
    } finally {
      setIsSavingContact(false);
    }
  };

  // Convert contact to deal
  const handleConvertToDeal = async () => {
    if (!activeChat) return;
    
    setIsCreatingDeal(true);
    try {
      // Get first stage of default pipeline
      const pipelines = await api.fetchPipelines();
      const defaultPipeline = pipelines.find(p => p.isActive) || pipelines[0];
      
      let firstStageId: string | undefined;
      let pipelineId: string | undefined;
      if (defaultPipeline) {
        const stages = await api.fetchPipelineStages(defaultPipeline.id);
        const firstStage = stages.sort((a, b) => a.position - b.position)[0];
        firstStageId = firstStage?.id;
        pipelineId = defaultPipeline.id;
      }
      
      const deal = await api.createDeal({
        contact_id: activeChat.contactId,
        title: activeChat.contactCompany || activeChat.contactName || 'Novo Negócio',
        company: activeChat.contactCompany || undefined,
        stage_id: firstStageId,
        owner_id: activeChat.assignedUserId || undefined,
      });
      
      // Add pipelineId to deal for navigation
      const dealWithPipeline = { ...deal, pipelineId };
      setExistingDeal(dealWithPipeline);
      toast.success('Negócio criado com sucesso!', {
        action: {
          label: 'Ver no Kanban',
          onClick: () => navigate(pipelineId ? `/kanban?pipeline=${pipelineId}` : '/kanban')
        }
      });
    } catch (error) {
      console.error('Error creating deal:', error);
      toast.error('Erro ao criar negócio');
    } finally {
      setIsCreatingDeal(false);
    }
  };

  // Format CNPJ for display
  const formatCnpj = (cnpj: string) => {
    const clean = cnpj.replace(/\D/g, '');
    if (clean.length !== 14) return cnpj;
    return clean.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  };

  // Calculate conversation counts for filters
  const conversationCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: conversations.length,
      'no-pipeline': conversations.filter(c => c.pipelineId === null).length,
    };
    pipelines.forEach(p => {
      counts[p.id] = conversations.filter(c => c.pipelineId === p.id).length;
    });
    return counts;
  }, [conversations, pipelines]);

  const filteredConversations = conversations
    .filter(chat => {
      // Pipeline filter
      if (selectedPipelineFilter === 'no-pipeline') {
        // Show only conversations WITHOUT pipeline
        if (chat.pipelineId !== null) return false;
      } else if (selectedPipelineFilter && chat.pipelineId !== selectedPipelineFilter) {
        return false;
      }
      
      // Text search filter
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        chat.contactName.toLowerCase().includes(query) ||
        chat.contactPhone.includes(query) ||
        chat.lastMessage.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      // Sort by unread first
      if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
      if (a.unreadCount === 0 && b.unreadCount > 0) return 1;
      
      // Then by last message time (most recent first)
      const timeA = a.messages.length > 0 ? new Date(a.messages[a.messages.length - 1].timestamp).getTime() : 0;
      const timeB = b.messages.length > 0 ? new Date(b.messages[b.messages.length - 1].timestamp).getTime() : 0;
      return timeB - timeA;
    });

  const renderStatusBadge = (status: ConversationStatus, operatorName?: string | null) => {
    const config = {
      nina: { label: sdrName, icon: Bot, color: 'bg-violet-500/20 text-violet-400 border-violet-500/30' },
      human: { label: operatorName || 'Humano', icon: User, color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
      paused: { label: 'Pausado', icon: Pause, color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' }
    };
    const { label, icon: Icon, color } = config[status];
    return (
      <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium border flex items-center gap-1 ${color}`}>
        <Icon className="w-3 h-3" />
        {label}
      </span>
    );
  };

  const renderMessageContent = (msg: UIMessage) => {
    if (msg.type === MessageType.IMAGE) {
      return (
        <div className="mb-1 group relative">
          <img 
            src={msg.mediaUrl || msg.content} 
            alt="Anexo" 
            className="rounded-lg max-w-full h-auto max-h-72 object-cover border border-slate-700/50 shadow-lg"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).src = 'https://placehold.co/300x200/1e293b/cbd5e1?text=Erro+Imagem';
            }}
          />
        </div>
      );
    }

    if (msg.type === MessageType.AUDIO) {
      const isPlaying = playingAudioId === msg.id;
      const duration = audioDurations[msg.id] || 0;
      const progress = audioProgress[msg.id] || 0;
      const hasTranscription = msg.content && msg.content !== '[áudio]';
      
      const togglePlay = () => {
        const audio = audioRefs.current[msg.id];
        if (!audio) return;
        
        if (isPlaying) {
          audio.pause();
          setPlayingAudioId(null);
        } else {
          // Pause all other audios
          Object.values(audioRefs.current).forEach(a => a.pause());
          audio.play();
          setPlayingAudioId(msg.id);
        }
      };

      return (
        <div className="space-y-2">
          {/* Audio player */}
          <div className="flex items-center gap-3 min-w-[220px] py-1">
            {/* Hidden audio element */}
            {msg.mediaUrl && (
              <audio
                ref={el => { if (el) audioRefs.current[msg.id] = el; }}
                src={msg.mediaUrl}
                onLoadedMetadata={(e) => {
                  const audio = e.currentTarget;
                  setAudioDurations(prev => ({ ...prev, [msg.id]: audio.duration }));
                }}
                onTimeUpdate={(e) => {
                  const audio = e.currentTarget;
                  setAudioProgress(prev => ({ ...prev, [msg.id]: audio.currentTime }));
                }}
                onEnded={() => setPlayingAudioId(null)}
              />
            )}
            
            {/* Play/Pause button */}
            <button 
              onClick={togglePlay}
              disabled={!msg.mediaUrl}
              className={`flex items-center justify-center w-9 h-9 rounded-full transition-all shadow-md ${
                msg.direction === MessageDirection.OUTGOING 
                  ? 'bg-white text-cyan-600 hover:bg-cyan-50 disabled:opacity-50' 
                  : 'bg-cyan-500 text-white hover:bg-cyan-400 disabled:opacity-50'
              }`}
            >
              {isPlaying ? (
                <Pause className="w-3.5 h-3.5 fill-current" />
              ) : (
                <Play className="w-3.5 h-3.5 ml-0.5 fill-current" />
              )}
            </button>
            
            {/* Progress bar and duration */}
            <div className="flex-1 flex flex-col gap-1 justify-center h-9">
              <div 
                className={`h-1.5 rounded-full overflow-hidden cursor-pointer ${
                  msg.direction === MessageDirection.OUTGOING ? 'bg-white/30' : 'bg-slate-600'
                }`}
                onClick={(e) => {
                  const audio = audioRefs.current[msg.id];
                  if (!audio || !duration) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const percent = (e.clientX - rect.left) / rect.width;
                  audio.currentTime = percent * duration;
                }}
              >
                <div 
                  className={`h-full rounded-full transition-all ${
                    msg.direction === MessageDirection.OUTGOING ? 'bg-white' : 'bg-cyan-400'
                  }`}
                  style={{ width: `${duration ? (progress / duration) * 100 : 0}%` }}
                />
              </div>
              <span className={`text-[10px] font-medium ${
                msg.direction === MessageDirection.OUTGOING ? 'text-cyan-100' : 'text-slate-400'
              }`}>
                {formatAudioTime(progress)} / {formatAudioTime(duration)}
              </span>
            </div>
          </div>
          
          {/* Transcription indicator */}
          {hasTranscription && (
            <div className={`flex items-start gap-2 pt-2 border-t ${
              msg.direction === MessageDirection.OUTGOING 
                ? 'border-white/20' 
                : 'border-slate-700/50'
            }`}>
              <Mic className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                msg.direction === MessageDirection.OUTGOING 
                  ? 'text-cyan-200' 
                  : 'text-cyan-400'
              }`} />
              <p className={`text-sm italic leading-relaxed ${
                msg.direction === MessageDirection.OUTGOING 
                  ? 'text-cyan-100/90' 
                  : 'text-slate-300/90'
              }`}>
                {msg.content}
              </p>
            </div>
          )}
        </div>
      );
    }

    return <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>;
  };

  if (loading) {
    return (
      <div className="flex h-full bg-slate-950 items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
          <p className="text-sm text-slate-500">Sincronizando conversas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-slate-950 rounded-tl-2xl overflow-hidden border-t border-l border-slate-800/50 shadow-2xl">
      
      {/* Left Sidebar: Chat List */}
      <div className="w-80 lg:w-96 border-r border-slate-800 flex flex-col bg-slate-900/50 backdrop-blur-md z-20 flex-shrink-0">
        {/* Search Header */}
        <div className="p-4 border-b border-slate-800/50">
          <h2 className="text-lg font-bold text-white mb-3 px-1">
            {viewingArchived ? '📦 Arquivados' : 'Chats Ativos'}
          </h2>
          
          {/* Pipeline Filter Pills */}
          <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1 scrollbar-none">
            {!viewingArchived && (
              <>
                <button
                  onClick={() => setSelectedPipelineFilter(null)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 shrink-0 transition-all ${
                    selectedPipelineFilter === null
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                      : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:bg-slate-800'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Todos
                  <span className="text-[10px] opacity-70">({conversationCounts.all})</span>
                </button>
                {pipelines.map((pipeline) => (
                  <button
                    key={pipeline.id}
                    onClick={() => setSelectedPipelineFilter(pipeline.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 shrink-0 transition-all border ${
                      selectedPipelineFilter === pipeline.id
                        ? ''
                        : 'bg-slate-800/50 text-slate-400 border-slate-700/50 hover:bg-slate-800'
                    }`}
                    style={selectedPipelineFilter === pipeline.id ? {
                      backgroundColor: `${pipeline.color}20`,
                      color: pipeline.color,
                      borderColor: `${pipeline.color}50`
                    } : undefined}
                  >
                    <span className="text-sm">{pipeline.icon}</span>
                    {pipeline.name}
                    <span className="text-[10px] opacity-70">({conversationCounts[pipeline.id] || 0})</span>
                  </button>
                ))}
                <button
                  onClick={() => setSelectedPipelineFilter('no-pipeline')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 shrink-0 transition-all border ${
                    selectedPipelineFilter === 'no-pipeline'
                      ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                      : 'bg-slate-800/50 text-slate-400 border-slate-700/50 hover:bg-slate-800'
                  }`}
                >
                  <Inbox className="w-3.5 h-3.5" />
                  Sem Funil
                  <span className="text-[10px] opacity-70">({conversationCounts['no-pipeline']})</span>
                </button>
              </>
            )}
            <button
              onClick={async () => {
                const newViewingArchived = !viewingArchived;
                setViewingArchived(newViewingArchived);
                setSelectedChatId(null);
                setSelectedPipelineFilter(null);
                if (newViewingArchived) {
                  await fetchArchivedConversations();
                } else {
                  await refetch();
                  // Update archived count
                  const { count } = await supabase
                    .from('conversations')
                    .select('id', { count: 'exact', head: true })
                    .eq('is_active', false);
                  setArchivedCount(count || 0);
                }
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 shrink-0 transition-all border ${
                viewingArchived
                  ? 'bg-slate-500/20 text-slate-300 border-slate-500/40'
                  : 'bg-slate-800/50 text-slate-400 border-slate-700/50 hover:bg-slate-800'
              }`}
            >
              <Archive className="w-3.5 h-3.5" />
              {viewingArchived ? 'Voltar aos Ativos' : 'Arquivados'}
              {!viewingArchived && <span className="text-[10px] opacity-70">({archivedCount})</span>}
            </button>
          </div>
          
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-focus-within:text-cyan-400 transition-colors" />
            <input 
              type="text" 
              placeholder="Buscar conversa..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-slate-950/50 border border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 outline-none text-slate-200 placeholder:text-slate-600 transition-all"
            />
          </div>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 p-8 text-center">
              <MessageSquare className="w-12 h-12 mb-4 opacity-50" />
              <p className="text-sm">Nenhuma conversa encontrada</p>
              <p className="text-xs mt-1 opacity-70">As conversas aparecerão aqui quando receberem mensagens</p>
            </div>
          ) : (
            filteredConversations.map((chat) => (
              <div 
                key={chat.id}
                onClick={() => setSelectedChatId(chat.id)}
                className={`flex items-center p-4 cursor-pointer transition-all duration-200 border-b border-slate-800/30 hover:bg-slate-800/50 ${
                  selectedChatId === chat.id 
                    ? 'bg-slate-800/80 border-l-2 border-l-cyan-500' 
                    : chat.unreadCount > 0
                      ? 'bg-cyan-950/20 border-l-2 border-l-cyan-500/50'
                      : 'border-l-2 border-l-transparent'
                }`}
              >
                <div className="relative">
                  <div className={`w-12 h-12 rounded-full p-0.5 ${chat.unreadCount > 0 ? 'bg-gradient-to-tr from-cyan-600 to-teal-600' : 'bg-gradient-to-tr from-slate-700 to-slate-900'}`}>
                    <img 
                      src={chat.contactAvatar} 
                      alt={chat.contactName} 
                      className="w-full h-full rounded-full object-cover border border-slate-800" 
                    />
                  </div>
                  {chat.unreadCount > 0 ? (
                    <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-cyan-500 border-2 border-slate-900 rounded-full animate-pulse"></span>
                  ) : (
                    <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-slate-600 border-2 border-slate-900 rounded-full"></span>
                  )}
                </div>
                
                <div className="ml-3 flex-1 min-w-0">
                  <div className="flex justify-between items-baseline mb-1">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <h3 className={`text-sm truncate ${chat.unreadCount > 0 ? 'font-bold text-white' : selectedChatId === chat.id ? 'font-semibold text-white' : 'font-semibold text-slate-300'}`}>
                        {chat.contactName}
                      </h3>
                      {chat.agentName && (
                        <span className="px-1.5 py-0.5 bg-violet-500/20 text-violet-400 border border-violet-500/30 text-[9px] rounded font-medium flex items-center gap-1 shrink-0">
                          <Bot className="w-2.5 h-2.5" />
                          {chat.agentName}
                        </span>
                      )}
                      {chat.pipelineName && (
                        <span 
                          className="px-1.5 py-0.5 text-[9px] rounded font-medium flex items-center gap-1 shrink-0 border"
                          style={{ 
                            backgroundColor: `${chat.pipelineColor}20`,
                            color: chat.pipelineColor || '#3b82f6',
                            borderColor: `${chat.pipelineColor}50`
                          }}
                        >
                          <span className="text-[10px]">{chat.pipelineIcon}</span>
                          {chat.pipelineName}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500 font-medium shrink-0 ml-2">{chat.lastMessageTime}</span>
                  </div>
                  <p className="text-xs text-slate-500 truncate">
                    {chat.messages[chat.messages.length - 1]?.type === MessageType.IMAGE ? '📷 Imagem' : 
                     chat.messages[chat.messages.length - 1]?.type === MessageType.AUDIO ? '🎵 Áudio' : 
                     chat.lastMessage || 'Sem mensagens'}
                  </p>
                  
                  <div className="flex items-center mt-2 gap-1.5">
                    {renderStatusBadge(chat.status, chat.assignedUserName)}
                    {chat.tags.slice(0, 1).map(tag => (
                      <span key={tag} className="px-2 py-0.5 bg-slate-800/80 border border-slate-700 text-slate-400 text-[10px] rounded-md font-medium">
                        {tag}
                      </span>
                    ))}
                    {chat.unreadCount > 0 && (
                      <span className="ml-auto bg-gradient-to-r from-cyan-600 to-teal-600 text-white text-[10px] font-bold px-1.5 h-4 min-w-[1rem] flex items-center justify-center rounded-full shadow-lg shadow-cyan-500/20">
                        {chat.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right Area: Chat Window & Profile */}
      {activeChat ? (
        <div className="flex-1 flex overflow-hidden bg-[#0B0E14]">
          {/* Main Chat Content */}
          <div className="flex-1 flex flex-col min-w-0 relative">
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '30px 30px' }}></div>

            {/* Chat Header */}
            <div className="h-16 px-6 flex items-center justify-between bg-slate-900/80 backdrop-blur-md border-b border-slate-800 z-10 shrink-0">
              <div 
                className="flex items-center cursor-pointer hover:bg-slate-800/50 p-1.5 -ml-1.5 rounded-lg transition-colors pr-3"
                onClick={() => setShowProfileInfo(!showProfileInfo)}
              >
                <div className="relative">
                  <img src={activeChat.contactAvatar} alt={activeChat.contactName} className="w-9 h-9 rounded-full ring-2 ring-slate-800" />
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-slate-900 rounded-full"></span>
                </div>
                <div className="ml-3">
                  <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                    {activeChat.contactName}
                    {renderStatusBadge(activeChat.status, activeChat.assignedUserName)}
                    {/* WhatsApp Window Badge - Real-time */}
                    {windowTimeRemaining.isOpen ? (
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium border flex items-center gap-1 ${getWindowBadgeStyle()}`}>
                        <Clock className="w-3 h-3" />
                        {formatWindowTime()}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-medium border flex items-center gap-1 bg-red-500/20 text-red-400 border-red-500/30">
                        <AlertTriangle className="w-3 h-3" />
                        Janela fechada
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-cyan-500 font-medium">{activeChat.contactPhone}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {/* Status control buttons */}
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={`text-slate-400 hover:text-white ${activeChat.status === 'nina' ? 'bg-violet-500/20 text-violet-400' : ''}`}
                  onClick={() => handleStatusChange('nina')}
                  title={`Ativar ${sdrName} (IA)`}
                >
                  <Bot className="w-5 h-5" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={`text-slate-400 hover:text-white ${activeChat.status === 'human' ? 'bg-emerald-500/20 text-emerald-400' : ''}`}
                  onClick={() => handleStatusChange('human')}
                  title="Assumir conversa"
                >
                  <User className="w-5 h-5" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={`text-slate-400 hover:text-white ${activeChat.status === 'paused' ? 'bg-amber-500/20 text-amber-400' : ''}`}
                  onClick={() => handleStatusChange('paused')}
                  title="Pausar conversa"
                >
                  <Pause className="w-5 h-5" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="text-slate-400 hover:text-green-400 hover:bg-green-500/10"
                  onClick={() => {
                    if (!activeChat.contactPhone) {
                      toast.error('Contato sem número de telefone');
                      return;
                    }
                    setShowCallModal(true);
                  }}
                  title="Fazer ligação"
                >
                  <Phone className="w-5 h-5" />
                </Button>
                {/* Active Call Indicator in Header */}
                {activeCall && (
                  <div className="ml-2">
                    <ActiveCallIndicator call={activeCall} onDismiss={dismissActiveCall} />
                  </div>
                )}
                <div className="h-6 w-px bg-slate-800 mx-1"></div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={`text-slate-400 hover:text-white ${showProfileInfo ? 'bg-slate-800 text-cyan-400' : ''}`} 
                  onClick={() => setShowProfileInfo(!showProfileInfo)} 
                  title="Ver Informações"
                >
                  <Info className="w-5 h-5" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <ShadcnButton variant="ghost" size="icon" className="text-slate-400 hover:text-white">
                      <MoreVertical className="w-5 h-5" />
                    </ShadcnButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-slate-800 border-slate-700">
                    {viewingArchived ? (
                      <DropdownMenuItem 
                        onClick={async () => {
                          if (!activeChat) return;
                          try {
                            await unarchiveConversation(activeChat.id);
                            setSelectedChatId(null);
                            setArchivedCount(prev => Math.max(0, prev - 1));
                            toast.success('Conversa restaurada', {
                              description: `${activeChat.contactName} voltou para a fila de atendimento`
                            });
                          } catch (error) {
                            toast.error('Erro ao restaurar conversa');
                          }
                        }}
                        className="text-green-400 hover:text-green-300 hover:bg-green-500/10 cursor-pointer"
                      >
                        <ArchiveRestore className="w-4 h-4 mr-2" />
                        Restaurar conversa
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem 
                        onClick={async () => {
                          if (!activeChat) return;
                          try {
                            await archiveConversation(activeChat.id);
                            setSelectedChatId(null);
                            setArchivedCount(prev => prev + 1);
                            toast.success('Conversa arquivada', {
                              description: `${activeChat.contactName} foi removido da fila de atendimento`
                            });
                          } catch (error) {
                            toast.error('Erro ao arquivar conversa');
                          }
                        }}
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10 cursor-pointer"
                      >
                        <Archive className="w-4 h-4 mr-2" />
                        Arquivar conversa
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar relative z-0">
              {activeChat.messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-500">
                  <MessageSquare className="w-16 h-16 mb-4 opacity-30" />
                  <p className="text-sm">Nenhuma mensagem ainda</p>
                  <p className="text-xs mt-1 opacity-70">Envie uma mensagem para iniciar a conversa</p>
                </div>
              ) : (
                <>
                  <div className="flex justify-center my-6">
                    <span className="px-4 py-1.5 bg-slate-800/80 border border-slate-700 text-slate-400 text-xs font-medium rounded-full shadow-sm backdrop-blur-sm">Hoje</span>
                  </div>

                  {activeChat.messages.map((msg) => {
                    const isOutgoing = msg.direction === MessageDirection.OUTGOING;
                    return (
                      <div key={msg.id} className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'} group animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                        <div className={`flex flex-col max-w-[75%] ${isOutgoing ? 'items-end' : 'items-start'}`}>
                          <div 
                            className={`px-5 py-3 rounded-2xl shadow-md relative text-sm leading-relaxed ${
                              isOutgoing 
                                ? msg.fromType === 'nina'
                                  ? 'bg-gradient-to-br from-violet-600 to-purple-700 text-white rounded-tr-sm shadow-violet-900/20'
                                  : 'bg-gradient-to-br from-cyan-600 to-teal-700 text-white rounded-tr-sm shadow-cyan-900/20'
                                : 'bg-slate-800 text-slate-200 rounded-tl-sm border border-slate-700/50'
                            }`}
                          >
                            {/* Show operator name above message for human messages */}
                            {msg.fromType === 'human' && msg.senderName && (
                              <div className="text-xs font-bold text-cyan-200/80 mb-1.5 uppercase tracking-wide">
                                {msg.senderName}:
                              </div>
                            )}
                            {renderMessageContent(msg)}
                          </div>
                          
                          <div className="flex items-center mt-1.5 gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity px-1">
                            {isOutgoing && msg.fromType === 'nina' && (
                              <Bot className="w-3 h-3 text-violet-400" />
                            )}
                            {isOutgoing && msg.fromType === 'human' && (
                              <User className="w-3 h-3 text-cyan-400" />
                            )}
                            <span className="text-[10px] text-slate-500 font-medium">{msg.timestamp}</span>
                            {isOutgoing && (
                              msg.status === 'read' ? <CheckCheck className="w-3.5 h-3.5 text-cyan-500" /> : 
                              msg.status === 'delivered' ? <CheckCheck className="w-3.5 h-3.5 text-slate-500" /> :
                              <Check className="w-3.5 h-3.5 text-slate-500" />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-slate-900/90 border-t border-slate-800 backdrop-blur-sm z-10">
              {/* Window closed banner - uses real-time state */}
              {!windowTimeRemaining.isOpen && (
                <div className="mb-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm text-red-300 font-medium">Janela de 24h expirou</p>
                    <p className="text-xs text-red-400/80">Envie um template aprovado para reabrir a conversa.</p>
                  </div>
                  <Button 
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => setShowTemplateModal(true)}
                  >
                    <FileType className="w-4 h-4 mr-1.5" />
                    Enviar Template
                  </Button>
                </div>
              )}
              
              <form onSubmit={handleSendMessage} className="flex items-end gap-3 max-w-4xl mx-auto">
                <div className="flex items-center gap-1">
                  <Button type="button" variant="ghost" size="icon" className="text-slate-400 hover:text-cyan-400 hover:bg-slate-800 rounded-full transition-colors" disabled={!windowTimeRemaining.isOpen}>
                    <Smile className="w-5 h-5" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="text-slate-400 hover:text-cyan-400 hover:bg-slate-800 rounded-full transition-colors" disabled={!windowTimeRemaining.isOpen}>
                    <Paperclip className="w-5 h-5" />
                  </Button>
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="icon" 
                    className={`rounded-full transition-colors ${!windowTimeRemaining.isOpen 
                      ? 'text-green-400 bg-green-500/20 hover:bg-green-500/30 animate-pulse' 
                      : 'text-slate-400 hover:text-green-400 hover:bg-green-500/10'
                    }`}
                    onClick={() => setShowTemplateModal(true)}
                    title="Enviar template WhatsApp"
                  >
                    <FileType className="w-5 h-5" />
                  </Button>
                </div>
                
                <div className={`flex-1 bg-slate-950 rounded-2xl border ${
                  !windowTimeRemaining.isOpen 
                    ? 'border-red-500/30 opacity-50' 
                    : 'border-slate-800 focus-within:ring-2 focus-within:ring-cyan-500/30 focus-within:border-cyan-500/50'
                } transition-all shadow-inner`}>
                  <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder={
                      !windowTimeRemaining.isOpen 
                        ? 'Janela expirada - use template para continuar' 
                        : activeChat.status === 'nina' 
                          ? `${sdrName} está respondendo automaticamente...` 
                          : 'Digite sua mensagem...'
                    }
                    className="w-full bg-transparent border-none p-3.5 max-h-32 min-h-[48px] text-sm text-slate-200 focus:ring-0 resize-none outline-none placeholder:text-slate-600 disabled:cursor-not-allowed"
                    rows={1}
                    disabled={!windowTimeRemaining.isOpen}
                  />
                </div>

                {inputText.trim() && windowTimeRemaining.isOpen ? (
                  <Button type="submit" className="rounded-full w-12 h-12 p-0 shadow-lg shadow-cyan-500/20 hover:scale-105 active:scale-95 transition-all">
                    <Send className="w-5 h-5 ml-0.5" />
                  </Button>
                ) : (
                  <Button type="button" variant="secondary" className="rounded-full w-12 h-12 p-0 bg-slate-800 hover:bg-slate-700 text-slate-400 border-slate-700" disabled={!windowTimeRemaining.isOpen}>
                    <Mic className="w-5 h-5" />
                  </Button>
                )}
              </form>
            </div>
          </div>

          {/* Right Profile Sidebar (CRM View) */}
          <div 
            className={`${showProfileInfo ? 'w-80 border-l border-slate-800 opacity-100' : 'w-0 opacity-0 border-none'} transition-all duration-300 ease-in-out bg-slate-900/95 flex-shrink-0 flex flex-col overflow-hidden`}
          >
            <div className="w-80 h-full flex flex-col">
              {/* Header */}
              <div className="h-16 flex items-center justify-between px-6 border-b border-slate-800 flex-shrink-0">
                <span className="font-semibold text-white">Informações do Lead</span>
                <button 
                  onClick={() => setShowProfileInfo(false)}
                  className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
                {/* Identity */}
                <div className="flex flex-col items-center text-center">
                  <div className="w-24 h-24 rounded-full p-1 bg-gradient-to-tr from-cyan-500 to-teal-600 shadow-xl mb-4">
                    <img src={activeChat.contactAvatar} alt={activeChat.contactName} className="w-full h-full rounded-full object-cover border-2 border-slate-900" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-1">{activeChat.contactName}</h3>
                  <p className="text-sm text-slate-400 mb-4">
                    {activeChat.clientMemory.lead_profile.lead_stage === 'new' ? 'Novo Lead' : 
                     activeChat.clientMemory.lead_profile.lead_stage === 'qualified' ? 'Lead Qualificado' :
                     activeChat.clientMemory.lead_profile.lead_stage}
                  </p>
                </div>

                {/* Details List */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Dados de Contato</h4>
                    <button 
                      onClick={() => setIsEditingContact(!isEditingContact)}
                      className="text-cyan-500 hover:text-cyan-400 transition-colors p-1"
                      title={isEditingContact ? "Cancelar edição" : "Editar dados"}
                    >
                      {isEditingContact ? <X className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
                    </button>
                  </div>
                  
                  {/* Phone (always read-only) */}
                  <div className="flex items-center gap-3 text-sm">
                    <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 text-slate-400">
                      <Phone className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col flex-1">
                      <span className="text-xs text-slate-500">Telefone</span>
                      <span className="text-slate-200 font-medium">{activeChat.contactPhone}</span>
                    </div>
                  </div>

                  {/* Email */}
                  <div className="flex items-center gap-3 text-sm">
                    <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 text-slate-400">
                      <Mail className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col flex-1">
                      <span className="text-xs text-slate-500">Email</span>
                      {isEditingContact ? (
                        <Input
                          type="email"
                          value={editEmail}
                          onChange={(e) => setEditEmail(e.target.value)}
                          placeholder="email@empresa.com"
                          className="h-8 text-sm bg-slate-950/50 border-slate-700"
                        />
                      ) : (
                        <span className="text-slate-200 font-medium">
                          {activeChat.contactEmail || <span className="text-slate-500 italic">Não informado</span>}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* CNPJ */}
                  <div className="flex items-center gap-3 text-sm">
                    <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 text-slate-400">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col flex-1">
                      <span className="text-xs text-slate-500">CNPJ</span>
                      {isEditingContact ? (
                        <div className="flex gap-2">
                          <Input
                            type="text"
                            value={editCnpj}
                            onChange={(e) => setEditCnpj(e.target.value)}
                            placeholder="00.000.000/0000-00"
                            className="h-8 text-sm bg-slate-950/50 border-slate-700 flex-1"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleCnpjLookup}
                            disabled={isLookingUpCnpj || editCnpj.replace(/\D/g, '').length < 14}
                            className="h-8 px-2"
                            title="Buscar empresa pelo CNPJ"
                          >
                            {isLookingUpCnpj ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                          </Button>
                        </div>
                      ) : (
                        <span className="text-slate-200 font-medium">
                          {activeChat.contactCnpj ? formatCnpj(activeChat.contactCnpj) : <span className="text-slate-500 italic">Não informado</span>}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Company */}
                  <div className="flex items-center gap-3 text-sm">
                    <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 text-slate-400">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col flex-1">
                      <span className="text-xs text-slate-500">Empresa</span>
                      {isEditingContact ? (
                        <Input
                          type="text"
                          value={editCompany}
                          onChange={(e) => setEditCompany(e.target.value)}
                          placeholder="Nome da empresa"
                          className="h-8 text-sm bg-slate-950/50 border-slate-700"
                        />
                      ) : (
                        <span className="text-slate-200 font-medium">
                          {activeChat.contactCompany || <span className="text-slate-500 italic">Não informado</span>}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Save Button */}
                  {isEditingContact && (
                    <Button
                      onClick={handleSaveContactData}
                      disabled={isSavingContact}
                      className="w-full bg-cyan-600 hover:bg-cyan-700"
                    >
                      {isSavingContact ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Save className="w-4 h-4 mr-2" />
                      )}
                      Salvar Alterações
                    </Button>
                  )}
                </div>

                {/* Convert to Deal Button */}
                <div className="pt-2">
                  {isCheckingDeal ? (
                    <div className="flex items-center justify-center py-3">
                      <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
                    </div>
                  ) : existingDeal ? (
                    <Button
                      variant="outline"
                      className="w-full border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/50"
                      onClick={() => navigate(existingDeal.pipelineId ? `/kanban?pipeline=${existingDeal.pipelineId}` : '/kanban')}
                    >
                      <Briefcase className="w-4 h-4 mr-2" />
                      Ver Negócio no Kanban
                      <ExternalLink className="w-3 h-3 ml-2 opacity-50" />
                    </Button>
                  ) : (
                    <Button
                      className="w-full bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-700 hover:to-teal-700"
                      onClick={handleConvertToDeal}
                      disabled={isCreatingDeal}
                    >
                      {isCreatingDeal ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Plus className="w-4 h-4 mr-2" />
                      )}
                      Converter em Negócio
                    </Button>
                  )}
                </div>

                <div className="h-px bg-slate-800/50 w-full"></div>

                {/* AI Memory Section */}
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Brain className="w-4 h-4" />
                    Memória do(a) {sdrName}
                  </h4>
                  
                  {activeChat.clientMemory.lead_profile.interests.length > 0 && (
                    <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                      <span className="text-xs text-slate-400">Interesses</span>
                      <p className="text-sm text-slate-200 mt-1">
                        {activeChat.clientMemory.lead_profile.interests.join(', ')}
                      </p>
                    </div>
                  )}

                  {activeChat.clientMemory.sales_intelligence.pain_points.length > 0 && (
                    <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                      <span className="text-xs text-slate-400">Dores Identificadas</span>
                      <p className="text-sm text-slate-200 mt-1">
                        {activeChat.clientMemory.sales_intelligence.pain_points.join(', ')}
                      </p>
                    </div>
                  )}

                  <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                    <span className="text-xs text-slate-400">Próxima Ação Sugerida</span>
                    <p className="text-sm text-slate-200 mt-1">
                      {activeChat.clientMemory.sales_intelligence.next_best_action === 'qualify' ? 'Qualificar lead' :
                       activeChat.clientMemory.sales_intelligence.next_best_action === 'demo' ? 'Agendar demonstração' :
                       activeChat.clientMemory.sales_intelligence.next_best_action}
                    </p>
                  </div>

                  <div className="text-xs text-slate-500 text-center">
                    Total de conversas: {activeChat.clientMemory.interaction_summary.total_conversations}
                  </div>
                </div>

                <div className="h-px bg-slate-800/50 w-full"></div>

                {/* Assigned User */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <User className="w-4 h-4" />
                    Responsável
                  </h4>
                  <select
                    value={activeChat.assignedUserId || ''}
                    onChange={(e) => {
                      const userId = e.target.value || null;
                      assignConversation(activeChat.id, userId);
                      toast.success('Conversa atribuída. Deal atualizado automaticamente.');
                    }}
                    className="w-full bg-slate-950/50 border border-slate-800 rounded-lg p-3 text-sm text-slate-300 focus:ring-1 focus:ring-cyan-500/50 focus:border-cyan-500/50 outline-none transition-all"
                  >
                    <option value="">Não atribuído</option>
                    {teamMembers.map(member => (
                      <option key={member.id} value={member.id}>
                        {member.name} ({member.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="h-px bg-slate-800/50 w-full"></div>

                {/* Call History */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <PhoneCall className="w-4 h-4" />
                    Histórico de Ligações
                  </h4>
                  <CallHistoryPanel calls={callHistory} loading={callHistoryLoading} />
                </div>

                <div className="h-px bg-slate-800/50 w-full"></div>

                {/* Tags */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                    Tags
                    <Popover open={isTagSelectorOpen} onOpenChange={setIsTagSelectorOpen}>
                      <PopoverTrigger asChild>
                        <button className="text-cyan-500 hover:text-cyan-400 transition-colors">
                          <Plus className="w-4 h-4" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-72 p-0 bg-slate-900 border-slate-700" align="end">
                        <TagSelector 
                          availableTags={availableTags}
                          selectedTags={activeChat.tags || []}
                          onToggleTag={handleToggleTag}
                          onCreateTag={handleCreateTag}
                        />
                      </PopoverContent>
                    </Popover>
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {activeChat.tags && activeChat.tags.length > 0 ? (
                      activeChat.tags.map(tagKey => {
                        const tagDef = availableTags.find(t => t.key === tagKey);
                        return (
                          <span 
                            key={tagKey}
                            style={{ 
                              backgroundColor: tagDef?.color ? `${tagDef.color}20` : 'rgba(59, 130, 246, 0.2)',
                              borderColor: tagDef?.color || '#3b82f6'
                            }}
                            className="px-2.5 py-1 rounded-md border text-xs font-medium flex items-center gap-1.5 group hover:brightness-110 transition-all"
                          >
                            <span className="text-slate-200">{tagDef?.label || tagKey}</span>
                            <button
                              onClick={() => handleToggleTag(tagKey)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="w-3 h-3 text-slate-400 hover:text-slate-200" />
                            </button>
                          </span>
                        );
                      })
                    ) : (
                      <p className="text-xs text-slate-500 italic">Nenhuma tag adicionada</p>
                    )}
                  </div>
                </div>

                {/* Notes Area */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Notas Internas</h4>
                  <textarea 
                    className="w-full bg-slate-950/50 border border-slate-800 rounded-lg p-3 text-sm text-slate-300 placeholder:text-slate-600 focus:ring-1 focus:ring-cyan-500/50 focus:border-cyan-500/50 outline-none resize-none transition-all"
                    rows={4}
                    placeholder="Adicione observações sobre este lead..."
                    defaultValue={activeChat.notes || ''}
                  ></textarea>
                </div>
              </div>
            </div>
          </div>

        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center bg-[#0B0E14] relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-slate-900/20 to-transparent"></div>
          <div className="relative z-10 flex flex-col items-center p-8 text-center max-w-md">
            <div className="w-24 h-24 bg-slate-900 rounded-full flex items-center justify-center mb-6 shadow-2xl border border-slate-800 relative group">
              <div className="absolute inset-0 bg-cyan-500/20 rounded-full blur-xl group-hover:bg-cyan-500/30 transition-all duration-1000"></div>
              <MessageSquare className="w-10 h-10 text-cyan-500" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">{companyName} Workspace</h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              {conversations.length === 0 
                ? 'Aguardando novas conversas. Configure o webhook do WhatsApp para começar a receber mensagens.'
                : 'Selecione uma conversa ao lado para iniciar o atendimento inteligente.'}
            </p>
            <div className="mt-8 flex gap-3 text-xs text-slate-500 font-mono bg-slate-900/50 px-4 py-2 rounded-lg border border-slate-800/50">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                {sdrName} Online
              </span>
              <span className="w-px h-4 bg-slate-800"></span>
              <span>{conversations.length} conversas</span>
            </div>
          </div>
        </div>
      )}

      {/* Call Confirmation Modal */}
      {activeChat && (
        <CallConfirmationModal
          isOpen={showCallModal}
          onClose={() => setShowCallModal(false)}
          contact={{
            id: activeChat.contactId,
            name: activeChat.contactName,
            phone: activeChat.contactPhone,
            avatar: activeChat.contactAvatar,
            company: activeChat.contactCompany,
            tags: activeChat.tags,
          }}
          conversationId={activeChat.id}
          defaultExtension={defaultExtension}
          onCallInitiated={() => setShowCallModal(false)}
        />
      )}

      {/* WhatsApp Template Modal */}
      {activeChat && (
        <SendWhatsAppTemplateModal
          isOpen={showTemplateModal}
          onClose={() => setShowTemplateModal(false)}
          contactId={activeChat.contactId}
          conversationId={activeChat.id}
          contactName={activeChat.contactName}
          contactCompany={activeChat.contactCompany}
          onSent={() => setShowTemplateModal(false)}
        />
      )}
    </div>
  );
};

export default ChatInterface;
