import React from 'react';
import { Bot, User, CheckCircle2, Mic, Image as ImageIcon } from 'lucide-react';
import { type EnrichedConversation } from '@/hooks/use-live-chat';
import { formatWhatsAppPreview } from '@/lib/whatsapp/message-parser';

export interface ChatItemProps {
  conversation: EnrichedConversation;
  isActive: boolean;
  onSelect: (conversationId: string) => void;
}

/**
 * Formatea una fecha ISO en marcas temporales relativas concisas en JetBrains Mono (font-mono).
 */
export function formatRelativeTime(dateString?: string | null): string {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    const now = new Date();

    const isSameDay =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    if (isSameDay) {
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      return `${hours}:${minutes}`;
    }

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday =
      date.getDate() === yesterday.getDate() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getFullYear() === yesterday.getFullYear();

    if (isYesterday) {
      return 'Ayer';
    }

    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${day}/${month}`;
  } catch {
    return '';
  }
}

/**
 * Extrae 2 iniciales limpias para el avatar monograma del cliente.
 */
function getCustomerInitials(name?: string | null, phone?: string | null): string {
  if (name && name.trim()) {
    const clean = name.trim().replace(/[^\p{L}\p{N}\s]/gu, '');
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const first = parts[0]?.[0] ?? '';
      const second = parts[1]?.[0] ?? '';
      return (first + second).toUpperCase();
    }
    if (parts.length === 1 && parts[0]) {
      return parts[0].slice(0, 2).toUpperCase();
    }
  }
  if (phone) {
    const digits = phone.replace(/\D/g, '');
    return digits.slice(-2) || 'WA';
  }
  return 'WA';
}

/**
 * Formatea un número de teléfono en tipografía legible.
 */
export function formatPhoneNumber(phone?: string | null): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('52')) {
    return `+52 ${digits.slice(2, 4)} ${digits.slice(4, 8)} ${digits.slice(8)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 2)} ${digits.slice(2, 6)} ${digits.slice(6)}`;
  }
  return phone;
}

interface OrderDetails {
  orderBadge: string | null;
  stage: string | null;
  total: string | null;
}

/**
 * Extrae información de comanda/orden activa desde la conversación o notas de cliente.
 */
function extractOrderDetails(conversation: EnrichedConversation): OrderDetails {
  const customOrder = (conversation as Record<string, unknown>).order as Record<string, unknown> | undefined;
  const activeOrder = (conversation as Record<string, unknown>).active_order as Record<string, unknown> | undefined;
  const order = customOrder || activeOrder;

  let orderBadge: string | null = null;
  let stage: string | null = null;
  let total: string | null = null;

  if (order) {
    if (order.order_number) {
      orderBadge = `#${order.order_number}`;
    } else if (order.table_number) {
      orderBadge = `Mesa ${order.table_number}`;
    } else if (order.channel === 'delivery' || order.type === 'delivery') {
      orderBadge = 'Domicilio';
    } else if (typeof order.id === 'string') {
      orderBadge = `#${order.id.slice(0, 5)}`;
    }

    if (order.stage && typeof order.stage === 'string') {
      stage = order.stage;
    } else if (order.status === 'preparing') {
      stage = 'En Horno (18m)';
    } else if (order.status === 'ready') {
      stage = 'Listo para Despacho';
    } else if (order.status === 'delivered') {
      stage = 'Entregado';
    } else if (order.status === 'confirmed') {
      stage = 'Confirmado';
    }

    if (order.total !== undefined && order.total !== null) {
      total = typeof order.total === 'number' ? `$${order.total}` : String(order.total);
    }
  }

  // Si no hay orden estructurada, intentar inferir comanda desde notas o metadatos
  if (!orderBadge && conversation.customer?.notes_md) {
    const match = conversation.customer.notes_md.match(/#(\d{4,6})/);
    if (match?.[1]) {
      orderBadge = `#${match[1]}`;
      if (!stage && conversation.status === 'open') {
        stage = 'En Cocina';
      }
    }
  }

  return { orderBadge, stage, total };
}

