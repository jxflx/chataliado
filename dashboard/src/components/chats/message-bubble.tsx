import React, { useState } from 'react';
import { Bot, User, Clock, Info, Play, Pause, Mic, Receipt } from 'lucide-react';
import { type Message } from '@/types/database';
import { parseWhatsAppMessage } from '@/lib/whatsapp/message-parser';

export interface MessageBubbleProps {
  message: Message;
  customerName?: string | null;
  className?: string;
}

/**
 * Formatea la hora de envío en formato HH:mm en JetBrains Mono (font-mono).
 */
function formatMessageTime(dateString?: string | null): string {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  } catch {
    return '';
  }
}

interface AudioData {
  isAudio: boolean;
  duration: string;
  transcription: string | null;
}

/**
 * Detecta y extrae información de notas de voz de WhatsApp.
 */
function getAudioData(message: Message): AudioData {
  const meta = (message.metadata || {}) as Record<string, unknown>;
  const content = message.content || '';

  const isAudio =
    meta.type === 'audio' ||
    meta.media_type === 'audio' ||
    Boolean(meta.audio_url) ||
    Boolean(meta.is_voice_note) ||
    content.startsWith('[Nota de voz]') ||
    content.startsWith('[Audio]');

  const duration =
    (typeof meta.duration === 'string' && meta.duration) ||
    '0:24';

  let transcription: string | null =
    (typeof meta.transcription === 'string' && meta.transcription) || null;

  if (!transcription && (content.startsWith('[Nota de voz]') || content.startsWith('[Audio]'))) {
    transcription = content.replace(/^\[(Nota de voz|Audio)\]\s*/i, '').trim() || null;
  }

  return { isAudio, duration, transcription };
}

interface OrderReceiptData {
  isReceipt: boolean;
  header: string;
  items: string[];
  total: string;
  introText?: string;
}

/**
 * Extrae datos para la tarjeta estructurada de Comanda / Resumen de Pedido.
 */
function getOrderReceiptData(message: Message): OrderReceiptData | null {
  const meta = (message.metadata || {}) as Record<string, unknown>;
  if (meta.order_receipt && typeof meta.order_receipt === 'object') {
    const r = meta.order_receipt as Record<string, unknown>;
    return {
      isReceipt: true,
      header: (r.header as string) || 'Comanda #11613 enviada a Cocina:',
      items: Array.isArray(r.items) ? (r.items as string[]) : [],
      total: (r.total as string) || 'Total: $330 MXN',
      introText: r.introText as string | undefined,
    };
  }

  const content = message.content || '';
  const hasOrderKeywords =
    (content.includes('Comanda #') || content.includes('resumen de tu orden') || content.includes('enviada a Cocina')) &&
    (content.includes('Total:') || content.includes('Total :'));

  if (!hasOrderKeywords) return null;

  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
  let header = 'Comanda #11613 enviada a Cocina:';
  const items: string[] = [];
  let total = 'Total: $330 MXN';
  const introParts: string[] = [];
  let parsingItems = false;

  for (const line of lines) {
    if (line.toLowerCase().includes('comanda #') || line.toLowerCase().includes('enviada a cocina')) {
      header = line.replace(/^\*+|\*+$/g, '');
      parsingItems = true;
    } else if (line.toLowerCase().startsWith('total:') || line.toLowerCase().startsWith('total :')) {
      total = line.replace(/^\*+|\*+$/g, '');
      parsingItems = false;
    } else if (parsingItems && (line.startsWith('•') || line.startsWith('-') || /^\d+x\s/i.test(line))) {
      items.push(line.replace(/^\*+|\*+$/g, ''));
    } else if (!parsingItems && !total) {
      introParts.push(line);
    }
  }

  if (items.length === 0 && !total) return null;

  return {
    isReceipt: true,
    header,
    items,
    total,
    introText: introParts.join(' ') || undefined,
  };
}

/**
 * Reproductor interactivo de Nota de Voz de WhatsApp con ondas estilizadas en CSS.
 */
