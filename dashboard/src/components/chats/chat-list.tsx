import React, { useMemo } from 'react';
import { Search, X, Volume2, VolumeX, AlertCircle, Bot, Receipt } from 'lucide-react';
import {
  type EnrichedConversation,
  type StatusFilter,
  type ModeFilter,
} from '@/hooks/use-live-chat';
import { type ChatFilterTab } from './chat-filter-tabs';
import { ChatItem } from './chat-item';
import { ChatListSkeleton, EmptyChatListState } from './chat-skeletons';

export interface ChatListProps {
  conversations: EnrichedConversation[];
  allConversations?: EnrichedConversation[];
  activeConversationId: string | null;
  searchQuery: string;
  statusFilter?: StatusFilter;
  modeFilter?: ModeFilter;
  activeTab?: ChatFilterTab;
  soundEnabled: boolean;
  loading: boolean;
  onSelectConversation: (conversationId: string) => void;
  onSearchChange: (query: string) => void;
  onStatusFilterChange?: (status: StatusFilter) => void;
  onModeFilterChange?: (mode: ModeFilter) => void;
  onTabChange?: (tab: ChatFilterTab) => void;
  onToggleSound: () => void;
  className?: string;
}

/**
 * Bandeja operativa de chats (Columna izquierda ~360px) en arquitectura Liquid Glass.
 * 
 * Reglas de diseño (R2, kds-liquid-glass.html:493-650):
 * - Mini KPI Ribbon de 3 tarjetas: Atención Requerida (Ámbar/Ochre), Con Bot IA (Jade), Con Pedido Activo (Azul).
 * - Buscador de vidrio redondeado con icono Lucide Search y botón de reset.
 * - Píldoras de filtrado ergonómicas: Todos, Handoff (resaltado en ámbar) y En Cocina.
 * - CERO EMOJIS (iconos vectoriales Lucide de 1.5px exclusivos).
 * - Control Web Audio procedural preservado.
 */
