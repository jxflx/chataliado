import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { soundAlerts } from '@/lib/audio/sound-alerts';
import {
  toggleConversationMode,
  toggleConversationStatus,
  sendHumanMessage,
  updateCustomerNotes,
} from '@/app/(dashboard)/chats/actions';
import {
  type Conversation,
  type Message,
  type Customer,
  type ConversationMode,
  type ConversationStatus,
} from '@/types/database';

export type EnrichedConversation = Conversation & {
  customer?: Pick<Customer, 'id' | 'name' | 'phone' | 'notes_md'> | null;
  last_message?: Pick<Message, 'id' | 'content' | 'role' | 'created_at'> | null;
  unread_count?: number;
};

export type StatusFilter = 'all' | 'open' | 'closed';
export type ModeFilter = 'all' | 'ai' | 'human';

export interface UseLiveChatOptions {
  restaurantId: string | null | undefined;
  initialConversations?: EnrichedConversation[];
  autoSelectFirst?: boolean;
}

export interface UseLiveChatReturn {
  conversations: EnrichedConversation[];
  filteredConversations: EnrichedConversation[];
  activeConversation: EnrichedConversation | null;
  activeConversationId: string | null;
  messages: Message[];
  loading: boolean;
  loadingMessages: boolean;
  error: string | null;
  searchQuery: string;
  statusFilter: StatusFilter;
  modeFilter: ModeFilter;
  soundEnabled: boolean;
  // Acciones
  selectConversation: (conversationId: string | null) => void;
  sendMessage: (content: string) => Promise<{ success: boolean; error?: string }>;
  setMode: (mode: ConversationMode, conversationId?: string) => Promise<{ success: boolean; error?: string }>;
  setStatus: (status: ConversationStatus, conversationId?: string) => Promise<{ success: boolean; error?: string }>;
  updateNotes: (notesMd: string, customerId?: string) => Promise<{ success: boolean; error?: string }>;
  setSearchQuery: (query: string) => void;
  setStatusFilter: (filter: StatusFilter) => void;
  setModeFilter: (filter: ModeFilter) => void;
  toggleSound: () => void;
  refresh: () => Promise<void>;
}

