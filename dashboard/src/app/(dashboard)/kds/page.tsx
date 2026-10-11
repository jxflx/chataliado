'use client';

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  Bike,
  Utensils,
  ShoppingBag,
  Clock,
  Check,
  RotateCcw,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  MessageCircle,
  AlertTriangle,
  X,
  Send,
  ArrowUpRight,
  Sun,
  AlertCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useTenant } from '@/components/layout/tenant-provider';
import { useKDSOrders, type KDSOrder } from '@/hooks/use-kds-orders';
import { useWakeLock } from '@/hooks/use-wake-lock';
import { soundAlerts } from '@/lib/audio/sound-alerts';
import { sendHumanMessage } from '@/app/(dashboard)/chats/actions';

export default function KDSPage() {
  const { activeRestaurant } = useTenant();

  // Control de alertas sonoras persistido en localStorage
  const [audioEnabled, setAudioEnabled] = useState<boolean>(() => soundAlerts.getSoundEnabled());

  // Hardware: Screen Wake Lock API con re-adquisición automática
  const wakeLock = useWakeLock({ enabled: true });

  // Hook reactivo de órdenes KDS en tiempo real con Supabase
  const {
    orders,
    filteredOrders,
    recallStack,
    loading,
    error,
    channelFilter,
    setChannelFilter,
    bumpOrder,
    recallLastOrder,
    toggleItemDone,
  } = useKDSOrders({
    restaurantId: activeRestaurant?.id,
    autoPlaySound: audioEnabled,
  });

  const [gridCols, setGridCols] = useState<4 | 5>(4);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [bumpingOrderIds, setBumpingOrderIds] = useState<Set<string>>(new Set());
  const [isRecalling, setIsRecalling] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'conflict' | 'info'; message: string } | null>(null);

  const feedbackTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showFeedback = useCallback(
    (fb: { type: 'error' | 'conflict' | 'info'; message: string }, durationMs = 5000) => {
      if (feedbackTimerRef.current) {
        clearTimeout(feedbackTimerRef.current);
      }
      setFeedback(fb);
      feedbackTimerRef.current = setTimeout(() => {
        setFeedback(null);
        feedbackTimerRef.current = null;
      }, durationMs);
    },
    []
  );

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) {
        clearTimeout(feedbackTimerRef.current);
      }
    };
  }, []);

  // Modal rápido de chat con el cliente
  const [activeChatOrder, setActiveChatOrder] = useState<KDSOrder | null>(null);
  const [chatMessageText, setChatMessageText] = useState('');
  const [isSendingChat, setIsSendingChat] = useState(false);

  // Despachar comanda (Bump) con manejo de colisiones concurrentes y Set de IDs
  const handleBump = useCallback(
    async (orderId: string) => {
      setBumpingOrderIds((prev) => new Set(prev).add(orderId));
      try {
        const res = await bumpOrder(orderId);
        if (!res.success) {
          showFeedback({
            type: res.conflict ? 'conflict' : 'error',
            message: res.error || 'Error al actualizar comanda',
          });
        }
      } finally {
        setBumpingOrderIds((prev) => {
          const next = new Set(prev);
          next.delete(orderId);
          return next;
        });
      }
    },
    [bumpOrder, showFeedback]
  );

  // Recuperar comanda despachada (Recall) con estado isRecalling
  const handleRecall = useCallback(async () => {
    if (isRecalling) return;
    setIsRecalling(true);
    try {
      const res = await recallLastOrder();
      if (!res.success) {
        showFeedback(
          {
            type: 'error',
            message: res.error || 'Error al revertir comanda',
          },
          4000
        );
      }
    } finally {
      setIsRecalling(false);
    }
  }, [recallLastOrder, isRecalling, showFeedback]);

  // Alternar sonido de comanda
  const toggleAudio = useCallback(() => {
    const next = !audioEnabled;
    soundAlerts.setSoundEnabled(next);
    setAudioEnabled(next);
  }, [audioEnabled]);

  // Pantalla completa
  const toggleFullScreen = useCallback(() => {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      void document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  }, []);

  // Envío de mensaje rápido de cocina al WhatsApp del cliente
  const handleSendChatMessage = useCallback(async () => {
    if (!chatMessageText.trim() || !activeChatOrder || !activeRestaurant?.id) return;

    if (!activeChatOrder.conversation_id) {
      setChatMessageText('');
      setActiveChatOrder(null);
      return;
    }

    try {
      setIsSendingChat(true);
      await sendHumanMessage({
        restaurantId: activeRestaurant.id,
        conversationId: activeChatOrder.conversation_id,
        phone: activeChatOrder.phone,
        content: chatMessageText.trim(),
      });
      setChatMessageText('');
      setActiveChatOrder(null);
    } catch {
      showFeedback(
        {
          type: 'error',
          message: 'No se pudo enviar el mensaje a WhatsApp',
        },
        4000
      );
    } finally {
      setIsSendingChat(false);
    }
  }, [chatMessageText, activeChatOrder, activeRestaurant]);

  // Cálculo en tiempo real de TOTALES ALL DAY (memoizado por estado de ítems pendientes)
  const itemsPendingHash = useMemo(() => {
    return orders
      .map(
        (o) =>
          o.id +
          ':' +
          o.items.map((i) => `${i.name}:${i.qty}:${i.done ? '1' : '0'}`).join(';')
      )
      .join('|');
  }, [orders]);

  const allDaySummary = useMemo(() => {
    const counts: Record<string, number> = {};
    orders.forEach((order) => {
      order.items.forEach((item) => {
        if (!item.done) {
          counts[item.name] = (counts[item.name] || 0) + item.qty;
        }
      });
    });
    return Object.entries(counts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsPendingHash]);

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-3 relative select-none">
      {/* BANNER DE RETROALIMENTACIÓN / CONFLICTOS CONCURRENTES */}
      {feedback && (
        <div
          className={`px-4 py-2 rounded-xl text-xs font-bold border flex items-center justify-between shadow-sm transition-all duration-200 animate-in fade-in slide-in-from-top-2 ${
            feedback.type === 'conflict'
              ? 'bg-amber-50 text-amber-900 border-amber-300'
              : 'bg-red-50 text-crimson border-red-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" strokeWidth={1.5} />
            <span>{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="p-1 hover:bg-black/5 rounded-lg pressable cursor-pointer"
          >
            <X className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        </div>
      )}

      {/* 1. BARRA OPERATIVA DE HERRAMIENTAS KDS */}
      <div className="h-12 px-4 liquid-dock rounded-2xl flex items-center justify-between shrink-0 border border-white/90 shadow-2xs">
        {/* Filtro Rápido por Canal */}
        <div className="flex items-center gap-1 bg-white/70 p-1 rounded-xl border border-white/90 text-xs">
          <button
            onClick={() => setChannelFilter('all')}
            className={`px-3 py-1 rounded-lg font-extrabold text-xs transition pressable ${
              channelFilter === 'all'
                ? 'bg-ink-primary text-white shadow-xs'
                : 'text-ink-secondary hover:text-ink-primary'
            }`}
          >
            Todos ({orders.length})
          </button>
          <button
            onClick={() => setChannelFilter('Domicilio')}
            title="A Domicilio"
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition pressable flex items-center gap-1.5 ${
              channelFilter === 'Domicilio'
                ? 'bg-ink-primary text-white shadow-xs'
                : 'text-ink-secondary hover:text-ink-primary'
            }`}
          >
            <Bike className="w-3.5 h-3.5" strokeWidth={1.5} />
            <span className="hidden sm:inline">Domicilio</span>
          </button>
          <button
            onClick={() => setChannelFilter('Mesa')}
            title="Comedor / Mesa"
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition pressable flex items-center gap-1.5 ${
              channelFilter === 'Mesa'
                ? 'bg-ink-primary text-white shadow-xs'
                : 'text-ink-secondary hover:text-ink-primary'
            }`}
          >
            <Utensils className="w-3.5 h-3.5" strokeWidth={1.5} />
            <span className="hidden sm:inline">Mesa</span>
          </button>
          <button
            onClick={() => setChannelFilter('Llevar')}
            title="Para Llevar"
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition pressable flex items-center gap-1.5 ${
              channelFilter === 'Llevar'
                ? 'bg-ink-primary text-white shadow-xs'
                : 'text-ink-secondary hover:text-ink-primary'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" strokeWidth={1.5} />
            <span className="hidden sm:inline">Llevar</span>
          </button>
        </div>

        {/* Densidad, Keep-Awake, Audio y Pantalla Completa */}
        <div className="flex items-center gap-2">
          {/* Selector de Densidad (4 vs 5 Columnas) */}
          <div className="flex items-center bg-white/70 p-0.5 rounded-xl border border-white/90 text-xs font-mono font-bold text-ink-secondary">
            <button
              onClick={() => setGridCols(4)}
              className={`px-2.5 py-1 rounded-lg transition pressable ${
                gridCols === 4
                  ? 'bg-white text-ink-primary shadow-xs font-extrabold'
                  : 'hover:text-ink-primary'
              }`}
            >
              4 cols
            </button>
            <button
              onClick={() => setGridCols(5)}
              className={`px-2.5 py-1 rounded-lg transition pressable ${
                gridCols === 5
                  ? 'bg-white text-ink-primary shadow-xs font-extrabold'
                  : 'hover:text-ink-primary'
              }`}
            >
              5 cols
            </button>
          </div>

          <div className="h-4 w-px bg-slate-200/80" />

          {/* Estado de Wake Lock (Keep-Awake de Pantalla) */}
          <button
            onClick={wakeLock.toggle}
            className={`p-1.5 rounded-xl border border-white/90 bg-white/80 hover:bg-white pressable shadow-2xs ${
              wakeLock.isActive ? 'text-amber-600' : 'text-ink-tertiary'
            }`}
            title={
              wakeLock.isActive
                ? 'Pantalla Activa (Keep-Awake habilitado)'
                : 'Keep-Awake inactivo (Clic para activar)'
            }
          >
            <Sun className="w-4 h-4" strokeWidth={1.5} />
          </button>

          {/* Alerta Sonora */}
          <button
            onClick={toggleAudio}
            className="p-1.5 rounded-xl border border-white/90 bg-white/80 hover:bg-white text-ink-secondary pressable shadow-2xs"
            title={audioEnabled ? 'Sonido de Comandas Activado' : 'Sonido Silenciado'}
          >
            {audioEnabled ? (
              <Volume2 className="w-4 h-4 text-jade" strokeWidth={1.5} />
            ) : (
              <VolumeX className="w-4 h-4 text-ink-tertiary" strokeWidth={1.5} />
            )}
          </button>

          {/* Pantalla Completa */}
          <button
            onClick={toggleFullScreen}
            className="p-1.5 rounded-xl border border-white/90 bg-white/80 hover:bg-white text-ink-secondary pressable shadow-2xs"
            title="Modo Pantalla Completa"
          >
            {isFullscreen ? (
              <Minimize className="w-4 h-4" strokeWidth={1.5} />
            ) : (
              <Maximize className="w-4 h-4" strokeWidth={1.5} />
            )}
          </button>
        </div>
      </div>

      {/* 2. CUADRÍCULA DE COMANDAS TOAST KDS */}
      <div className="flex-1 overflow-y-auto min-h-0 pr-1">
        {/* Estado de Carga Inicial */}
        {loading && orders.length === 0 && (
          <div
            className={`grid gap-3 ${
              gridCols === 5
                ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-5'
                : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4'
            }`}
          >
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="liquid-card rounded-2xl border border-white/95 p-4 h-64 animate-pulse flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="h-5 bg-slate-200/70 rounded-lg w-2/3" />
                  <div className="h-4 bg-slate-200/50 rounded-lg w-1/2" />
                  <div className="h-16 bg-slate-100/60 rounded-xl mt-4" />
                </div>
                <div className="h-8 bg-slate-200/60 rounded-xl" />
              </div>
            ))}
          </div>
        )}

        {/* Estado Vacío: Sin órdenes activas */}
        {!loading && filteredOrders.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center p-12 text-center">
            <div className="w-16 h-16 rounded-3xl bg-white/80 border border-white/90 shadow-xs flex items-center justify-center mb-4 text-ink-tertiary">
              <Utensils className="w-8 h-8" strokeWidth={1.5} />
            </div>
            <h3 className="text-base font-extrabold text-ink-primary mb-1">
              Sin comandas pendientes en cocina
            </h3>
            <p className="text-xs text-ink-secondary max-w-sm">
              Las órdenes confirmadas por WhatsApp aparecerán aquí en tiempo real de forma automática.
            </p>
          </div>
        )}

        {/* Cuadrícula de órdenes activas */}
        {filteredOrders.length > 0 && (
          <div
            className={`grid gap-3 ${
              gridCols === 5
                ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-5'
                : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4'
            }`}
          >
            {filteredOrders.map((order) => {
              const isUrgent = order.elapsedSeconds > 900; // > 15 min (Retraso Crítico)
              const isWarning = order.elapsedSeconds > 480 && !isUrgent; // > 8 min (Advertencia)

              let headerBg = 'bg-white/80 border-white/90';
              let timerColor = 'text-ink-secondary bg-white/90 border-slate-200/80';
              let borderCard = 'border-white/95';

              if (isUrgent) {
                headerBg = 'bg-red-50/90 border-red-200';
                timerColor = 'text-crimson bg-white font-extrabold border border-red-200';
                borderCard = 'border-red-300 ring-2 ring-red-300/60';
              } else if (isWarning) {
                headerBg = 'bg-amber-50/90 border-amber-200';
                timerColor = 'text-ochre bg-white font-extrabold border border-amber-200';
                borderCard = 'border-amber-300 ring-1 ring-amber-300/40';
              }

              const mins = Math.floor(order.elapsedSeconds / 60);
              const secs = (order.elapsedSeconds % 60).toString().padStart(2, '0');
              const timerText = `${mins}:${secs} min`;
              const isBumping = bumpingOrderIds.has(order.id);

              // Texto y acción del botón Bump según máquina de estados
              let bumpLabel = 'Despachar';
              if (order.status === 'confirmed') {
                bumpLabel = 'A Cocina';
              } else if (order.status === 'preparing') {
                bumpLabel = 'Listo';
              } else if (order.status === 'ready') {
                bumpLabel = 'Despachar';
              }

              return (
                <div
                  key={order.id}
                  className={`liquid-card rounded-2xl border ${borderCard} shadow-xs flex flex-col justify-between overflow-hidden text-xs relative select-none transition-all duration-150 ${
                    isBumping ? 'scale-[0.92] translate-y-2 opacity-60' : ''
                  }`}
                >
                  {/* 2A. CABECERA SEMAFÓRICA */}
                  <div>
                    <div className={`px-3 py-2 ${headerBg} border-b flex items-center justify-between`}>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-mono font-extrabold text-sm text-ink-primary shrink-0">
                          #{order.id.slice(-5)}
                        </span>
                        <span className="font-bold text-xs text-ink-primary truncate">
                          {order.name.split(' ')[0]}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span
                          className={`font-mono text-[11px] px-1.5 py-0.5 rounded-md ${timerColor} flex items-center gap-1 font-bold`}
                        >
                          <Clock className={`w-3 h-3 ${isUrgent ? 'animate-spin' : ''}`} strokeWidth={1.5} />
                          <span>{timerText}</span>
                        </span>
                      </div>
                    </div>

                    {/* 2B. SUB-BARRA DE CANAL, PAGO Y CHAT */}
                    <div className="px-3 py-1.5 bg-white/60 border-b border-white/80 flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="font-bold text-ink-primary">{order.channelBadge}</span>
                        {order.paid ? (
                          <span className="px-1.5 py-0.5 rounded font-bold text-[10px] bg-emerald-100 text-emerald-900 border border-emerald-200 font-mono">
                            PAGADO
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded font-bold text-[10px] bg-red-100 text-red-900 border border-red-200 font-mono">
                            COBRAR
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => setActiveChatOrder(order)}
                        className="px-2 py-0.5 rounded-lg bg-periwinkle-tint hover:bg-blue-200 text-periwinkle-ink font-bold text-[10px] pressable flex items-center gap-1 shrink-0 shadow-2xs border border-white cursor-pointer"
                        title="Ver conversación con el cliente"
                      >
                        <MessageCircle className="w-3 h-3" strokeWidth={1.5} />
                        <span>Chat</span>
                      </button>
                    </div>

                    {/* 2C. RENGLONES DE PLATILLOS INTERACTIVOS (item-done) */}
                    <div className="p-3 space-y-2 max-h-[220px] overflow-y-auto">
                      {order.items.map((item, itemIdx) => (
                        <div
                          key={item.id}
                          onClick={() => toggleItemDone(order.id, itemIdx)}
                          className={`item-row ${
                            item.done ? 'item-done' : ''
                          } p-1.5 rounded-xl hover:bg-white/70 border border-transparent hover:border-white/80 flex items-start gap-2 cursor-pointer`}
                        >
                          <span className="item-check w-4 h-4 rounded-md border border-slate-300/90 flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold">
                            {item.done && <Check className="w-2.5 h-2.5 text-white" strokeWidth={2} />}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="font-extrabold text-xs text-ink-primary flex justify-between leading-snug">
                              <span>
                                {item.qty}x {item.name}
                              </span>
                            </div>
                            {item.mod && (
                              <div className="text-[11px] text-ink-secondary font-medium break-words">
                                • {item.mod}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}

                      {order.notes && (
                        <div className="mt-1.5 p-2 rounded-xl bg-red-50/90 border border-red-200 text-crimson font-bold text-[11px] flex items-start gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" strokeWidth={1.5} />
                          <span className="break-words leading-tight">{order.notes}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 2D. PIE DE TARJETA: TOTAL Y BOTÓN BUMP (MÁQUINA DE ESTADOS) */}
                  <div className="p-2.5 bg-white/70 border-t border-white/80 flex items-center justify-between gap-2 shrink-0">
                    <span className="font-mono font-extrabold text-sm text-ink-primary pl-1">
                      {order.total}
                    </span>
                    <button
                      onClick={() => handleBump(order.id)}
                      disabled={isBumping}
                      className="py-1.5 px-3.5 rounded-xl bg-ink-primary hover:bg-slate-800 text-white font-bold text-xs tracking-tight flex items-center gap-1.5 pressable shadow-2xs cursor-pointer disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5 text-jade" strokeWidth={2} />
                      <span>{bumpLabel}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. BARRA INFERIOR FLOTANTE DE VIDRIO: ALL DAY TOTALS */}
      <footer className="h-14 px-5 liquid-dock rounded-3xl flex items-center justify-between shrink-0 shadow-xs select-none border border-white/90">
        <div className="flex items-center gap-3 overflow-x-auto py-1 text-xs min-w-0">
          <div className="flex items-center gap-1.5 font-extrabold text-ink-primary shrink-0 bg-white/95 px-3 py-1.5 rounded-xl border border-slate-200/90 shadow-2xs">
            <span className="tracking-wide">TOTALES ALL DAY:</span>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto">
            {allDaySummary.length === 0 ? (
              <span className="text-ink-tertiary italic text-xs font-medium">
                Sin platillos pendientes en cocina.
              </span>
            ) : (
              allDaySummary.slice(0, 8).map(([name, qty]) => (
                <div
                  key={name}
                  className="px-3 py-1.5 rounded-xl bg-white/95 border border-slate-300/90 font-mono flex items-center gap-2 whitespace-nowrap shadow-2xs"
                >
                  <span className="font-extrabold text-sm text-slate-950 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200">
                    {qty}
                  </span>
                  <span className="font-bold text-xs text-slate-900 tracking-tight">
                    {name}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Botón RECALL (Deshacer último despacho accidental) */}
        <div className="flex items-center gap-3 shrink-0 pl-3">
          <button
            onClick={handleRecall}
            disabled={recallStack.length === 0 || isRecalling}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition pressable ${
              recallStack.length > 0 && !isRecalling
                ? 'bg-periwinkle-tint hover:bg-blue-200 text-periwinkle-ink shadow-2xs border border-white cursor-pointer'
                : 'bg-white/60 text-ink-tertiary border border-white/80 opacity-40 cursor-not-allowed'
            }`}
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isRecalling ? 'animate-spin' : ''}`} strokeWidth={1.5} />
            <span>
              {isRecalling
                ? 'Revirtiendo...'
                : recallStack.length > 0
                ? `Deshacer #${recallStack[0]?.id.slice(-5)}`
                : 'Deshacer (Recall)'}
            </span>
          </button>
        </div>
      </footer>

      {/* 4. MODAL RÁPIDO: "VER CHAT DE LA COMANDA" */}
      {activeChatOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="liquid-panel w-full max-w-xl rounded-3xl border border-white shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Cabecera del Modal */}
            <div className="h-16 px-6 border-b border-white/80 flex items-center justify-between bg-white/80">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-periwinkle-tint font-extrabold text-sm flex items-center justify-center text-periwinkle-ink">
                  {(activeChatOrder.name.trim()
                    ? activeChatOrder.name
                        .split(' ')
                        .map((w) => w[0])
                        .filter(Boolean)
                        .slice(0, 2)
                        .join('')
                        .toUpperCase()
                    : 'WA') || 'WA'}
                </div>
                <div>
                  <div className="text-sm font-extrabold text-ink-primary flex items-center gap-2">
                    <span>{activeChatOrder.name}</span>
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-white border border-slate-200 text-ink-secondary">
                      #{activeChatOrder.id.slice(-5)}
                    </span>
                  </div>
                  <div className="text-xs font-mono text-ink-secondary">
                    {activeChatOrder.phone}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveChatOrder(null)}
                  className="p-2 rounded-xl text-ink-tertiary hover:text-ink-primary hover:bg-slate-200/50 pressable cursor-pointer"
                >
                  <X className="w-5 h-5" strokeWidth={1.5} />
                </button>
              </div>
            </div>

            {/* Resumen del Pedido */}
            <div className="p-6 overflow-y-auto max-h-[360px] space-y-3 bg-[#F8FAFC]/80 text-xs">
              <div className="bg-white/95 p-3 rounded-xl border border-slate-200 text-xs space-y-1 font-mono text-ink-secondary shadow-2xs">
                <div className="font-bold text-ink-primary">Detalle de Comanda:</div>
                <div className="text-[11px] text-ink-secondary pb-1">
                  Dirección / Entrega: <span className="font-bold text-ink-primary">{activeChatOrder.address}</span>
                </div>
                {activeChatOrder.items.map((i) => (
                  <div key={i.id} className="flex justify-between py-0.5">
                    <span>• {i.qty}x {i.name} {i.mod ? `(${i.mod})` : ''}</span>
                    <span className="text-ink-tertiary">{i.done ? 'Preparado' : 'Pendiente'}</span>
                  </div>
                ))}
                <div className="font-bold text-jade pt-1 border-t border-slate-100 flex justify-between">
                  <span>Total de la Orden:</span>
                  <span>{activeChatOrder.total} MXN ({activeChatOrder.paid ? 'Pagado' : 'Pendiente de cobro'})</span>
                </div>
              </div>

              {activeChatOrder.notes && (
                <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-950">
                  <span className="font-bold">Notas del Comensal:</span> {activeChatOrder.notes}
                </div>
              )}
            </div>

            {/* Pie del Modal con Enlace a Chats e Input */}
            <div className="p-4 bg-white/90 border-t border-white/90 flex items-center justify-between gap-3">
              <Link
                href="/chats"
                className="text-xs font-bold text-periwinkle-ink hover:underline flex items-center gap-1.5 pressable shrink-0"
              >
                <span>Ir al Monitor de Chats</span>
                <ArrowUpRight className="w-4 h-4" strokeWidth={1.5} />
              </Link>

              <div className="flex-1 flex gap-2">
                <input
                  type="text"
                  value={chatMessageText}
                  onChange={(e) => setChatMessageText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void handleSendChatMessage();
                    }
                  }}
                  disabled={isSendingChat}
                  placeholder="Escribir mensaje al WhatsApp del cliente..."
                  className="flex-1 px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-ink-primary focus:outline-none focus:ring-2 focus:ring-jade/40 shadow-2xs font-medium disabled:opacity-50"
                />
                <button
                  onClick={handleSendChatMessage}
                  disabled={isSendingChat || !chatMessageText.trim()}
                  className="px-4 py-2 bg-jade hover:bg-jade-hover text-white text-xs font-bold rounded-xl pressable flex items-center gap-1.5 shadow-2xs cursor-pointer shrink-0 disabled:opacity-50"
                >
                  <Send className="w-4 h-4" strokeWidth={1.5} />
                  <span>Enviar</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}