/**
 * Tarjeta de conversación individual en el monitor de chats (Liquid Glass).
 * 
 * Reglas de diseño (R2, kds-liquid-glass.html:534-650):
 * - CERO EMOJIS (iconos vectoriales Lucide de 1.5px).
 * - Timestamps en JetBrains Mono (font-mono).
 * - Tarjeta Liquid Glass con acento lateral border-l-4 y avatar monograma cuadrado-redondeado (rounded-xl).
 * - Estado seleccionado: bg-periwinkle-tint/80 border-periwinkle-tint border-l-4 border-accent-jade border-l-periwinkle-ink shadow-xs.
 * - Estado Handoff/Humano: bg-amber-50/80 border-amber-300/80 border-l-4 border-l-ochre.
 * - Badges de orden (#11613), etapa de cocina y precio en verde Jade, o Requiere Operador Humano en Ochre.
 * - Snippet con icono contextual Lucide Mic (audio) o Image (comprobante/SPEI).
 */
function ChatItemComponent({ conversation, isActive, onSelect }: ChatItemProps) {
  const customerName = conversation.customer?.name?.trim() || null;
  const customerPhone = conversation.customer?.phone || null;
  const initials = getCustomerInitials(customerName, customerPhone);
  const displayName = customerName || (customerPhone ? formatPhoneNumber(customerPhone) : 'Comensal');

  const lastMessageTime = formatRelativeTime(
    conversation.last_message?.created_at || conversation.updated_at
  );

  let prefix = '';
  if (conversation.last_message) {
    if (conversation.last_message.role === 'human_agent') {
      prefix = 'Tú: ';
    } else if (conversation.last_message.role === 'assistant') {
      prefix = 'IA: ';
    }
  }

  const rawPreview = conversation.last_message?.content
    ? formatWhatsAppPreview(conversation.last_message.content, 50)
    : 'Sin mensajes aún';
  const previewText = prefix ? `${prefix}${rawPreview}` : rawPreview;

  const isHumanMode = conversation.mode === 'human' || Boolean((conversation as Record<string, unknown>).requires_human);
  const isClosed = conversation.status === 'closed';
  const unreadCount = conversation.unread_count ?? 0;

  const orderDetails = extractOrderDetails(conversation);

  // Detección contextual de notas de voz o imágenes/comprobantes
  const messageContent = conversation.last_message?.content || '';
  const lastMsgRaw = conversation.last_message as Record<string, unknown> | undefined;
  const messageMetadata = lastMsgRaw?.metadata as Record<string, unknown> | undefined;

  const isAudioMessage = Boolean(
    messageMetadata?.type === 'audio' ||
    messageMetadata?.media_type === 'audio' ||
    (typeof messageMetadata?.mimetype === 'string' && messageMetadata.mimetype.startsWith('audio/')) ||
    /\[(?:audio|nota de voz|voice note)\]/i.test(messageContent) ||
    /\.(?:ogg|opus|mp3|m4a|wav)(?:\?|$)/i.test(messageContent)
  );

  const isImageMessage = !isAudioMessage && Boolean(
    messageMetadata?.type === 'image' ||
    messageMetadata?.media_type === 'image' ||
    (typeof messageMetadata?.mimetype === 'string' && messageMetadata.mimetype.startsWith('image/')) ||
    /\[(?:imagen|foto|comprobante|recibo)\]/i.test(messageContent) ||
    /comprobante\s*(?:spei|de pago)?/i.test(messageContent) ||
    /\.(?:png|jpe?g|webp)(?:\?|$)/i.test(messageContent)
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(conversation.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(conversation.id);
        }
      }}
      className={`chat-list-item pressable w-full text-left p-2.5 rounded-2xl border transition-all cursor-pointer select-none ${
        isActive
          ? 'active bg-periwinkle-tint/80 border-periwinkle-tint border-l-4 border-accent-jade border-l-periwinkle-ink shadow-xs'
          : isHumanMode
          ? 'bg-amber-50/80 hover:bg-amber-100/70 border-amber-300/80 shadow-2xs border-l-4 border-l-ochre'
          : 'bg-white/90 hover:bg-white border-white shadow-2xs border-l-4 border-l-transparent'
      } ${isClosed ? 'opacity-70' : ''}`}
    >
      <div className="flex items-start gap-2.5">
        {/* Avatar Monograma Cuadrado-Redondeado w-9 h-9 */}
        <div
          className={`w-9 h-9 rounded-xl font-extrabold text-xs flex items-center justify-center shrink-0 border border-white shadow-2xs ${
            isActive
              ? 'bg-periwinkle-tint text-periwinkle-ink'
              : isHumanMode
              ? 'bg-amber-100 text-amber-800'
              : 'bg-periwinkle-tint text-periwinkle-ink'
          }`}
        >
          {initials}
        </div>

        {/* Cuerpo Central */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1 mb-0.5">
            {/* Nombre y Badge de Orden */}
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-extrabold text-xs text-ink-primary truncate">
                {displayName}
              </span>
              {orderDetails.orderBadge && (
                <span
                  className={`font-mono text-[9px] font-bold px-1.5 py-0.5 rounded ${
                    isHumanMode
                      ? 'bg-amber-200/60 text-amber-900'
                      : 'bg-slate-100 text-ink-secondary'
                  }`}
                >
                  {orderDetails.orderBadge}
                </span>
              )}
            </div>

            {/* Timestamp Relativo en JetBrains Mono (font-mono) */}
            {lastMessageTime && (
              <span
                className={`font-mono text-[10px] shrink-0 ${
                  isHumanMode ? 'text-ochre font-bold' : 'text-ink-tertiary'
                }`}
              >
                {lastMessageTime}
              </span>
            )}
          </div>

          {/* Etapa de Cocina & Precio o Estado Handoff */}
          {isHumanMode ? (
            <div className="text-[10px] text-ochre font-extrabold flex items-center gap-1 mt-0.5">
              <span>Requiere Operador Humano</span>
            </div>
          ) : orderDetails.stage && orderDetails.total ? (
            <div className="text-[10px] text-jade font-bold flex items-center gap-1 mt-0.5">
              <span>{orderDetails.stage}</span>
              <span>•</span>
              <span>{orderDetails.total}</span>
            </div>
          ) : orderDetails.stage ? (
            <div className="text-[10px] text-jade font-bold flex items-center gap-1 mt-0.5">
              <span>{orderDetails.stage}</span>
            </div>
          ) : (
            <div className="text-[10px] text-ink-secondary font-medium mt-0.5">
              <span>Modo IA Activo</span>
            </div>
          )}

          {/* Snippet de Último Mensaje con Icono Contextual */}
          <div
            className={`text-[11px] truncate mt-1 pl-0.5 flex items-center gap-1 ${
              isHumanMode ? 'text-amber-900/90 font-medium' : 'text-ink-secondary'
            }`}
          >
            {isAudioMessage && (
              <Mic className="w-3 h-3 text-periwinkle-ink shrink-0" strokeWidth={1.5} />
            )}
            {isImageMessage && (
              <ImageIcon className="w-3 h-3 text-jade shrink-0" strokeWidth={1.5} />
            )}
            <span className="truncate">{previewText}</span>
          </div>

          {/* Badges Inferiores: Indicador de Modo e Indicador de Cierre */}
          <div className="flex items-center justify-between gap-1 mt-2">
            <div className="flex items-center gap-1.5">
              {conversation.mode === 'ai' ? (
                <span
                  title="Modo IA Activo"
                  className="inline-flex items-center gap-1 text-[10px] font-medium text-accent-jade bg-accent-jade-subtle px-1.5 py-0.5 rounded border border-accent-jade/30"
                >
                  <Bot className="w-3 h-3" strokeWidth={1.5} />
                  <span>IA</span>
                </span>
              ) : (
                <span
                  title="Requiere Operador Humano"
                  className="inline-flex items-center gap-1 text-[10px] font-medium text-alert-ochre bg-alert-ochre-subtle px-1.5 py-0.5 rounded border border-alert-ochre/30"
                >
                  <User className="w-3 h-3" strokeWidth={1.5} />
                  <span>Humano</span>
                </span>
              )}

              {isClosed && (
                <span
                  title="Conversación Cerrada"
                  className="inline-flex items-center gap-0.5 text-[10px] font-medium text-ink-tertiary bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200"
                >
                  <CheckCircle2 className="w-2.5 h-2.5" strokeWidth={1.5} />
                  <span>Cerrado</span>
                </span>
              )}
            </div>

            {/* Badge de Mensajes No Leídos */}
            {unreadCount > 0 && (
              <span
                className="font-mono text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-accent-jade text-white shadow-sm shrink-0"
                aria-label={`${unreadCount} mensajes no leídos`}
              >
                {unreadCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export const ChatItem = React.memo(ChatItemComponent);

