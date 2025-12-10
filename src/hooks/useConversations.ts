import { useState, useEffect, useCallback } from 'react';
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

export function useConversations() {
  const [conversations, setConversations] = useState<UIConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initial fetch
  const fetchConversations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.fetchConversations();
      setConversations(data);
    } catch (err) {
      console.error('[useConversations] Error fetching:', err);
      setError('Erro ao carregar conversas');
      toast.error('Erro ao carregar conversas');
    } finally {
      setLoading(false);
    }
  }, []);

  // Set up real-time subscription
  useEffect(() => {
    fetchConversations();

    // Subscribe to new messages
    const messagesChannel = supabase
      .channel('messages-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages'
        },
        (payload) => {
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
                  // Increment unread if it's from user
                  unreadCount: newMessage.from_type === 'user' 
                    ? conv.unreadCount + 1 
                    : conv.unreadCount
                };
              }
              return conv;
            });
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages'
        },
        (payload) => {
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
        }
      )
      .subscribe();

    // Subscribe to conversation changes
    const conversationsChannel = supabase
      .channel('conversations-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations'
        },
        (payload) => {
          console.log('[Realtime] Conversation change:', payload);
          
          if (payload.eventType === 'INSERT') {
            // Refetch to get full data with contact
            fetchConversations();
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as any;
            setConversations(prev => {
              return prev.map(conv => {
                if (conv.id === updated.id) {
                  return {
                    ...conv,
                    status: updated.status,
                    isActive: updated.is_active,
                    assignedTeam: updated.assigned_team
                  };
                }
                return conv;
              });
            });
          }
        }
      )
      .subscribe();

    // Subscribe to contact changes (for auto-updated data from AI)
    const contactsChannel = supabase
      .channel('contacts-realtime')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'contacts'
        },
        (payload) => {
          console.log('[Realtime] Contact updated:', payload.new);
          const updated = payload.new as any;
          
          setConversations(prev => {
            return prev.map(conv => {
              if (conv.contactId === updated.id) {
                return {
                  ...conv,
                  contactEmail: updated.email || null,
                  contactCnpj: updated.cnpj || null,
                  contactCompany: updated.company || null,
                  contactName: updated.name || updated.call_name || conv.contactName,
                  notes: updated.notes || null,
                  clientMemory: updated.client_memory || conv.clientMemory
                };
              }
              return conv;
            });
          });
        }
      )
      .subscribe();

    // Cleanup
    return () => {
      console.log('[Realtime] Cleaning up subscriptions');
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(conversationsChannel);
      supabase.removeChannel(contactsChannel);
    };
  }, [fetchConversations]);

  // Send message
  const sendMessage = useCallback(async (conversationId: string, content: string) => {
    if (!content.trim()) return;

    // Optimistic update with temporary ID
    const tempId = `temp-${Date.now()}`;
    const tempMessage: UIMessage = {
      id: tempId,
      content,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      direction: MessageDirection.OUTGOING,
      type: MessageType.TEXT,
      status: 'sent',
      fromType: 'human',
      mediaUrl: null
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
      await api.sendMessage(conversationId, content);
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
    status: 'nina' | 'human' | 'paused'
  ) => {
    try {
      await api.updateConversationStatus(conversationId, status);
      
      setConversations(prev => {
        return prev.map(conv => {
          if (conv.id === conversationId) {
            return { ...conv, status };
          }
          return conv;
        });
      });

      const statusLabels = {
        nina: 'IA ativada',
        human: 'Atendimento humano ativado',
        paused: 'Conversa pausada'
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

  // Assign conversation (and sync with deal)
  const assignConversation = useCallback(async (conversationId: string, userId: string | null) => {
    const conv = conversations.find(c => c.id === conversationId);
    if (!conv) return;

    // Optimistic UI update
    setConversations(prev => {
      return prev.map(c => {
        if (c.id === conversationId) {
          return { ...c, assignedUserId: userId };
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
            return { ...c, assignedUserId: conv.assignedUserId };
          }
          return c;
        });
      });
    }
  }, [conversations]);

  return {
    conversations,
    loading,
    error,
    sendMessage,
    updateStatus,
    markAsRead,
    assignConversation,
    refetch: fetchConversations
  };
}
