import React from 'react';
import { MessageSquareOff, MessageSquare, Search, RotateCcw } from 'lucide-react';

/**
 * Skeletons y Estados Vacíos para ChatAliado Live Chat.
 * 
 * Reglas de Diseño Liquid Glass & Dieter Rams:
 * - CERO EMOJIS en todos los textos e indicadores visuales.
 * - Iconografía exclusiva Lucide React con grosor de trazo uniforme de 1.5px.
 * - Skeletons fieles a la silueta de los componentes en lugar de spinners genéricos.
 */

/**
 * Skeleton para la bandeja lateral de conversaciones (ChatList).
 */
export function ChatListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="flex flex-col divide-y divide-border-whisper w-full" aria-label="Cargando conversaciones">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={`chat-skeleton-${idx}`}
          className="p-3.5 flex items-start gap-3 bg-surface-elevated/40 animate-pulse"
        >
          {/* Avatar circular */}
          <div className="w-10 h-10 rounded-full bg-slate-200/80 flex-shrink-0" />

          {/* Contenido central */}
          <div className="flex-1 min-w-0 space-y-2 pt-0.5">
            <div className="flex items-center justify-between gap-2">
              <div className="h-3.5 w-28 bg-slate-200/80 rounded" />
              <div className="h-3 w-10 bg-slate-200/60 rounded" />
            </div>
            <div className="h-3 w-4/5 bg-slate-100 rounded" />
          </div>

          {/* Indicador de modo */}
          <div className="w-4 h-4 rounded-full bg-slate-200/60 flex-shrink-0 mt-1" />
        </div>
      ))}
    </div>
  );
}

/**
 * Skeleton para el visor de mensajes activos (MessageList).
 */
