import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface UnreadConversation {
  id: string;
  contactName: string;
  contactInitials: string;
  lastMessage: string;
  unreadCount: number;
  lastMessageAt: string;
}

interface UnreadMessagesContextType {
  totalUnread: number;
  unreadConversations: UnreadConversation[];
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

          unreadData.push({
            id: conv.id,
            contactName,
            contactInitials: initials,
            lastMessage: lastMessageContent || '📎 Mídia',
            unreadCount: hasUnreadMessages ? (unreadCount || 0) : 1, // Se só precisa atenção, conta como 1
            lastMessageAt: conv.last_message_at
          });
        }
      }

      // Ordenar por última mensagem
      unreadData.sort((a, b) => 
        new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
      );

      setUnreadConversations(unreadData);
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
    <UnreadMessagesContext.Provider value={{ totalUnread, unreadConversations, refetch: fetchUnreadConversations }}>
      {children}
    </UnreadMessagesContext.Provider>
  );
};
