import React, { useRef, useEffect, useState, useCallback } from 'react';
import { ArrowDown, MessageSquare } from 'lucide-react';
import { type Message } from '@/types/database';
import { MessageBubble } from './message-bubble';
import { MessageListSkeleton } from './chat-skeletons';

export interface MessageListProps {
  messages: Message[];
  loadingMessages?: boolean;
  customerName?: string | null;
  className?: string;
}

/**
 * Formatea una fecha para los separadores entre días en la conversación.
 */
function formatDateSeparator(dateString: string): string {
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    const now = new Date();

    const isSameDay =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    if (isSameDay) return 'Hoy';

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday =
      date.getDate() === yesterday.getDate() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getFullYear() === yesterday.getFullYear();

    if (isYesterday) return 'Ayer';

    return date.toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'long',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  } catch {
    return '';
  }
}

/**
 * Verifica si dos marcas de tiempo caen en días de calendario distintos.
 */
function isDifferentDay(d1?: string | null, d2?: string | null): boolean {
  if (!d1 || !d2) return true;
  try {
    const date1 = new Date(d1);
    const date2 = new Date(d2);
    return (
      date1.getDate() !== date2.getDate() ||
      date1.getMonth() !== date2.getMonth() ||
      date1.getFullYear() !== date2.getFullYear()
    );
  } catch {
    return true;
  }
}

/**
 * Timeline de mensajes espacioso con contenedor Liquid Glass y scroll inteligente.
 * 
 * Reglas de diseño y ergonomía (kds-liquid-glass.html:697-766):
 * - Contenedor: liquid-dock rounded-2xl p-4 flex-1 flex flex-col justify-between overflow-hidden shadow-2xs border border-white/95 relative.
 * - Auto-scroll inteligente al recibir nuevos mensajes si el operador está al fondo.
 * - Botón flotante "Nuevos mensajes" con icono Lucide ArrowDown (1.5px stroke) cuando se desplazó arriba.
 * - Separadores de día con badge sobrio en font-mono.
 * - Skeleton de carga durante peticiones a Supabase.
 * - CERO EMOJIS en UI y código.
 */
export function MessageList({
  messages,
  loadingMessages = false,
  customerName,
  className = '',
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);
  const prevMessagesLengthRef = useRef<number>(messages.length);
  const [showScrollBottom, setShowScrollBottom] = useState<boolean>(false);

  // Determinar si el scroll se encuentra cerca del fondo
  const isNearBottom = useCallback((): boolean => {
    const el = containerRef.current;
    if (!el) return true;
    const threshold = 120;
    return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
  }, []);

  // Función para forzar desplazamiento al fondo de manera segura
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (bottomAnchorRef.current) {
      try {
        bottomAnchorRef.current.scrollIntoView?.({ behavior });
      } catch {
        if (containerRef.current) {
          containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
      }
    }
  }, []);

  // Detección de scroll del usuario
  const handleScroll = useCallback(() => {
    if (isNearBottom()) {
      setShowScrollBottom(false);
    }
  }, [isNearBottom]);

  // Manejo de nuevos mensajes con auto-scroll
  useEffect(() => {
    const hasNewMessages = messages.length > prevMessagesLengthRef.current;
    prevMessagesLengthRef.current = messages.length;

    if (!hasNewMessages) return;

    const timer = setTimeout(() => {
      if (isNearBottom()) {
        scrollToBottom('smooth');
        setShowScrollBottom(false);
      } else {
        // El usuario estaba leyendo el historial hacia arriba y llegó un nuevo mensaje
        setShowScrollBottom(true);
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [messages.length, isNearBottom, scrollToBottom]);

  // Desplazamiento inicial al montar o terminar de cargar
  useEffect(() => {
    if (!loadingMessages && messages.length > 0) {
      scrollToBottom('auto');
    }
  }, [loadingMessages, messages.length, scrollToBottom]);

  return (
    <div
      className={`liquid-dock rounded-2xl p-4 flex-1 flex flex-col justify-between overflow-hidden shadow-2xs border border-white/95 relative ${className}`}
    >
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto space-y-3 scrollbar-thin text-xs min-h-0 pr-1"
        role="log"
        aria-label="Historial de mensajes"
        aria-live="polite"
      >
        {/* 1. Estado de Carga */}
        {loadingMessages && messages.length === 0 ? (
          <MessageListSkeleton />
        ) : messages.length === 0 ? (
          /* 2. Conversación Vacía */
          <div className="h-full flex flex-col items-center justify-center p-8 text-center text-ink-secondary">
            <div className="w-12 h-12 rounded-2xl bg-white/80 border border-white flex items-center justify-center mb-3 shadow-2xs">
              <MessageSquare className="w-5 h-5 text-ink-tertiary" strokeWidth={1.5} />
            </div>
            <h3 className="text-sm font-extrabold text-ink-primary mb-1">
              Sin mensajes aún
            </h3>
            <p className="text-xs text-ink-secondary max-w-xs leading-relaxed">
              Inicia la conversación escribiendo un mensaje abajo o espera a que el comensal envíe un mensaje por WhatsApp.
            </p>
          </div>
        ) : (
          /* 3. Lista de Mensajes con Separadores de Fecha */
          <div className="space-y-3">
            {messages.map((message, idx) => {
              const prevMessage = idx > 0 ? messages[idx - 1] : null;
              const showDateSeparator = isDifferentDay(
                prevMessage?.created_at,
                message.created_at
              );
              const dateLabel = showDateSeparator
                ? formatDateSeparator(message.created_at)
                : null;

              return (
                <React.Fragment key={message.id}>
                  {showDateSeparator && dateLabel && (
                    <div className="flex justify-center my-3">
                      <span className="font-mono text-[11px] font-bold text-ink-secondary bg-white/85 border border-whisper px-3 py-0.5 rounded-full shadow-2xs">
                        {dateLabel}
                      </span>
                    </div>
                  )}
                  <MessageBubble
                    message={message}
                    customerName={customerName}
                  />
                </React.Fragment>
              );
            })}
            {/* Ancla para auto-scroll */}
            <div ref={bottomAnchorRef} className="h-1 w-full" aria-hidden="true" />
          </div>
        )}
      </div>

      {/* 4. Botón Flotante "Nuevos mensajes" cuando el usuario subió en el historial */}
      {showScrollBottom && (
        <div className="absolute bottom-4 left-0 right-0 flex justify-center z-10 pointer-events-none">
          <button
            type="button"
            onClick={() => {
              scrollToBottom('smooth');
              setShowScrollBottom(false);
            }}
            className="pressable pointer-events-auto inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-jade text-white rounded-full shadow-md text-xs font-bold hover:bg-jade-hover transition-all"
            aria-label="Desplazarse a los mensajes más recientes"
          >
            <ArrowDown className="w-3.5 h-3.5 animate-bounce" strokeWidth={1.5} />
            <span>Nuevos mensajes</span>
          </button>
        </div>
      )}
    </div>
  );
}
