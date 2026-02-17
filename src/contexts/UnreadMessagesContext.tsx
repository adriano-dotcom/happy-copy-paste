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
  
  const previousLeadIdsRef = useRef<Set<string>>(new Set());
  const previousMessageIdsRef = useRef<Set<string>>(new Set());
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchUnreadConversations = useCallback(async () => {
    try {
      // Single query: get active conversations with contact info
      const { data: conversations, error: convError } = await supabase
        .from('conversations')
        .select(`
          id,
          last_message_at,
          status,
          contact:contacts!conversations_contact_id_fkey (
            id, name, call_name, phone_number
          )
        `)
        .eq('is_active', true)
        .order('last_message_at', { ascending: false });

      if (convError || !conversations?.length) {
        setUnreadConversations([]);
        setTotalUnread(0);
        setPendingLeadsCount(0);
        setUnreadMessagesCount(0);
        setPendingLeads([]);
        setUnreadMessages([]);
        return;
      }

      const conversationIds = conversations.map(c => c.id);

      // Batch query: get unread counts + last unread message per conversation in 2 queries (not N)
      const [unreadResult, humanResult, lastMsgResult] = await Promise.all([
        // 1. Count unread messages per conversation
        supabase
          .from('messages')
          .select('conversation_id, id, content, sent_at')
          .in('conversation_id', conversationIds)
          .eq('from_type', 'user')
          .is('read_at', null)
          .order('sent_at', { ascending: false }),
        // 2. Check which conversations had human interaction
        supabase
          .from('messages')
          .select('conversation_id')
          .in('conversation_id', conversationIds)
          .eq('from_type', 'human'),
        // 3. Get last message for each conversation (for preview)
        supabase
          .from('messages')
          .select('conversation_id, content, type')
          .in('conversation_id', conversationIds)
          .order('sent_at', { ascending: false }),
      ]);

      // Build lookup maps
      const unreadByConv = new Map<string, { count: number; lastContent: string }>();
      for (const msg of unreadResult.data || []) {
        const existing = unreadByConv.get(msg.conversation_id);
        if (!existing) {
          unreadByConv.set(msg.conversation_id, { count: 1, lastContent: msg.content || '' });
        } else {
          existing.count++;
        }
      }

      const conversationsWithHuman = new Set((humanResult.data || []).map(m => m.conversation_id));

      const lastMsgByConv = new Map<string, string>();
      for (const msg of lastMsgResult.data || []) {
        if (!lastMsgByConv.has(msg.conversation_id)) {
          lastMsgByConv.set(msg.conversation_id, msg.content || (msg.type !== 'text' ? '📎 Mídia' : 'Nova conversa'));
        }
      }

      // Build unread data
      const unreadData: UnreadConversation[] = [];

      for (const conv of conversations) {
        const contact = conv.contact as any;
        const contactName = contact?.name || contact?.call_name || contact?.phone_number || 'Desconhecido';
        const initials = contactName.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();

        const unread = unreadByConv.get(conv.id);
        const hasUnreadMessages = !!unread && unread.count > 0;
        const needsHumanAttention = conv.status === 'nina' && !conversationsWithHuman.has(conv.id);

        if (!hasUnreadMessages && !needsHumanAttention) continue;

        const lastMessageContent = unread?.lastContent || lastMsgByConv.get(conv.id) || '📎 Mídia';
        const conversationType: 'pending_lead' | 'unread_message' =
          needsHumanAttention && !hasUnreadMessages ? 'pending_lead' : 'unread_message';

        unreadData.push({
          id: conv.id,
          contactName,
          contactInitials: initials,
          lastMessage: lastMessageContent,
          unreadCount: hasUnreadMessages ? unread!.count : 1,
          lastMessageAt: conv.last_message_at,
          type: conversationType,
        });
      }

      unreadData.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());

      const leads = unreadData.filter(c => c.type === 'pending_lead');
      const messages = unreadData.filter(c => c.type === 'unread_message');

      // Sound notifications for new items
      const currentLeadIds = new Set(leads.map(l => l.id));
      const currentMessageIds = new Set(messages.map(m => m.id));

      if (previousLeadIdsRef.current.size > 0) {
        if (leads.some(l => !previousLeadIdsRef.current.has(l.id))) playNewLeadSound();
      }
      if (previousMessageIdsRef.current.size > 0) {
        if (messages.some(m => !previousMessageIdsRef.current.has(m.id))) playNotificationSound();
      }

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

  // Debounced version for realtime events
  const debouncedFetch = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      fetchUnreadConversations();
    }, 2000);
  }, [fetchUnreadConversations]);

  useEffect(() => {
    fetchUnreadConversations();

    const channel = supabase
      .channel('unread-messages-global')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          if (payload.new && (payload.new as any).from_type === 'user') {
            debouncedFetch();
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        (payload) => {
          if (payload.new && (payload.new as any).read_at) {
            debouncedFetch();
          }
        }
      )
      .subscribe();

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [fetchUnreadConversations, debouncedFetch]);

  return (
    <UnreadMessagesContext.Provider value={{ 
      totalUnread, unreadConversations, pendingLeadsCount,
      unreadMessagesCount, pendingLeads, unreadMessages,
      refetch: fetchUnreadConversations 
    }}>
      {children}
    </UnreadMessagesContext.Provider>
  );
};
