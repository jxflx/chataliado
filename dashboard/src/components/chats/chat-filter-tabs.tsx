import React from 'react';
import { Inbox, MessageSquare, CheckCircle2, Bot, UserCheck } from 'lucide-react';
import { type StatusFilter, type ModeFilter } from '@/hooks/use-live-chat';

export type ChatFilterTab = 'all' | 'open' | 'closed' | 'ai' | 'human';

export interface ChatFilterTabsProps {
  activeTab?: ChatFilterTab;
  onTabChange?: (tab: ChatFilterTab) => void;
  // Compatibilidad directa con los estados de useLiveChat
  statusFilter?: StatusFilter;
  modeFilter?: ModeFilter;
  onStatusFilterChange?: (status: StatusFilter) => void;
  onModeFilterChange?: (mode: ModeFilter) => void;
  counts?: Partial<Record<ChatFilterTab, number>>;
  className?: string;
}

interface TabDefinition {
  id: ChatFilterTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TABS: TabDefinition[] = [
  { id: 'all', label: 'Todos', icon: Inbox },
  { id: 'open', label: 'Abiertos', icon: MessageSquare },
  { id: 'closed', label: 'Cerrados', icon: CheckCircle2 },
  { id: 'ai', label: 'IA Atendiendo', icon: Bot },
  { id: 'human', label: 'Requiere Humano', icon: UserCheck },
];

/**
 * Pestañas de filtrado para el monitor de chats.
 * 
 * Reglas de diseño:
 * - CERO EMOJIS (todos los indicadores son iconos vectoriales Lucide React de 1.5px).
 * - "Requiere Humano" se resalta con badge en Ámbar/Ochre (#E7B454 / bg-alert-ochre/15 text-alert-ochre).
 * - Tipografía Geist Mono para los contadores numéricos.
 */
export function ChatFilterTabs({
  activeTab,
  onTabChange,
  statusFilter,
  modeFilter,
  onStatusFilterChange,
  onModeFilterChange,
  counts,
  className = '',
}: ChatFilterTabsProps) {
  // Determinar la pestaña activa ya sea por activeTab explícito o deduciendo de (statusFilter, modeFilter)
  const currentTab: ChatFilterTab = React.useMemo(() => {
    if (activeTab) return activeTab;
    if (modeFilter === 'human') return 'human';
    if (modeFilter === 'ai') return 'ai';
    if (statusFilter === 'open') return 'open';
    if (statusFilter === 'closed') return 'closed';
    return 'all';
  }, [activeTab, statusFilter, modeFilter]);

  const handleSelect = (tab: ChatFilterTab) => {
    if (onTabChange) {
      onTabChange(tab);
    }

    // Sincronizar con useLiveChat si se proveyeron los callbacks individuales
    if (onStatusFilterChange && onModeFilterChange) {
      switch (tab) {
        case 'all':
          onStatusFilterChange('all');
          onModeFilterChange('all');
          break;
        case 'open':
          onStatusFilterChange('open');
          onModeFilterChange('all');
          break;
        case 'closed':
          onStatusFilterChange('closed');
          onModeFilterChange('all');
          break;
        case 'ai':
          onStatusFilterChange('all');
          onModeFilterChange('ai');
          break;
        case 'human':
          onStatusFilterChange('all');
          onModeFilterChange('human');
          break;
      }
    }
  };

  return (
    <div
      className={`flex items-center gap-1 p-1 bg-surface-subtle/90 rounded-xl border border-border-whisper overflow-x-auto scrollbar-none ${className}`}
      role="tablist"
      aria-label="Filtros de conversaciones"
    >
      {TABS.map((tab) => {
        const isActive = currentTab === tab.id;
        const Icon = tab.icon;
        const count = counts?.[tab.id];
        const isHumanTab = tab.id === 'human';

        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => handleSelect(tab.id)}
            className={`pressable flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              isActive
                ? 'bg-surface-elevated text-ink-primary shadow-sm border border-border-whisper/80'
                : 'text-ink-secondary hover:text-ink-primary hover:bg-white/60'
            }`}
          >
            <Icon
              className={`w-3.5 h-3.5 ${
                isHumanTab
                  ? 'text-alert-ochre'
                  : isActive
                  ? 'text-accent-jade'
                  : 'text-ink-tertiary'
              }`}
            />
            <span>{tab.label}</span>

            {/* Contador numérico */}
            {typeof count === 'number' && (
              <span
                className={`font-mono text-[10px] px-1.5 py-0.2 rounded-full border ${
                  isHumanTab
                    ? 'bg-alert-ochre/15 text-alert-ochre border-alert-ochre/30 font-semibold'
                    : isActive
                    ? 'bg-slate-100 text-ink-primary border-slate-200'
                    : 'bg-slate-200/50 text-ink-secondary border-transparent'
                }`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
