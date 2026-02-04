import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { api } from '@/services/api';
import { 
  UIConversation, 
  UIMessage,
  DBMessage,
  transformDBToUIMessage,
  MessageDirection,
  MessageType
} from '@/types';
import { toast } from 'sonner';
import { playNotificationSound, playQualifiedLeadSound } from '@/utils/notificationSound';

export function useConversations() {
  const [conversations, setConversations] = useState<UIConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMoreMessages, setHasMoreMessages] = useState<Record<string, boolean>>({});
  const [loadingMoreMessages, setLoadingMoreMessages] = useState<string | null>(null);
  
  // Cache for conversation message counts (to track if more messages exist)
  const messageCountsRef = useRef<Record<string, number>>({});

  // Initial fetch
  const fetchConversations = useCallback(async (includeConversationId?: string) => {
    try {
      setLoading(true);
      setError(null);
      
      // Check if user is still authenticated before fetching
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.warn('[useConversations] No active session - user may need to log in again');
        setError('Sessão expirada. Por favor, faça login novamente.');
        toast.error('Sessão expirada. Por favor, faça login novamente.', {
          duration: 10000,
          action: {
            label: 'Fazer Login',
            onClick: () => window.location.href = '/auth'
          }
        });
        setLoading(false);
        return;
      }
      
      const data = await api.fetchConversations(includeConversationId);
      
      // If data is empty but should have conversations, might be auth issue
      if (data.length === 0) {
        console.log('[useConversations] No conversations returned - checking if auth issue');
      }
      
      setConversations(data);
    } catch (err: any) {
      console.error('[useConversations] Error fetching:', err);
      
      // Check for auth-related errors
      if (err?.message?.includes('JWT') || err?.code === 'PGRST301' || err?.message?.includes('auth')) {
        setError('Sessão expirada. Por favor, faça login novamente.');
        toast.error('Sessão expirada. Por favor, faça login novamente.', {
          duration: 10000,
          action: {
            label: 'Fazer Login',
            onClick: () => window.location.href = '/auth'
          }
        });
      } else {
        setError('Erro ao carregar conversas');
        toast.error('Erro ao carregar conversas');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Handler functions for realtime events (extracted for unified channel)
  const handleMessageInsert = useCallback((payload: any) => {
    console.log('[Realtime] New message:', payload.new);
    const newMessage = payload.new as DBMessage;
    
    setConversations(prev => {
      return prev.map(conv => {
        if (conv.id === newMessage.conversation_id) {
          const uiMessage = transformDBToUIMessage(newMessage);
          
          // Check if message already exists by ID (avoid duplicates)
          const existsById = conv.messages.some(m => m.id === uiMessage.id);
          if (existsById) {
            console.log('[Realtime] Message already exists by ID, skipping');
            return conv;
          }

          // Check for temp message with same content (optimistic update race condition)
          const tempMessageIndex = conv.messages.findIndex(m => 
            m.id.startsWith('temp-') && 
            m.content === uiMessage.content &&
            m.fromType === uiMessage.fromType
          );
          
          if (tempMessageIndex !== -1) {
            // Replace temp message with real one from database
            console.log('[Realtime] Replacing temp message with real message');
            const updatedMessages = [...conv.messages];
            updatedMessages[tempMessageIndex] = uiMessage;
            return {
              ...conv,
              messages: updatedMessages,
              lastMessage: newMessage.content || '',
              lastMessageTime: 'Agora'
            };
          }

          // Normal flow for truly new messages (from contacts, Nina, etc)
          console.log('[Realtime] Adding new message');
          return {
            ...conv,
            messages: [...conv.messages, uiMessage],
            lastMessage: newMessage.content || '',
            lastMessageTime: 'Agora',
            lastMessageAt: newMessage.sent_at,
            lastMessageFromUser: newMessage.from_type === 'user',
            // Increment unread if it's from user and play notification
            unreadCount: newMessage.from_type === 'user' 
              ? (playNotificationSound(), conv.unreadCount + 1)
              : conv.unreadCount,
            // If Nina responded, mark as needing human review
            needsHumanReview: newMessage.from_type === 'nina' 
              ? true 
              : conv.needsHumanReview
          };
        }
        return conv;
      });
    });
  }, []);

  const handleMessageUpdate = useCallback((payload: any) => {
    console.log('[Realtime] Message updated:', payload.new);
    const updatedMessage = payload.new as DBMessage;
    
    setConversations(prev => {
      return prev.map(conv => {
        if (conv.id === updatedMessage.conversation_id) {
          return {
            ...conv,
            messages: conv.messages.map(msg => {
              if (msg.id === updatedMessage.id) {
                return transformDBToUIMessage(updatedMessage);
              }
              return msg;
            })
          };
        }
        return conv;
      });
    });
  }, []);

  const handleConversationChange = useCallback((payload: any) => {
    console.log('[Realtime] Conversation change:', payload);
    
    if (payload.eventType === 'INSERT') {
      // Refetch to get full data with contact
      fetchConversations();
    } else if (payload.eventType === 'UPDATE') {
      const updated = payload.new as any;
      setConversations(prev => {
        return prev.map(conv => {
          if (conv.id === updated.id) {
            // Check if lead just became qualified (score crossed 70 threshold)
            const oldScore = conv.ninaContext?.qualification_score as number | undefined;
            const newScore = updated.nina_context?.qualification_score as number | undefined;
            
            if (newScore && newScore >= 70 && (!oldScore || oldScore < 70)) {
              console.log('[Realtime] Lead qualified! Score:', newScore);
              playQualifiedLeadSound();
              toast.success(`🔥 Lead Qualificado: ${conv.contactName}`, {
                description: `Score: ${newScore}%`
              });
            }

            // Recalculate window status if whatsapp_window_start changed
            const windowStart = updated.whatsapp_window_start ? new Date(updated.whatsapp_window_start) : null;
            const now = new Date();
            const windowEndTime = windowStart ? new Date(windowStart.getTime() + 24 * 60 * 60 * 1000) : null;
            const isWindowOpen = windowStart !== null && windowEndTime !== null && now < windowEndTime;
            const msRemaining = isWindowOpen && windowEndTime ? windowEndTime.getTime() - now.getTime() : null;
            const hoursRemaining = msRemaining !== null ? Math.max(0, msRemaining / (1000 * 60 * 60)) : null;

            return {
              ...conv,
              status: updated.status,
              isActive: updated.is_active,
              assignedTeam: updated.assigned_team,
              assignedUserId: updated.assigned_user_id ?? conv.assignedUserId,
              assignedUserName: updated.assigned_user_name ?? conv.assignedUserName,
              ninaContext: updated.nina_context ?? conv.ninaContext,
              whatsappWindowStart: updated.whatsapp_window_start || conv.whatsappWindowStart,
              isWhatsAppWindowOpen: updated.whatsapp_window_start !== undefined ? isWindowOpen : conv.isWhatsAppWindowOpen,
              windowHoursRemaining: updated.whatsapp_window_start !== undefined ? hoursRemaining : conv.windowHoursRemaining,
              lastMessageAt: updated.last_message_at || conv.lastMessageAt,
              needsHumanReview: updated.needs_human_review ?? conv.needsHumanReview
            };
          }
          return conv;
        });
      });
    }
  }, [fetchConversations]);

  const handleContactUpdate = useCallback((payload: any) => {
    console.log('[Realtime] Contact updated:', payload.new);
    const updated = payload.new as any;
    
    setConversations(prev => {
      return prev.map(conv => {
        if (conv.contactId === updated.id) {
          return {
            ...conv,
            contactName: updated.name || updated.call_name || conv.contactName,
            contactPhone: updated.phone_number || conv.contactPhone,
            contactEmail: updated.email || null,
            contactCnpj: updated.cnpj || null,
            contactCompany: updated.company || null,
            contactFleetSize: updated.fleet_size || null,
            notes: updated.notes || null,
            clientMemory: updated.client_memory || conv.clientMemory,
            tags: updated.tags || []
          };
        }
        return conv;
      });
    });
  }, []);

  // Set up UNIFIED real-time subscription (1 WebSocket instead of 3)
  useEffect(() => {
    fetchConversations();

    // OPTIMIZATION: Single unified channel for all tables
    const unifiedChannel = supabase
      .channel('chat-realtime-unified')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        handleMessageInsert
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        handleMessageUpdate
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        handleConversationChange
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'contacts' },
        handleContactUpdate
      )
      .subscribe();

    // Cleanup
    return () => {
      console.log('[Realtime] Cleaning up unified subscription');
      supabase.removeChannel(unifiedChannel);
    };
  }, [fetchConversations, handleMessageInsert, handleMessageUpdate, handleConversationChange, handleContactUpdate]);

  // Send message
  const sendMessage = useCallback(async (conversationId: string, content: string, operatorName?: string) => {
    if (!content.trim()) return;

    // Optimistic update with temporary ID
    const tempId = `temp-${Date.now()}`;
    const tempMessage: UIMessage = {
      id: tempId,
      content,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      sentAt: new Date().toISOString(),
      direction: MessageDirection.OUTGOING,
      type: MessageType.TEXT,
      status: 'sent',
      fromType: 'human',
      mediaUrl: null,
      senderName: operatorName || null,
      metadata: null
    };

    setConversations(prev => {
      return prev.map(conv => {
        if (conv.id === conversationId) {
          return {
            ...conv,
            messages: [...conv.messages, tempMessage],
            lastMessage: content,
            lastMessageTime: 'Agora'
          };
        }
        return conv;
      });
    });

    try {
      // The realtime handler will detect and replace the temp message automatically
      await api.sendMessage(conversationId, content, operatorName);
    } catch (err) {
      console.error('[useConversations] Error sending message:', err);
      toast.error('Erro ao enviar mensagem');
      
      // Remove optimistic message on error
      setConversations(prev => {
        return prev.map(conv => {
          if (conv.id === conversationId) {
            return {
              ...conv,
              messages: conv.messages.filter(m => m.id !== tempId)
            };
          }
          return conv;
        });
      });
    }
  }, []);

  // Update conversation status
  const updateStatus = useCallback(async (
    conversationId: string, 
    status: 'nina' | 'human' | 'paused' | 'closed',
    userId?: string,
    userName?: string
  ) => {
    try {
      await api.updateConversationStatus(conversationId, status, userId);
      
      setConversations(prev => {
        return prev.map(conv => {
          if (conv.id === conversationId) {
            return { 
              ...conv, 
              status,
              assignedUserId: status === 'human' ? (userId || conv.assignedUserId) : (status === 'nina' ? null : conv.assignedUserId),
              assignedUserName: status === 'human' ? (userName || conv.assignedUserName) : (status === 'nina' ? null : conv.assignedUserName)
            };
          }
          return conv;
        });
      });

      const statusLabels: Record<string, string> = {
        nina: 'IA ativada',
        human: 'Atendimento humano ativado',
        paused: 'Conversa pausada',
        closed: 'Conversa encerrada'
      };
      toast.success(statusLabels[status]);
    } catch (err) {
      console.error('[useConversations] Error updating status:', err);
      toast.error('Erro ao atualizar status');
    }
  }, []);

  // Mark messages as read
  const markAsRead = useCallback(async (conversationId: string) => {
    // Optimistic UI update
    setConversations(prev => {
      return prev.map(conv => {
        if (conv.id === conversationId) {
          return { ...conv, unreadCount: 0 };
        }
        return conv;
      });
    });

    // Persist to database
    try {
      await api.markMessagesAsRead(conversationId);
      console.log('[useConversations] Messages marked as read in database');
    } catch (err) {
      console.error('[useConversations] Error marking messages as read:', err);
      // Don't revert UI on error (better UX)
    }
  }, []);

  // Mark conversation as viewed by human (stops pulsing indicator)
  const markAsViewed = useCallback(async (conversationId: string) => {
    // Optimistic UI update
    setConversations(prev => {
      return prev.map(conv => {
        if (conv.id === conversationId) {
          return { ...conv, needsHumanReview: false };
        }
        return conv;
      });
    });

    // Persist to database
    try {
      await supabase
        .from('conversations')
        .update({ needs_human_review: false })
        .eq('id', conversationId);
      console.log('[useConversations] Conversation marked as viewed');
    } catch (err) {
      console.error('[useConversations] Error marking as viewed:', err);
      // Don't revert UI on error (better UX)
    }
  }, []);

  // Assign conversation (and sync with deal)
  const assignConversation = useCallback(async (
    conversationId: string, 
    userId: string | null,
    userName?: string | null
  ) => {
    const conv = conversations.find(c => c.id === conversationId);
    if (!conv) return;

    // Optimistic UI update - include dealOwnerId and dealOwnerName
    setConversations(prev => {
      return prev.map(c => {
        if (c.id === conversationId) {
          return { 
            ...c, 
            assignedUserId: userId,
            dealOwnerId: userId,
            dealOwnerName: userName || null
          };
        }
        return c;
      });
    });

    // Persist to database
    try {
      await api.assignConversation(conversationId, userId, conv.contactId);
      console.log('[useConversations] Conversation and deal assigned');
    } catch (err) {
      console.error('[useConversations] Error assigning conversation:', err);
      // Revert on error
      setConversations(prev => {
        return prev.map(c => {
          if (c.id === conversationId) {
            return { 
              ...c, 
              assignedUserId: conv.assignedUserId,
              dealOwnerId: conv.dealOwnerId,
              dealOwnerName: conv.dealOwnerName
            };
          }
          return c;
        });
      });
    }
  }, [conversations]);

  // Archive conversation (remove from active queue)
  const archiveConversation = useCallback(async (conversationId: string) => {
    try {
      await api.archiveConversation(conversationId);
      // Remove from local list (optimistic update)
      setConversations(prev => prev.filter(c => c.id !== conversationId));
      console.log('[useConversations] Conversation archived');
    } catch (err) {
      console.error('[useConversations] Error archiving conversation:', err);
      throw err;
    }
  }, []);

  // Unarchive conversation (restore to active queue)
  const unarchiveConversation = useCallback(async (conversationId: string) => {
    try {
      await api.unarchiveConversation(conversationId);
      // Remove from local list (optimistic update - will be refetched)
      setConversations(prev => prev.filter(c => c.id !== conversationId));
      console.log('[useConversations] Conversation unarchived');
    } catch (err) {
      console.error('[useConversations] Error unarchiving conversation:', err);
      throw err;
    }
  }, []);

  // Fetch archived conversations
  const fetchArchivedConversations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.fetchArchivedConversations();
      setConversations(data);
    } catch (err) {
      console.error('[useConversations] Error fetching archived:', err);
      setError('Erro ao carregar conversas arquivadas');
      toast.error('Erro ao carregar conversas arquivadas');
    } finally {
      setLoading(false);
    }
  }, []);

  // Bulk archive conversations (remove multiple from active queue)
  const bulkArchiveConversations = useCallback(async (conversationIds: string[]) => {
    try {
      const count = await api.bulkArchiveConversations(conversationIds);
      // Remove from local list (optimistic update)
      setConversations(prev => prev.filter(c => !conversationIds.includes(c.id)));
      console.log(`[useConversations] ${count} conversations archived`);
      return count;
    } catch (err) {
      console.error('[useConversations] Error bulk archiving:', err);
      throw err;
    }
  }, []);

  // Load more messages for a conversation (lazy loading / pagination)
  const loadMoreMessages = useCallback(async (conversationId: string): Promise<boolean> => {
    const conv = conversations.find(c => c.id === conversationId);
    if (!conv || conv.messages.length === 0) return false;
    
    // Get oldest message's date as the cursor
    const oldestMessage = conv.messages[0];
    if (!oldestMessage.sentAt) return false;
    
    setLoadingMoreMessages(conversationId);
    
    try {
      const olderMessages = await api.fetchMoreMessages(conversationId, oldestMessage.sentAt, 50);
      
      if (olderMessages.length === 0) {
        setHasMoreMessages(prev => ({ ...prev, [conversationId]: false }));
        return false;
      }
      
      // Transform and prepend messages
      const transformedMessages: UIMessage[] = olderMessages.map((msg: any) => transformDBToUIMessage(msg));
      
      setConversations(prev => {
        return prev.map(c => {
          if (c.id === conversationId) {
            // Deduplicate by ID
            const existingIds = new Set(c.messages.map(m => m.id));
            const newMessages = transformedMessages.filter(m => !existingIds.has(m.id));
            return {
              ...c,
              messages: [...newMessages, ...c.messages]
            };
          }
          return c;
        });
      });
      
      // If we got less than requested, there are no more messages
      const hasMore = olderMessages.length >= 50;
      setHasMoreMessages(prev => ({ ...prev, [conversationId]: hasMore }));
      
      return hasMore;
    } catch (err) {
      console.error('[useConversations] Error loading more messages:', err);
      toast.error('Erro ao carregar mensagens antigas');
      return false;
    } finally {
      setLoadingMoreMessages(null);
    }
  }, [conversations]);

  return {
    conversations,
    loading,
    error,
    sendMessage,
    updateStatus,
    markAsRead,
    markAsViewed,
    assignConversation,
    archiveConversation,
    unarchiveConversation,
    fetchArchivedConversations,
    bulkArchiveConversations,
    refetch: fetchConversations,
    // Lazy loading
    loadMoreMessages,
    hasMoreMessages,
    loadingMoreMessages
  };
}
