import React, { useState } from 'react';
import {
  ArrowLeft,
  Bot,
  User,
  CheckCircle,
  RotateCcw,
  ExternalLink,
  MessageCircle,
  Flame,
  UserCheck,
} from 'lucide-react';
import { type EnrichedConversation } from '@/hooks/use-live-chat';
import {
  type ConversationMode,
  type ConversationStatus,
} from '@/types/database';
import { formatPhoneNumber } from './chat-item';

export interface ChatDetailHeaderProps {
  conversation: EnrichedConversation | null;
  isSidebarOpen?: boolean;
  onToggleMode: (newMode: ConversationMode) => Promise<void> | void;
  onToggleStatus: (newStatus: ConversationStatus) => Promise<void> | void;
  onToggleCustomerSidebar?: () => void;
  onToggleSidebar?: () => void;
  onBackToList?: () => void;
  className?: string;
}

/**
 * Extrae iniciales para el avatar de comensal.
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

interface CockpitOrderDetails {
  orderBadge: string;
  stageText: string;
  paidText: string;
  addressSummary: string;
  dishesSummary: string;
}

/**
 * Extrae metadatos para el Cockpit Superior de Orden Activa.
 */
function extractCockpitOrderDetails(conversation: EnrichedConversation): CockpitOrderDetails {
  const customOrder = (conversation as Record<string, unknown>).order as Record<string, unknown> | undefined;
  const activeOrder = (conversation as Record<string, unknown>).active_order as Record<string, unknown> | undefined;
  const order = customOrder || activeOrder;

  let orderBadge = '#11613';
  if (order?.order_number) {
    orderBadge = `#${order.order_number}`;
  } else if (order?.table_number) {
    orderBadge = `Mesa ${order.table_number}`;
  } else if (order?.id && typeof order.id === 'string') {
    orderBadge = `#${order.id.slice(0, 5)}`;
  } else if (conversation.customer?.notes_md) {
    const match = conversation.customer.notes_md.match(/#(\d{4,6})/);
    if (match?.[1]) {
      orderBadge = `#${match[1]}`;
    }
  }

  let stageText = 'En Horno (18:40m)';
  if (order?.stage && typeof order.stage === 'string') {
    stageText = order.stage;
  } else if (order?.status === 'preparing') {
    stageText = 'En Horno (18:40m)';
  } else if (order?.status === 'ready') {
    stageText = 'Listo para Despacho';
  } else if (order?.status === 'delivered') {
    stageText = 'Entregado';
  }

  let paidText = 'Pagado ($330)';
  if (order?.total !== undefined && order?.total !== null) {
    paidText = `Pagado ($${order.total})`;
  }

  let addressSummary = 'Av. Revolución 340, Depto 4B';
  const customerRecord = conversation.customer as Record<string, unknown> | null | undefined;
  if (customerRecord && typeof customerRecord.address_default === 'string' && customerRecord.address_default) {
    addressSummary = customerRecord.address_default;
  } else if (typeof order?.address === 'string' && order.address) {
    addressSummary = order.address;
  }

  let dishesSummary = '1x Pepperoni Fam, 2x Coca-Cola';
  if (typeof order?.dishes_summary === 'string' && order.dishes_summary) {
    dishesSummary = order.dishes_summary;
  } else if (typeof order?.items_summary === 'string' && order.items_summary) {
    dishesSummary = order.items_summary;
  }

  return { orderBadge, stageText, paidText, addressSummary, dishesSummary };
}

/**
 * Cockpit Superior de la Orden Activa (Top Order Bar) y Cabecera de Chat.
 * 
 * Basado fielmente en kds-liquid-glass.html:656-695:
 * - Contenedor flotante Liquid Glass (liquid-dock rounded-2xl border-white/95).
 * - Avatar de cliente w-10 h-10 rounded-2xl bg-periwinkle-tint.
 * - Identificadores #11613 en font-mono, stage pill En Horno con Lucide Flame, pago pill Pagado ($330).
 * - Resumen de domicilio y platillos en texto secundario.
 * - Conmutador táctil de Modo IA vs Humano con indicador visual pulsante.
 * - Botón de Ficha & Bloc con Lucide UserCheck.
 * - Enlace directo wa.me y controles de cerrar/reabrir ticket.
 * - CERO EMOJIS (iconos vectoriales Lucide React a 1.5px).
 */
export function ChatDetailHeader({
  conversation,
  isSidebarOpen = false,
  onToggleMode,
  onToggleStatus,
  onToggleCustomerSidebar,
  onToggleSidebar,
  onBackToList,
  className = '',
}: ChatDetailHeaderProps) {
  const [isUpdatingMode, setIsUpdatingMode] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const toggleSidebar = onToggleSidebar || onToggleCustomerSidebar;

  if (!conversation) return null;

  const customerName = conversation.customer?.name?.trim() || null;
  const customerPhone = conversation.customer?.phone || null;
  const cleanPhone = customerPhone ? customerPhone.replace(/\D/g, '') : null;
  const waUrl = cleanPhone ? `https://wa.me/${cleanPhone}` : null;
  const initials = getCustomerInitials(customerName, customerPhone);

  const mode = conversation.mode;
  const status = conversation.status;

  const { orderBadge, stageText, paidText, addressSummary, dishesSummary } =
    extractCockpitOrderDetails(conversation);

  const handleModeSwitch = async () => {
    if (isUpdatingMode) return;
    try {
      setIsUpdatingMode(true);
      const nextMode: ConversationMode = mode === 'ai' ? 'human' : 'ai';
      await onToggleMode(nextMode);
    } finally {
      setIsUpdatingMode(false);
    }
  };

  const handleStatusSwitch = async () => {
    if (isUpdatingStatus) return;
    try {
      setIsUpdatingStatus(true);
      const nextStatus: ConversationStatus = status === 'open' ? 'closed' : 'open';
      await onToggleStatus(nextStatus);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  return (
    <header
      className={`px-4 py-2.5 liquid-dock rounded-2xl flex items-center justify-between shrink-0 mb-2.5 shadow-2xs border border-white/95 select-none ${className}`}
    >
      {/* Sección Izquierda: Navegación móvil, Avatar e Información de Orden & Contacto */}
      <div className="flex items-center gap-3 min-w-0">
        {/* Botón Volver para vista móvil */}
        {onBackToList && (
          <button
            type="button"
            onClick={onBackToList}
            className="pressable md:hidden p-1.5 rounded-lg text-ink-secondary hover:text-ink-primary hover:bg-slate-100/80 transition-colors"
            aria-label="Volver a la lista de chats"
          >
            <ArrowLeft className="w-5 h-5" strokeWidth={1.5} />
          </button>
        )}

        {/* Avatar Monograma Cuadrado-Redondeado */}
        <div className="w-10 h-10 rounded-2xl bg-periwinkle-tint font-extrabold text-xs flex items-center justify-center text-periwinkle-ink shrink-0 shadow-2xs border border-white">
          {initials}
        </div>

        {/* Identidad y Resumen Operativo */}
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-extrabold text-sm text-ink-primary truncate max-w-[180px] sm:max-w-xs">
              {customerName || 'Comensal'}
            </h1>
            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-white/80 border border-whisper text-ink-secondary">
              {orderBadge}
            </span>
            <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100/80 border border-amber-300 text-amber-900 flex items-center gap-1">
              <Flame className="w-3 h-3 text-amber-600 shrink-0" strokeWidth={1.5} />
              <span>{stageText}</span>
            </span>
            <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100/80 border border-emerald-300 text-emerald-900">
              {paidText}
            </span>

            {/* Enlace directo a WhatsApp */}
            {waUrl && (
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Abrir conversación directa en WhatsApp Web / App"
                className="pressable inline-flex items-center gap-1 text-[11px] font-mono text-accent-jade hover:text-accent-jade-hover bg-accent-jade-subtle/70 px-1.5 py-0.5 rounded-md border border-accent-jade/20"
              >
                <MessageCircle className="w-3 h-3" strokeWidth={1.5} />
                <span className="hidden lg:inline">WhatsApp</span>
                <ExternalLink className="w-2.5 h-2.5" strokeWidth={1.5} />
              </a>
            )}
          </div>

          {/* Teléfono, Domicilio y Platillos */}
          <div className="text-[11px] text-ink-secondary flex items-center gap-2 sm:gap-3 mt-0.5 font-medium flex-wrap">
            {customerPhone && (
              <span className="font-mono">{formatPhoneNumber(customerPhone)}</span>
            )}
            <span className="text-border-strong">•</span>
            <span className="truncate max-w-[180px] sm:max-w-none">{addressSummary}</span>
            <span className="text-border-strong">•</span>
            <span className="truncate max-w-[200px] sm:max-w-none text-ink-primary font-semibold">{dishesSummary}</span>
          </div>
        </div>
      </div>

      {/* Sección Derecha: Acciones Rápidas del Cockpit */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Switch Táctil de Modo IA vs Humano */}
        <button
          type="button"
          onClick={handleModeSwitch}
          disabled={isUpdatingMode}
          title={
            mode === 'ai'
              ? 'Modo IA activo — Haz clic para tomar control manual'
              : 'Control Humano activo — Haz clic para devolver a IA'
          }
          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border font-bold text-xs pressable shadow-2xs transition-all ${
            mode === 'ai'
              ? 'bg-white hover:bg-slate-50 border-white/90 text-ink-primary'
              : 'bg-amber-50/90 hover:bg-amber-100/90 border-amber-300 text-amber-900'
          } ${isUpdatingMode ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {mode === 'ai' ? (
            <>
              <span className="w-2.5 h-2.5 rounded-full bg-jade ring-2 ring-emerald-200/60 animate-pulse shrink-0" />
              <Bot className="w-3.5 h-3.5 text-jade shrink-0" strokeWidth={1.5} />
              <span>Modo IA</span>
              <span className="text-ink-secondary text-[11px] font-medium hidden sm:inline">• Tomar Control</span>
            </>
          ) : (
            <>
              <span className="w-2.5 h-2.5 rounded-full bg-ochre ring-2 ring-amber-200/60 shrink-0" />
              <User className="w-3.5 h-3.5 text-ochre shrink-0" strokeWidth={1.5} />
              <span>Control Humano (Tú)</span>
              <span className="text-amber-800 text-[11px] font-medium hidden sm:inline">• Devolver a IA</span>
            </>
          )}
        </button>

        {/* Status Toggle: Cerrar / Reabrir Chat */}
        <button
          type="button"
          onClick={handleStatusSwitch}
          disabled={isUpdatingStatus}
          title={status === 'open' ? 'Cerrar conversación' : 'Reabrir conversación'}
          className={`pressable flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
            status === 'open'
              ? 'bg-white/80 hover:bg-white text-ink-secondary border-white/90 shadow-2xs hover:text-ink-primary'
              : 'bg-slate-100 text-ink-primary border-slate-300 hover:bg-slate-200 shadow-2xs'
          } ${isUpdatingStatus ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {status === 'open' ? (
            <>
              <CheckCircle className="w-3.5 h-3.5 text-ink-secondary shrink-0" strokeWidth={1.5} />
              <span className="hidden md:inline">Cerrar Chat</span>
            </>
          ) : (
            <>
              <RotateCcw className="w-3.5 h-3.5 text-ink-secondary shrink-0" strokeWidth={1.5} />
              <span className="hidden md:inline">Reabrir Chat</span>
            </>
          )}
        </button>

        {/* Botón Ficha & Bloc para abrir/cerrar drawer */}
        {toggleSidebar && (
          <button
            type="button"
            onClick={toggleSidebar}
            title={isSidebarOpen ? 'Ocultar Ficha & Bloc del Mesero' : 'Ver Ficha & Bloc del Mesero'}
            className={`pressable flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs border transition-all shadow-2xs ${
              isSidebarOpen
                ? 'bg-accent-jade-subtle text-accent-jade border-accent-jade/30'
                : 'bg-white/80 hover:bg-white border-white/90 text-ink-primary'
            }`}
            aria-label="Alternar ficha de cliente"
          >
            <UserCheck className="w-4 h-4 text-jade shrink-0" strokeWidth={1.5} />
            <span className="hidden sm:inline">Ficha & Bloc</span>
          </button>
        )}
      </div>
    </header>
  );
}