export function MessageListSkeleton() {
  return (
    <div className="flex-1 p-4 space-y-4 overflow-hidden" aria-label="Cargando mensajes">
      {/* Separador de fecha simulado */}
      <div className="flex justify-center my-2">
        <div className="h-5 w-24 rounded-full bg-slate-100/90 border border-border-whisper animate-pulse" />
      </div>

      {/* Burbuja Comensal (Izquierda - Periwinkle) */}
      <div className="flex justify-start">
        <div className="w-3/5 max-w-md p-3.5 rounded-2xl rounded-tl-sm bg-periwinkle-tint/50 border border-border-whisper space-y-2 animate-pulse">
          <div className="h-3 w-3/4 bg-slate-300/40 rounded" />
          <div className="h-3 w-1/2 bg-slate-300/30 rounded" />
          <div className="h-2.5 w-12 bg-slate-300/40 rounded ml-auto" />
        </div>
      </div>

      {/* Burbuja Bot IA (Derecha - Blanco / Jade) */}
      <div className="flex justify-end">
        <div className="w-2/3 max-w-md p-3.5 rounded-2xl rounded-tr-sm bg-white/90 border border-accent-jade/20 shadow-sm space-y-2 animate-pulse">
          <div className="flex items-center gap-1.5 pb-1 border-b border-slate-100">
            <div className="w-3.5 h-3.5 rounded-full bg-accent-jade/30" />
            <div className="h-3 w-20 bg-slate-200 rounded" />
          </div>
          <div className="h-3 w-full bg-slate-200/80 rounded" />
          <div className="h-3 w-5/6 bg-slate-200/70 rounded" />
          <div className="h-2.5 w-10 bg-slate-200/60 rounded ml-auto" />
        </div>
      </div>

      {/* Burbuja Comensal corta */}
      <div className="flex justify-start">
        <div className="w-2/5 max-w-xs p-3 rounded-2xl rounded-tl-sm bg-periwinkle-tint/50 border border-border-whisper space-y-2 animate-pulse">
          <div className="h-3 w-4/5 bg-slate-300/40 rounded" />
          <div className="h-2.5 w-10 bg-slate-300/40 rounded ml-auto" />
        </div>
      </div>

      {/* Burbuja Operador Humano (Derecha - Blanco / Slate) */}
      <div className="flex justify-end">
        <div className="w-1/2 max-w-sm p-3.5 rounded-2xl rounded-tr-sm bg-white/90 border border-border-strong/40 shadow-sm space-y-2 animate-pulse">
          <div className="flex items-center gap-1.5 pb-1 border-b border-slate-100">
            <div className="w-3.5 h-3.5 rounded-full bg-slate-300" />
            <div className="h-3 w-24 bg-slate-200 rounded" />
          </div>
          <div className="h-3 w-3/4 bg-slate-200/80 rounded" />
          <div className="h-2.5 w-10 bg-slate-200/60 rounded ml-auto" />
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton para la ficha lateral de cliente (CustomerSidebar).
 */
export function CustomerSidebarSkeleton() {
  return (
    <div className="p-4 space-y-5 h-full overflow-hidden" aria-label="Cargando ficha del cliente">
      {/* Perfil del Cliente */}
      <div className="p-4 rounded-xl bg-surface-elevated/80 border border-border-whisper space-y-3 animate-pulse">
        <div className="w-12 h-12 rounded-full bg-slate-200 mx-auto" />
        <div className="h-4 w-32 bg-slate-200 rounded mx-auto" />
        <div className="h-3 w-24 bg-slate-100 rounded mx-auto" />
        <div className="h-2.5 w-28 bg-slate-100 rounded mx-auto" />
      </div>

      {/* 4 Bloques de Memoria */}
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div
            key={`memory-block-skeleton-${idx}`}
            className="p-3 rounded-xl bg-surface-elevated/70 border border-border-whisper space-y-2 animate-pulse"
          >
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-slate-200" />
              <div className="h-3 w-24 bg-slate-200 rounded" />
            </div>
            <div className="h-2.5 w-4/5 bg-slate-100 rounded" />
            <div className="h-2.5 w-3/5 bg-slate-100 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Estado vacío para cuando no hay conversaciones que coincidan con la búsqueda o filtro.
 */
export function EmptyChatListState({
  title = 'No se encontraron conversaciones',
  description = 'Ajusta los filtros o intenta con otro término de búsqueda.',
  searchQuery,
  onReset,
}: {
  title?: string;
  description?: string;
  searchQuery?: string;
  onReset?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center h-64 text-ink-secondary">
      <div className="w-12 h-12 rounded-2xl bg-surface-subtle border border-border-whisper flex items-center justify-center mb-3 shadow-inner-bevel">
        {searchQuery ? (
          <Search className="w-5 h-5 text-ink-tertiary" />
        ) : (
          <MessageSquareOff className="w-5 h-5 text-ink-tertiary" />
        )}
      </div>
      <h4 className="text-sm font-semibold text-ink-primary mb-1">{title}</h4>
      <p className="text-xs text-ink-secondary max-w-xs mb-4 leading-relaxed">{description}</p>
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          className="pressable inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-ink-primary bg-surface-elevated border border-border-whisper rounded-lg shadow-sm hover:bg-slate-50"
        >
          <RotateCcw className="w-3.5 h-3.5 text-ink-secondary" />
          Limpiar filtros
        </button>
      )}
    </div>
  );
}

/**
 * Estado vacío cuando no hay una conversación seleccionada en la columna central.
 */
export function EmptyChatDetailState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-surface-subtle/50">
      <div className="liquid-card p-8 rounded-2xl max-w-md w-full border border-border-whisper shadow-glass-subtle flex flex-col items-center">
        <div className="w-14 h-14 rounded-2xl bg-accent-jade-subtle border border-accent-jade/20 flex items-center justify-center mb-4">
          <MessageSquare className="w-6 h-6 text-accent-jade" />
        </div>
        <h3 className="text-base font-semibold text-ink-primary mb-2">
          Selecciona una conversación
        </h3>
        <p className="text-xs text-ink-secondary leading-relaxed max-w-xs">
          Elige un chat de la lista izquierda para revisar el diálogo, tomar el control manual o consultar la libreta de notas del comensal.
        </p>
      </div>
    </div>
  );
}