function VoiceNotePlayer({ duration, transcription }: { duration: string; transcription: string | null }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const waveformBars = ['h-3', 'h-5', 'h-2', 'h-4', 'h-6', 'h-3', 'h-5', 'h-2'];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setIsPlaying(!isPlaying)}
          className="w-8 h-8 rounded-full bg-periwinkle-ink text-white flex items-center justify-center pressable shrink-0 shadow-2xs transition-transform active:scale-95"
          aria-label={isPlaying ? 'Pausar nota de voz' : 'Reproducir nota de voz'}
        >
          {isPlaying ? (
            <Pause className="w-4 h-4 fill-white" strokeWidth={1.5} />
          ) : (
            <Play className="w-4 h-4 fill-white translate-x-0.5" strokeWidth={1.5} />
          )}
        </button>
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-1 h-5">
            {waveformBars.map((barClass, idx) => (
              <span
                key={idx}
                className={`w-1 ${barClass} ${isPlaying ? 'bg-periwinkle-ink animate-pulse' : 'bg-periwinkle-ink/70'} rounded-full transition-all`}
              />
            ))}
          </div>
          <div className="flex justify-between text-[11px] font-mono text-ink-secondary">
            <span>{isPlaying ? '0:08' : '0:00'}</span>
            <span>{duration}</span>
          </div>
        </div>
      </div>

      {transcription && (
        <div className="mt-2 p-2 rounded-xl bg-white/70 border border-white text-[11px] text-ink-primary font-medium flex items-start gap-1.5">
          <Mic className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" strokeWidth={1.5} />
          <span className="italic leading-relaxed">
            {transcription.startsWith('Transcripción') ? transcription : `Transcripción: ${transcription}`}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Tarjeta de Resumen de Comanda itemizada con totales en Jade.
 */
function ComandaReceiptCard({ receipt }: { receipt: OrderReceiptData }) {
  return (
    <div className="mt-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono space-y-1.5">
      <div className="font-bold text-ink-primary flex items-center gap-1.5">
        <Receipt className="w-3.5 h-3.5 text-jade shrink-0" strokeWidth={1.5} />
        <span>{receipt.header}</span>
      </div>
      {receipt.items.map((item, idx) => (
        <div key={idx} className="text-ink-secondary pl-1">
          {item}
        </div>
      ))}
      <div className="font-bold text-jade pt-1.5 border-t border-slate-200">
        {receipt.total}
      </div>
    </div>
  );
}

/**
 * Burbuja de mensaje individual estilizada con la atmósfera Liquid Glass.
 * 
 * Reglas de diseño (kds-liquid-glass.html:697-766):
 * - Comensal (user): Izquierda, bg-periwinkle-tint/85, border-white/90, text-ink-primary.
 * - Bot IA (assistant): Derecha, bg-white/95, border-accent-jade/40, header ChatAliado con Lucide Bot.
 * - Operador (human_agent): Derecha, bg-slate-900, text-white, border-border-strong, header Operador (Tú) con Lucide User.
 * - Evento de Sistema / Herramientas (system/tool): Píldora centrada minimalista con Lucide Info.
 * - Timestamp en JetBrains Mono (font-mono).
 * - CERO EMOJIS en UI y código.
 */
export function MessageBubble({ message, customerName, className = '' }: MessageBubbleProps) {
  const role = message.role;
  const time = formatMessageTime(message.created_at);

  const isOptimistic = Boolean(
    typeof message.metadata === 'object' &&
      message.metadata !== null &&
      (message.metadata as { optimistic?: boolean }).optimistic
  );

  const audioData = getAudioData(message);
  const receiptData = role === 'assistant' ? getOrderReceiptData(message) : null;

  // 1. Mensajes de Sistema / Herramientas (centrados)
  if (role === 'system' || role === 'tool') {
    return (
      <div className={`flex justify-center my-2 w-full ${className}`}>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/80 border border-whisper text-ink-secondary text-[11px] shadow-2xs max-w-md text-center">
          <Info className="w-3.5 h-3.5 text-ink-tertiary flex-shrink-0" strokeWidth={1.5} />
          <span className="leading-snug">{message.content}</span>
          {time && <span className="font-mono text-[9px] text-ink-tertiary ml-1">({time})</span>}
        </div>
      </div>
    );
  }

  // 2. Mensaje del Comensal (WhatsApp / User) -> Izquierda, Periwinkle
  if (role === 'user') {
    return (
      <div className={`flex justify-start my-1.5 ${className}`}>
        <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-tl-xs p-3.5 bg-periwinkle-tint/85 border border-white/90 text-ink-primary shadow-2xs">
          {customerName && (
            <div className="text-[11px] font-bold text-periwinkle-ink pb-0.5 mb-1 border-b border-periwinkle-ink/15">
              {customerName}
            </div>
          )}

          {audioData.isAudio ? (
            <VoiceNotePlayer
              duration={audioData.duration}
              transcription={audioData.transcription}
            />
          ) : (
            <div className="text-xs leading-relaxed break-words select-text">
              {parseWhatsAppMessage(message.content)}
            </div>
          )}

          {time && (
            <div className="flex justify-end mt-1">
              <span className="font-mono text-[10px] text-ink-secondary">{time}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 3. Mensaje del Bot de IA (Assistant) -> Derecha, Blanco con acento Jade
  if (role === 'assistant') {
    return (
      <div className={`flex justify-end my-1.5 ${className}`}>
        <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-tr-xs p-3.5 bg-white/95 border border-accent-jade/40 text-ink-primary shadow-2xs ml-auto">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-accent-jade pb-1 mb-1 border-b border-slate-100">
            <Bot className="w-3.5 h-3.5 text-accent-jade shrink-0" strokeWidth={1.5} />
            <span>ChatAliado</span>
          </div>

          {receiptData ? (
            <div className="space-y-2">
              {receiptData.introText && (
                <div className="text-xs leading-relaxed break-words select-text">
                  {parseWhatsAppMessage(receiptData.introText)}
                </div>
              )}
              <ComandaReceiptCard receipt={receiptData} />
            </div>
          ) : (
            <div className="text-xs leading-relaxed break-words select-text">
              {parseWhatsAppMessage(message.content)}
            </div>
          )}

          {time && (
            <div className="flex justify-end mt-1">
              <span className="font-mono text-[10px] text-ink-tertiary">{time}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 4. Mensaje del Operador Humano (Human Agent) -> Derecha, Dark Slate con borde Slate
  return (
    <div className={`flex justify-end my-1.5 ${className}`}>
      <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-tr-xs p-3.5 bg-slate-900 text-white border border-border-strong shadow-2xs ml-auto">
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-300 pb-1 mb-1 border-b border-slate-800">
          <User className="w-3.5 h-3.5 text-slate-300 shrink-0" strokeWidth={1.5} />
          <span>Operador (Tú)</span>
        </div>
        <div className="text-xs leading-relaxed break-words select-text text-white">
          {parseWhatsAppMessage(message.content)}
        </div>
        <div className="flex items-center justify-end gap-1 mt-1">
          {isOptimistic && (
            <span
              title="Enviando a WhatsApp..."
              className="inline-flex items-center gap-0.5 text-[10px] font-mono text-slate-400"
            >
              <Clock className="w-2.5 h-2.5 animate-pulse" strokeWidth={1.5} />
              <span>Enviando...</span>
            </span>
          )}
          {time && <span className="font-mono text-[10px] text-slate-400">{time}</span>}
        </div>
      </div>
    </div>
  );
}