export function useLiveChat({
  restaurantId,
  initialConversations = [],
  autoSelectFirst = false,
}: UseLiveChatOptions): UseLiveChatReturn {
  const [conversations, setConversations] = useState<EnrichedConversation[]>(initialConversations);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    autoSelectFirst && initialConversations.length > 0 ? initialConversations[0]?.id ?? null : null
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState<boolean>(!initialConversations.length);
  const [loadingMessages, setLoadingMessages] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filtros reactivos
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all');
  const [soundEnabled, setSoundEnabledState] = useState<boolean>(soundAlerts.getSoundEnabled());

  // Referencias para evitar stale closures en callbacks de Realtime y carreras asíncronas
  const activeConvoIdRef = useRef<string | null>(activeConversationId);
  activeConvoIdRef.current = activeConversationId;

  const conversationsRef = useRef<EnrichedConversation[]>(conversations);
  conversationsRef.current = conversations;

  const messagesRef = useRef<Message[]>(messages);
  messagesRef.current = messages;

  const activeRequestCounterRef = useRef<number>(0);
  const convoRequestCounterRef = useRef<number>(0);
  const seenMessageIdsRef = useRef<Set<string>>(new Set());
  const prevRestaurantIdRef = useRef<string | null | undefined>(restaurantId);

  // Reset de estado estricto y limpieza al cambiar de tenant / restaurante
  useEffect(() => {
    if (prevRestaurantIdRef.current !== restaurantId) {
      prevRestaurantIdRef.current = restaurantId;
      setActiveConversationId(null);
      setMessages([]);
      setError(null);
      seenMessageIdsRef.current.clear();
      activeRequestCounterRef.current++;
      convoRequestCounterRef.current++;
    }
  }, [restaurantId]);

  // 1. Carga inicial de conversaciones y clientes
  const loadConversations = useCallback(async () => {
    if (!restaurantId) {
      setConversations([]);
      setLoading(false);
      return;
    }

    const requestId = ++convoRequestCounterRef.current;

    try {
      setLoading(true);
      setError(null);
      const supabase = createClient();

      // Consulta de conversaciones del restaurante
      const { data: convosData, error: convosError } = await supabase
        .from('conversations')
        .select(`
          id,
          restaurant_id,
          customer_id,
          status,
          mode,
          created_at,
          updated_at,
          customers (
            id,
            name,
            phone,
            notes_md
          )
        `)
        .eq('restaurant_id', restaurantId)
        .order('updated_at', { ascending: false });

      if (convosError) {
        throw new Error(convosError.message);
      }

      if (requestId !== convoRequestCounterRef.current) {
        return;
      }

      if (!convosData) {
        setConversations([]);
        return;
      }

      // Obtener el último mensaje para cada conversación de forma eficiente
      const convoIds = convosData.map((c) => c.id);
      let lastMessagesMap: Record<string, Message> = {};

      if (convoIds.length > 0) {
        const { data: recentMsgs } = await supabase
          .from('messages')
          .select('id, conversation_id, content, role, created_at, restaurant_id, provider_message_id, metadata')
          .eq('restaurant_id', restaurantId)
          .in('conversation_id', convoIds)
          .order('created_at', { ascending: false });

        if (recentMsgs) {
          for (const msg of recentMsgs) {
            if (!lastMessagesMap[msg.conversation_id]) {
              lastMessagesMap[msg.conversation_id] = msg as Message;
            }
          }
        }
      }

      if (requestId !== convoRequestCounterRef.current) {
        return;
      }

      const enriched: EnrichedConversation[] = convosData.map((c) => {
        const customerObj = Array.isArray(c.customers)
          ? c.customers[0]
          : c.customers;

        return {
          id: c.id,
          restaurant_id: c.restaurant_id,
          customer_id: c.customer_id,
          status: c.status as ConversationStatus,
          mode: c.mode as ConversationMode,
          created_at: c.created_at,
          updated_at: c.updated_at,
          customer: customerObj
            ? {
                id: customerObj.id,
                name: customerObj.name,
                phone: customerObj.phone,
                notes_md: customerObj.notes_md,
              }
            : null,
          last_message: lastMessagesMap[c.id]
            ? {
                id: lastMessagesMap[c.id]!.id,
                content: lastMessagesMap[c.id]!.content,
                role: lastMessagesMap[c.id]!.role,
                created_at: lastMessagesMap[c.id]!.created_at,
              }
            : null,
        };
      });

      setConversations(enriched);

      if (autoSelectFirst && enriched.length > 0 && !activeConvoIdRef.current) {
        setActiveConversationId(enriched[0]?.id ?? null);
      }
    } catch (err: unknown) {
      if (requestId === convoRequestCounterRef.current) {
        const msg = err instanceof Error ? err.message : 'Error cargando conversaciones';
        console.error('[useLiveChat] loadConversations error:', err);
        setError(msg);
      }
    } finally {
      if (requestId === convoRequestCounterRef.current) {
        setLoading(false);
      }
    }
  }, [restaurantId, autoSelectFirst]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  // 2. Cargar mensajes cuando cambia la conversación activa
  const loadMessagesForConversation = useCallback(
    async (convoId: string) => {
      if (!restaurantId || !convoId) {
        setMessages([]);
        return;
      }

      const requestId = ++activeRequestCounterRef.current;
      setLoadingMessages(true);

      try {
        const supabase = createClient();
        const { data, error: msgError } = await supabase
          .from('messages')
          .select('*')
          .eq('restaurant_id', restaurantId)
          .eq('conversation_id', convoId)
          .order('created_at', { ascending: true });

        if (msgError) {
          throw new Error(msgError.message);
        }

        if (requestId === activeRequestCounterRef.current) {
          const dbMsgs = (data as Message[]) || [];
          setMessages((prev) => {
            // Preservar mensajes optimistas o eventos Realtime que llegaron mientras el fetch estaba en vuelo
            const dbIds = new Set(dbMsgs.map((m) => m.id));
            const inFlightPending = prev.filter(
              (m) => m.conversation_id === convoId && !dbIds.has(m.id)
            );
            const combined = [...dbMsgs, ...inFlightPending];
            return combined.sort(
              (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
          });
        }
      } catch (err: unknown) {
        if (requestId === activeRequestCounterRef.current) {
          const msg = err instanceof Error ? err.message : 'Error cargando mensajes';
          console.error('[useLiveChat] loadMessages error:', err);
          setError(msg);
        }
      } finally {
        if (requestId === activeRequestCounterRef.current) {
          setLoadingMessages(false);
        }
      }
    },
    [restaurantId]
  );

  useEffect(() => {
    if (activeConversationId) {
      setMessages([]); // Limpiar inmediatamente para evitar contaminación visual de conversaciones anteriores
      void loadMessagesForConversation(activeConversationId);
    } else {
      setMessages([]);
    }
  }, [activeConversationId, loadMessagesForConversation]);

  // 3. Suscripción a Supabase Realtime con Blindaje Multi-Tenant y Deduplicación
  useEffect(() => {
    if (!restaurantId) return;

    const supabase = createClient();
    const channelName = 'chats-realtime-' + restaurantId;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
          filter: 'restaurant_id=eq.' + restaurantId,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newConvo = payload.new as Conversation;
            // Blindaje Multi-Tenant: Descartar si no coincide con el tenant activo
            if (!newConvo || !newConvo.id || newConvo.restaurant_id !== restaurantId) return;

            setConversations((prev) => {
              if (prev.some((c) => c.id === newConvo.id)) return prev;
              return [
                {
                  ...newConvo,
                  customer: null,
                  last_message: null,
                },
                ...prev,
              ];
            });
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Conversation;
            // Blindaje Multi-Tenant
            if (!updated || !updated.id || updated.restaurant_id !== restaurantId) return;

            const oldConvo = conversationsRef.current.find((c) => c.id === updated.id);

            if (oldConvo && oldConvo.mode !== 'human' && updated.mode === 'human') {
              soundAlerts.playHandoffAlertSound();
            }

            setConversations((prev) =>
              prev.map((c) =>
                c.id === updated.id
                  ? {
                      ...c,
                      ...updated,
                      customer: c.customer,
                      last_message: c.last_message,
                    }
                  : c
              )
            );
          } else if (payload.eventType === 'DELETE') {
            const deleted = payload.old as { id?: string } | null | undefined;
            if (!deleted?.id) return;

            setConversations((prev) => prev.filter((c) => c.id !== deleted.id));
            if (activeConvoIdRef.current === deleted.id) {
              setActiveConversationId(null);
              setMessages([]);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: 'restaurant_id=eq.' + restaurantId,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          // Blindaje Multi-Tenant
          if (!newMsg || !newMsg.id || newMsg.restaurant_id !== restaurantId) return;

          // Deduplicación de alertas sonoras
          if (newMsg.role === 'user') {
            if (!seenMessageIdsRef.current.has(newMsg.id)) {
              seenMessageIdsRef.current.add(newMsg.id);
              if (seenMessageIdsRef.current.size > 1000) {
                const toDelete = Array.from(seenMessageIdsRef.current).slice(0, 500);
                for (const id of toDelete) seenMessageIdsRef.current.delete(id);
              }
              soundAlerts.playNewMessageSound();
            }
          }

          if (newMsg.conversation_id === activeConvoIdRef.current) {
            setMessages((prev) => {
              const alreadyExists = prev.some((m) => m.id === newMsg.id);
              if (alreadyExists) return prev;

              const optimisticIdx = prev.findIndex(
                (m) =>
                  m.id.startsWith('temp-') &&
                  m.role === newMsg.role &&
                  m.content === newMsg.content
              );

              let updatedList: Message[];
              if (optimisticIdx !== -1) {
                const copy = [...prev];
                copy[optimisticIdx] = newMsg;
                updatedList = copy;
              } else {
                updatedList = [...prev, newMsg];
              }

              return updatedList.sort(
                (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
              );
            });
          }

          setConversations((prev) => {
            const convoIndex = prev.findIndex((c) => c.id === newMsg.conversation_id);
            if (convoIndex === -1) return prev;

            const targetConvo = prev[convoIndex]!;
            const currentLastTime = targetConvo.last_message?.created_at
              ? new Date(targetConvo.last_message.created_at).getTime()
              : 0;
            const newMsgTime = new Date(newMsg.created_at).getTime();
            const isNewer = newMsgTime >= currentLastTime;

            const updatedConvo: EnrichedConversation = {
              ...targetConvo,
              updated_at: isNewer ? newMsg.created_at : targetConvo.updated_at,
              last_message: isNewer
                ? {
                    id: newMsg.id,
                    content: newMsg.content,
                    role: newMsg.role,
                    created_at: newMsg.created_at,
                  }
                : targetConvo.last_message,
            };

            return [updatedConvo, ...prev.filter((c) => c.id !== newMsg.conversation_id)];
          });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [restaurantId]);

  // 4. Seleccionar conversación activa
  const selectConversation = useCallback((conversationId: string | null) => {
    setActiveConversationId(conversationId);
  }, []);

  // 5. Envío de mensaje humano con Optimistic UI Blindada
  const sendMessage = useCallback(
    async (content: string): Promise<{ success: boolean; error?: string }> => {
      const activeId = activeConvoIdRef.current;
      if (!restaurantId || !activeId) {
        return { success: false, error: 'No hay conversación activa seleccionada' };
      }

      const trimmed = content.trim();
      if (!trimmed) {
        return { success: false, error: 'El mensaje no puede estar vacío' };
      }

      const activeConvo = conversationsRef.current.find((c) => c.id === activeId);
      const recipientPhone = activeConvo?.customer?.phone;

      if (!recipientPhone) {
        return {
          success: false,
          error: 'No se encontró el teléfono del destinatario para esta conversación',
        };
      }

      const previousLastMessage = activeConvo?.last_message ?? null;
      const previousUpdatedAt = activeConvo?.updated_at;

      const randSuffix =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : Date.now() + '-' + Math.random().toString(36).slice(2, 9);
      const tempId = `temp-${randSuffix}`;

      const optimisticMsg: Message = {
        id: tempId,
        restaurant_id: restaurantId,
        conversation_id: activeId,
        role: 'human_agent',
        content: trimmed,
        provider_message_id: null,
        metadata: { optimistic: true },
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, optimisticMsg]);

      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeId
            ? {
                ...c,
                updated_at: optimisticMsg.created_at,
                last_message: {
                  id: optimisticMsg.id,
                  content: optimisticMsg.content,
                  role: optimisticMsg.role,
                  created_at: optimisticMsg.created_at,
                },
              }
            : c
        )
      );

      try {
        const response = await sendHumanMessage({
          restaurantId,
          conversationId: activeId,
          phone: recipientPhone,
          content: trimmed,
        });

        if (!response.success) {
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
          setConversations((prev) =>
            prev.map((c) =>
              c.id === activeId && c.last_message?.id === tempId
                ? {
                    ...c,
                    updated_at: previousUpdatedAt ?? c.updated_at,
                    last_message: previousLastMessage,
                  }
                : c
            )
          );
          return { success: false, error: response.error || 'Error enviando mensaje' };
        }

        if (response.data?.message) {
          const realMsg = response.data.message;
          setMessages((prev) =>
            prev.map((m) => (m.id === tempId ? realMsg : m))
          );
          setConversations((prev) =>
            prev.map((c) =>
              c.id === activeId && c.last_message?.id === tempId
                ? {
                    ...c,
                    last_message: {
                      id: realMsg.id,
                      content: realMsg.content,
                      role: realMsg.role,
                      created_at: realMsg.created_at,
                    },
                  }
                : c
            )
          );
        }

        return { success: true };
      } catch (err: unknown) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setConversations((prev) =>
          prev.map((c) =>
            c.id === activeId && c.last_message?.id === tempId
              ? {
                  ...c,
                  updated_at: previousUpdatedAt ?? c.updated_at,
                  last_message: previousLastMessage,
                }
              : c
          )
        );
        const errorMsg = err instanceof Error ? err.message : 'Error inesperado al enviar mensaje';
        return { success: false, error: errorMsg };
      }
    },
    [restaurantId]
  );

  // 6. Cambiar modo (AI / Human) con Optimistic UI
  const setMode = useCallback(
    async (
      newMode: ConversationMode,
      targetConvoId?: string
    ): Promise<{ success: boolean; error?: string }> => {
      const convoId = targetConvoId ?? activeConvoIdRef.current;
      if (!restaurantId || !convoId) {
        return { success: false, error: 'No se especificó la conversación' };
      }

      const previousConvo = conversationsRef.current.find((c) => c.id === convoId);
      const previousMode = previousConvo?.mode ?? 'ai';

      setConversations((prev) =>
        prev.map((c) => (c.id === convoId ? { ...c, mode: newMode } : c))
      );

      const res = await toggleConversationMode(restaurantId, convoId, newMode);

      if (!res.success) {
        setConversations((prev) =>
          prev.map((c) => (c.id === convoId ? { ...c, mode: previousMode } : c))
        );
        return { success: false, error: res.error };
      }

      return { success: true };
    },
    [restaurantId]
  );

  // 7. Cambiar estado (Open / Closed) con Optimistic UI
  const setStatus = useCallback(
    async (
      newStatus: ConversationStatus,
      targetConvoId?: string
    ): Promise<{ success: boolean; error?: string }> => {
      const convoId = targetConvoId ?? activeConvoIdRef.current;
      if (!restaurantId || !convoId) {
        return { success: false, error: 'No se especificó la conversación' };
      }

      const previousConvo = conversationsRef.current.find((c) => c.id === convoId);
      const previousStatus = previousConvo?.status ?? 'open';

      setConversations((prev) =>
        prev.map((c) => (c.id === convoId ? { ...c, status: newStatus } : c))
      );

      const res = await toggleConversationStatus(restaurantId, convoId, newStatus);

      if (!res.success) {
        setConversations((prev) =>
          prev.map((c) => (c.id === convoId ? { ...c, status: previousStatus } : c))
        );
        return { success: false, error: res.error };
      }

      return { success: true };
    },
    [restaurantId]
  );

  // 8. Actualizar notas del cliente ("Libreta del Mesero") con Optimistic UI
  const updateNotes = useCallback(
    async (
      notesMd: string,
      customerId?: string
    ): Promise<{ success: boolean; error?: string }> => {
      const activeConvo = conversationsRef.current.find((c) => c.id === activeConvoIdRef.current);
      const targetId = customerId || activeConvo?.customer?.id;

      if (!targetId) {
        return { success: false, error: 'No active customer' };
      }

      if (!restaurantId) {
        return { success: false, error: 'No restaurant specified' };
      }

      // Guardar estado previo para rollback en caso de fallo
      const prevNotesMap = new Map<string, string>();
      for (const c of conversationsRef.current) {
        if (c.customer?.id === targetId) {
          prevNotesMap.set(c.id, c.customer.notes_md ?? '');
        }
      }

      // Actualización optimista inmediata en conversations
      setConversations((prev) =>
        prev.map((c) => {
          if (c.customer?.id === targetId) {
            return {
              ...c,
              customer: {
                ...c.customer,
                notes_md: notesMd,
              },
            };
          }
          return c;
        })
      );

      try {
        const res = await updateCustomerNotes(restaurantId, targetId, notesMd);

        if (!res.success) {
          // Revertir estado local ante fallo del servidor
          setConversations((prev) =>
            prev.map((c) => {
              if (c.customer?.id === targetId && prevNotesMap.has(c.id)) {
                return {
                  ...c,
                  customer: {
                    ...c.customer,
                    notes_md: prevNotesMap.get(c.id) ?? '',
                  },
                };
              }
              return c;
            })
          );
          return { success: false, error: res.error };
        }

        return { success: true };
      } catch (err: unknown) {
        // Rollback local ante excepciones inesperadas
        setConversations((prev) =>
          prev.map((c) => {
            if (c.customer?.id === targetId && prevNotesMap.has(c.id)) {
              return {
                ...c,
                customer: {
                  ...c.customer,
                  notes_md: prevNotesMap.get(c.id) ?? '',
                },
              };
            }
            return c;
          })
        );
        const errorMsg = err instanceof Error ? err.message : 'Error inesperado al actualizar notas';
        return { success: false, error: errorMsg };
      }
    },
    [restaurantId]
  );

  // 9. Alternar alertas sonoras
  const toggleSound = useCallback(() => {
    const nextState = !soundAlerts.getSoundEnabled();
    soundAlerts.setSoundEnabled(nextState);
    setSoundEnabledState(nextState);
  }, []);

  // 10. Filtrado reactivo en memoria
  const filteredConversations = useMemo(() => {
    return conversations.filter((convo) => {
      if (statusFilter !== 'all' && convo.status !== statusFilter) {
        return false;
      }

      if (modeFilter !== 'all' && convo.mode !== modeFilter) {
        return false;
      }

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const nameMatch = convo.customer?.name?.toLowerCase().includes(query) ?? false;
        const phoneMatch = convo.customer?.phone?.includes(query) ?? false;
        const lastMsgMatch = convo.last_message?.content.toLowerCase().includes(query) ?? false;

        if (!nameMatch && !phoneMatch && !lastMsgMatch) {
          return false;
        }
      }

      return true;
    });
  }, [conversations, statusFilter, modeFilter, searchQuery]);

  const activeConversation = useMemo(() => {
    if (!activeConversationId) return null;
    return conversations.find((c) => c.id === activeConversationId) ?? null;
  }, [conversations, activeConversationId]);

  return {
    conversations,
    filteredConversations,
    activeConversation,
    activeConversationId,
    messages,
    loading,
    loadingMessages,
    error,
    searchQuery,
    statusFilter,
    modeFilter,
    soundEnabled,
    selectConversation,
    sendMessage,
    setMode,
    setStatus,
    updateNotes,
    setSearchQuery,
    setStatusFilter,
    setModeFilter,
    toggleSound,
    refresh: loadConversations,
  };
}
