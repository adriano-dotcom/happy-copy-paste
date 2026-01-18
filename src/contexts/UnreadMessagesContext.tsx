import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { playNotificationSound, playNewLeadSound } from '@/utils/notificationSound';

interface UnreadConversation {
  id: string;
  contactName: string;
  contactInitials: string;
  lastMessage: string;
  unreadCount: number;
  lastMessageAt: string;
  type: 'pending_lead' | 'unread_message';
}

interface UnreadMessagesContextType {
  totalUnread: number;
  unreadConversations: UnreadConversation[];
  pendingLeadsCount: number;
  unreadMessagesCount: number;
  pendingLeads: UnreadConversation[];
  unreadMessages: UnreadConversation[];
  refetch: () => Promise<void>;
}

const UnreadMessagesContext = createContext<UnreadMessagesContextType | undefined>(undefined);

export const useUnreadMessages = () => {
  const context = useContext(UnreadMessagesContext);
  if (!context) {
    throw new Error('useUnreadMessages must be used within UnreadMessagesProvider');
  }
  return context;
};

export const UnreadMessagesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [unreadConversations, setUnreadConversations] = useState<UnreadConversation[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [pendingLeadsCount, setPendingLeadsCount] = useState(0);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [pendingLeads, setPendingLeads] = useState<UnreadConversation[]>([]);
  const [unreadMessages, setUnreadMessages] = useState<UnreadConversation[]>([]);
  
  // Refs para rastrear IDs anteriores (para detectar novos itens)
  const previousLeadIdsRef = useRef<Set<string>>(new Set());
  const previousMessageIdsRef = useRef<Set<string>>(new Set());

  const fetchUnreadConversations = useCallback(async () => {
    try {
      // Buscar conversas ativas
      const { data: conversations, error: convError } = await supabase
        .from('conversations')
        .select(`
          id,
          last_message_at,
          status,
          contact:contacts!conversations_contact_id_fkey (
            id,
            name,
            call_name,
            phone_number
          )
        `)
        .eq('is_active', true)
        .order('last_message_at', { ascending: false });

      if (convError) {
        console.error('Error fetching conversations:', convError);
        return;
      }

      if (!conversations || conversations.length === 0) {
        setUnreadConversations([]);
        setTotalUnread(0);
        return;
      }

      const unreadData: UnreadConversation[] = [];
      const conversationIds = conversations.map(c => c.id);

      // Buscar todas as conversas que já tiveram interação humana
      const { data: humanInteractions } = await supabase
        .from('messages')
        .select('conversation_id')
        .in('conversation_id', conversationIds)
        .eq('from_type', 'human');

      const conversationsWithHuman = new Set(humanInteractions?.map(m => m.conversation_id) || []);

      for (const conv of conversations) {
        const contact = conv.contact as any;
        const contactName = contact?.name || contact?.call_name || contact?.phone_number || 'Desconhecido';
        const initials = contactName
          .split(' ')
          .map((n: string) => n[0])
          .slice(0, 2)
          .join('')
          .toUpperCase();

        // Buscar mensagens não lidas do usuário
        const { data: unreadMessages } = await supabase
          .from('messages')
          .select('id, content, sent_at')
          .eq('conversation_id', conv.id)
          .eq('from_type', 'user')
          .is('read_at', null)
          .order('sent_at', { ascending: false })
          .limit(1);

        const { count: unreadCount } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', conv.id)
          .eq('from_type', 'user')
          .is('read_at', null);

        // Incluir conversa se:
        // 1. Tem mensagens não lidas do cliente
        // 2. OU nunca teve atendimento humano (status = 'nina' e sem mensagens human)
        const hasUnreadMessages = unreadCount && unreadCount > 0;
        const needsHumanAttention = conv.status === 'nina' && !conversationsWithHuman.has(conv.id);

        if (hasUnreadMessages || needsHumanAttention) {
          // Buscar última mensagem para preview se não houver não lida
          let lastMessageContent = unreadMessages?.[0]?.content || '';
          
          if (!lastMessageContent) {
            const { data: lastMsg } = await supabase
              .from('messages')
              .select('content, type')
              .eq('conversation_id', conv.id)
              .order('sent_at', { ascending: false })
              .limit(1);
            
            lastMessageContent = lastMsg?.[0]?.content || (lastMsg?.[0]?.type !== 'text' ? '📎 Mídia' : 'Nova conversa');
          }

          // Determinar o tipo da conversa
          const conversationType: 'pending_lead' | 'unread_message' = 
            needsHumanAttention && !hasUnreadMessages ? 'pending_lead' : 'unread_message';

          unreadData.push({
            id: conv.id,
            contactName,
            contactInitials: initials,
            lastMessage: lastMessageContent || '📎 Mídia',
            unreadCount: hasUnreadMessages ? (unreadCount || 0) : 1,
            lastMessageAt: conv.last_message_at,
            type: conversationType
          });
        }
      }

      // Ordenar por última mensagem
      unreadData.sort((a, b) => 
        new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
      );

      // Separar em listas distintas
      const leads = unreadData.filter(c => c.type === 'pending_lead');
      const messages = unreadData.filter(c => c.type === 'unread_message');

      // Detectar novos itens e tocar som apropriado
      const currentLeadIds = new Set(leads.map(l => l.id));
      const currentMessageIds = new Set(messages.map(m => m.id));

      // Verificar se há novos leads (somente se já temos dados anteriores)
      if (previousLeadIdsRef.current.size > 0) {
        const newLeads = leads.filter(l => !previousLeadIdsRef.current.has(l.id));
        if (newLeads.length > 0) {
          playNewLeadSound();
        }
      }

      // Verificar se há novas mensagens não lidas
      if (previousMessageIdsRef.current.size > 0) {
        const newMessages = messages.filter(m => !previousMessageIdsRef.current.has(m.id));
        if (newMessages.length > 0) {
          playNotificationSound();
        }
      }

      // Atualizar refs com IDs atuais
      previousLeadIdsRef.current = currentLeadIds;
      previousMessageIdsRef.current = currentMessageIds;

      setUnreadConversations(unreadData);
      setPendingLeads(leads);
      setUnreadMessages(messages);
      setPendingLeadsCount(leads.length);
      setUnreadMessagesCount(messages.reduce((acc, conv) => acc + conv.unreadCount, 0));
      setTotalUnread(unreadData.reduce((acc, conv) => acc + conv.unreadCount, 0));
    } catch (error) {
      console.error('Error in fetchUnreadConversations:', error);
    }
  }, []);

  useEffect(() => {
    fetchUnreadConversations();

    // Real-time subscription para novas mensagens
    const channel = supabase
      .channel('unread-messages-global')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages'
        },
        (payload) => {
          // Refetch quando nova mensagem do usuário chegar
          if (payload.new && (payload.new as any).from_type === 'user') {
            fetchUnreadConversations();
          }
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
          // Refetch quando mensagem for marcada como lida
          if (payload.new && (payload.new as any).read_at) {
            fetchUnreadConversations();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchUnreadConversations]);

  return (
    <UnreadMessagesContext.Provider value={{ 
      totalUnread, 
      unreadConversations, 
      pendingLeadsCount,
      unreadMessagesCount,
      pendingLeads,
      unreadMessages,
      refetch: fetchUnreadConversations 
    }}>
      {children}
    </UnreadMessagesContext.Provider>
  );
};
