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
      // Buscar conversas ativas com mensagens não lidas
      const { data: conversations, error: convError } = await supabase
        .from('conversations')
        .select(`
          id,
          last_message_at,
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

      // Para cada conversa, buscar mensagens não lidas (from_type = 'user' e read_at = null)
      const unreadData: UnreadConversation[] = [];

      for (const conv of conversations) {
        const { data: unreadMessages, error: msgError } = await supabase
          .from('messages')
          .select('id, content, sent_at')
          .eq('conversation_id', conv.id)
          .eq('from_type', 'user')
          .is('read_at', null)
          .order('sent_at', { ascending: false })
          .limit(1);

        if (msgError) {
          console.error('Error fetching unread messages:', msgError);
          continue;
        }

        const { count } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', conv.id)
          .eq('from_type', 'user')
          .is('read_at', null);

        if (count && count > 0) {
          const contact = conv.contact as any;
          const contactName = contact?.name || contact?.call_name || contact?.phone_number || 'Desconhecido';
          const initials = contactName
            .split(' ')
            .map((n: string) => n[0])
            .slice(0, 2)
            .join('')
            .toUpperCase();

          unreadData.push({
            id: conv.id,
            contactName,
            contactInitials: initials,
            lastMessage: unreadMessages?.[0]?.content || '📎 Mídia',
            unreadCount: count,
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