export function ChatList({
  conversations,
  allConversations,
  activeConversationId,
  searchQuery,
  statusFilter = 'all',
  modeFilter = 'all',
  activeTab = 'all',
  soundEnabled,
  loading,
  onSelectConversation,
  onSearchChange,
  onStatusFilterChange,
  onModeFilterChange,
  onTabChange,
  onToggleSound,
  className = '',
}: ChatListProps) {
  // Base para conteos globales
  const countSource = allConversations || conversations;

  const counts = useMemo(() => {
    return {
      all: countSource.length,
      open: countSource.filter((c) => c.status === 'open').length,
      closed: countSource.filter((c) => c.status === 'closed').length,
      ai: countSource.filter((c) => c.mode === 'ai').length,
      human: countSource.filter(
        (c) => c.mode === 'human' || Boolean((c as Record<string, unknown>).requires_human)
      ).length,
      orders: countSource.filter((c) => {
        const raw = c as Record<string, unknown>;
        if (raw.has_order !== undefined) return Boolean(raw.has_order);
        if (raw.active_order) return true;
        if (raw.order) {
          const st = (raw.order as Record<string, unknown>).status;
          return st !== 'delivered' && st !== 'cancelled';
        }
        if (c.customer?.notes_md && /#\d{4,6}/i.test(c.customer.notes_md) && c.status === 'open') {
          return true;
        }
        return c.status === 'open';
      }).length,
    };
  }, [countSource]);

  // Estados activos de filtros
  const isHandoffActive = modeFilter === 'human' || activeTab === 'human';
  const isCocinaActive =
    (statusFilter === 'open' && modeFilter !== 'human' && activeTab !== 'human') ||
    activeTab === 'open';
  const isAiActive = modeFilter === 'ai' || activeTab === 'ai';
  const isClosedActive = statusFilter === 'closed' || activeTab === 'closed';
  const isAllActive =
    (statusFilter === 'all' && modeFilter === 'all' && activeTab === 'all') ||
    (!isHandoffActive && !isCocinaActive && !isAiActive && !isClosedActive);

  const handleSelectFilter = (filterType: 'all' | 'handoff' | 'active' | 'bot' | 'closed') => {
    if (filterType === 'all') {
      onStatusFilterChange?.('all');
      onModeFilterChange?.('all');
      onTabChange?.('all');
    } else if (filterType === 'handoff') {
      if (isHandoffActive) {
        onModeFilterChange?.('all');
        onTabChange?.('all');
      } else {
        onModeFilterChange?.('human');
        onTabChange?.('human');
      }
    } else if (filterType === 'active') {
      if (isCocinaActive) {
        onStatusFilterChange?.('all');
        onTabChange?.('all');
      } else {
        onStatusFilterChange?.('open');
        onModeFilterChange?.('all');
        onTabChange?.('open');
      }
    } else if (filterType === 'bot') {
      if (isAiActive) {
        onModeFilterChange?.('all');
        onTabChange?.('all');
      } else {
        onModeFilterChange?.('ai');
        onTabChange?.('ai');
      }
    } else if (filterType === 'closed') {
      if (isClosedActive) {
        onStatusFilterChange?.('all');
        onTabChange?.('all');
      } else {
        onStatusFilterChange?.('closed');
        onTabChange?.('closed');
      }
    }
  };

  const handleResetFilters = () => {
    onSearchChange('');
    onTabChange?.('all');
    onStatusFilterChange?.('all');
    onModeFilterChange?.('all');
  };

  return (
    <aside
      className={`w-full md:w-[360px] flex-shrink-0 flex flex-col h-full liquid-dock rounded-3xl p-3.5 space-y-2.5 select-none overflow-hidden ${className}`}
      aria-label="Bandeja de conversaciones"
    >
      {/* Cabecera de la Bandeja */}
      <div className="flex items-center justify-between gap-3 px-0.5">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-extrabold text-ink-primary tracking-tight">
            Conversaciones
          </h2>
          <span className="font-mono text-[11px] font-bold text-ink-secondary bg-white/80 border border-white/90 px-2 py-0.5 rounded-full shadow-2xs">
            {conversations.length}
          </span>
        </div>

        {/* Botón de Sonido (Web Audio procedural) */}
        <button
          type="button"
          onClick={onToggleSound}
          title={soundEnabled ? 'Silenciar alertas sonoras' : 'Activar alertas sonoras'}
          className={`pressable p-1.5 rounded-xl border transition-all ${
            soundEnabled
              ? 'text-accent-jade bg-jade-subtle/80 border-emerald-300/40 hover:bg-jade-subtle shadow-2xs'
              : 'text-ink-tertiary bg-white/60 border-white/80 hover:text-ink-secondary shadow-2xs'
          }`}
          aria-label={soundEnabled ? 'Silenciar sonido' : 'Activar sonido'}
        >
          {soundEnabled ? (
            <Volume2 className="w-4 h-4" strokeWidth={1.5} />
          ) : (
            <VolumeX className="w-4 h-4" strokeWidth={1.5} />
          )}
        </button>
      </div>

      {/* 1. Mini KPI Ribbon (design-system-dashboard) */}
      <div className="grid grid-cols-3 gap-1.5 text-center">
        {/* Atención Requerida */}
        <button
          type="button"
          onClick={() => handleSelectFilter('handoff')}
          className={`p-2 rounded-xl border cursor-pointer transition-all flex flex-col items-center justify-center gap-1 ${
            isHandoffActive
              ? 'bg-amber-500/20 border-amber-400 shadow-xs'
              : 'bg-amber-500/10 hover:bg-amber-500/15 border-amber-300/40'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-ochre" strokeWidth={1.5} />
            <span className="font-mono font-extrabold text-base text-ochre">
              {counts.human}
            </span>
          </div>
          <div className="text-[9px] font-bold text-ink-secondary truncate">
            Atención Requerida
          </div>
        </button>

        {/* Con Bot IA */}
        <button
          type="button"
          onClick={() => handleSelectFilter('bot')}
          className={`p-2 rounded-xl border cursor-pointer transition-all flex flex-col items-center justify-center gap-1 ${
            isAiActive
              ? 'bg-emerald-100/70 border-emerald-400 shadow-xs'
              : 'bg-jade-subtle hover:bg-emerald-100/50 border-emerald-300/30'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <Bot className="w-3.5 h-3.5 text-jade" strokeWidth={1.5} />
            <span className="font-mono font-extrabold text-base text-jade">
              {counts.ai}
            </span>
          </div>
          <div className="text-[9px] font-bold text-ink-secondary truncate">
            Con Bot IA
          </div>
        </button>

        {/* Con Pedido Activo */}
        <button
          type="button"
          onClick={() => handleSelectFilter('active')}
          className={`p-2 rounded-xl border cursor-pointer transition-all flex flex-col items-center justify-center gap-1 ${
            isCocinaActive
              ? 'bg-blue-500/20 border-blue-400 shadow-xs'
              : 'bg-blue-500/10 hover:bg-blue-500/15 border-blue-300/30'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <Receipt className="w-3.5 h-3.5 text-periwinkle-ink" strokeWidth={1.5} />
            <span className="font-mono font-extrabold text-base text-blue-600">
              {counts.orders}
            </span>
          </div>
          <div className="text-[9px] font-bold text-ink-secondary truncate">
            Con Pedido Activo
          </div>
        </button>
      </div>

      {/* 2. Buscador & Filtros de Píldora */}
      <div className="space-y-1.5">
        {/* Buscador de vidrio redondeado */}
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 text-ink-tertiary absolute left-3 pointer-events-none" strokeWidth={1.5} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar cliente, teléfono o #orden..."
            className="w-full pl-8 pr-8 py-1.5 bg-white/80 border border-white/90 rounded-xl text-xs font-medium text-ink-primary focus:outline-none focus:ring-2 focus:ring-jade/40 shadow-2xs placeholder:text-ink-tertiary"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="pressable absolute right-2.5 p-0.5 text-ink-tertiary hover:text-ink-primary rounded"
              aria-label="Limpiar búsqueda"
            >
              <X className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          )}
        </div>

        {/* Píldoras de filtrado */}
        <div className="flex items-center gap-1 text-[10px] font-bold overflow-x-auto pb-0.5 scrollbar-none">
          <button
            type="button"
            onClick={() => handleSelectFilter('all')}
            className={`px-2.5 py-1 rounded-lg transition-all ${
              isAllActive
                ? 'bg-white text-ink-primary shadow-2xs font-extrabold border border-white/90'
                : 'text-ink-secondary hover:bg-white/60'
            }`}
          >
            Todos ({counts.all})
          </button>
          <button
            type="button"
            onClick={() => handleSelectFilter('handoff')}
            className={`px-2 py-1 rounded-lg transition-all ${
              isHandoffActive
                ? 'bg-amber-500/15 border border-amber-300/40 text-ochre font-extrabold shadow-2xs'
                : 'text-ochre hover:bg-white/60 font-bold'
            }`}
          >
            Handoff ({counts.human})
          </button>
          <button
            type="button"
            onClick={() => handleSelectFilter('active')}
            className={`px-2 py-1 rounded-lg transition-all ${
              isCocinaActive
                ? 'bg-white text-ink-primary shadow-2xs font-extrabold border border-white/90'
                : 'text-ink-secondary hover:bg-white/60'
            }`}
          >
            En Cocina ({counts.open})
          </button>
          {counts.closed > 0 && (
            <button
              type="button"
              onClick={() => handleSelectFilter('closed')}
              className={`px-2 py-1 rounded-lg transition-all ${
                isClosedActive
                  ? 'bg-white text-ink-primary shadow-2xs font-extrabold border border-white/90'
                  : 'text-ink-tertiary hover:bg-white/60'
              }`}
            >
              Cerrados ({counts.closed})
            </button>
          )}
        </div>
      </div>

      {/* 3. Lista de Conversaciones Ricas Scrolleable */}
      <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
        {loading && conversations.length === 0 ? (
          <ChatListSkeleton count={6} />
        ) : conversations.length === 0 ? (
          <EmptyChatListState
            searchQuery={searchQuery}
            onReset={handleResetFilters}
          />
        ) : (
          conversations.map((convo) => (
            <ChatItem
              key={convo.id}
              conversation={convo}
              isActive={convo.id === activeConversationId}
              onSelect={onSelectConversation}
            />
          ))
        )}
      </div>
    </aside>
  );
}
