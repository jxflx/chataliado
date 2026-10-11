import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, UserCheck, RotateCcw, AlertCircle, Paperclip } from 'lucide-react';
import { type ConversationMode, type ConversationStatus } from '@/types/database';

export interface MessageInputProps {
  mode: ConversationMode;
  status: ConversationStatus;
  disabled?: boolean;
  onSendMessage: (content: string) => Promise<{ success: boolean; error?: string }>;
  onTakeControl?: () => Promise<void> | void;
  onReopenChat?: () => Promise<void> | void;
  placeholder?: string;
  className?: string;
}

interface QuickReply {
  label: string;
  text: string;
}

const QUICK_REPLIES: QuickReply[] = [
  {
    label: '"Ya está en el horno"',
    text: '¡Hola! Tu pedido ya está en el horno en este momento.',
  },
  {
    label: '"Repartidor en camino (12 min)"',
    text: 'El repartidor ya va en camino (tiempo estimado: 12 min).',
  },
  {
    label: '"Lleva cambio de $170"',
    text: 'Pago en efectivo confirmado, el repartidor lleva cambio de $170.',
  },
];

/**
 * Área de entrada de mensajes para intervención humana en tiempo real.
 * 
 * Reglas de diseño & interacción:
 * - CERO EMOJIS (todos los indicadores son iconos vectoriales Lucide de 1.5px).
 * - Smart Copilot: carrusel horizontal de respuestas rápidas de 1 clic.
 * - Input de despacho con botón de adjunto (Paperclip) y botón táctil de envío en verde jade.
 * - Textarea autoajustable con Enter para enviar y Shift + Enter para saltos de línea.
 * - Banner preventivo cuando la conversación está en Modo IA con botón de 1-clic "Tomar Control".
 * - Botón de envío táctil con física de compresión (.pressable / active:scale-[0.98]).
 * - Despacho optimista y restitución del texto si falla la entrega.
 */
export function MessageInput({
  mode,
  status,
  disabled = false,
  onSendMessage,
  onTakeControl,
  onReopenChat,
  placeholder = 'Escribe un mensaje para el comensal... (Enter para enviar, Shift+Enter para salto de línea)',
  className = '',
}: MessageInputProps) {
  const [content, setContent] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-ajuste de altura del textarea
  const adjustHeight = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const newHeight = Math.min(Math.max(textarea.scrollHeight, 40), 140);
    textarea.style.height = `${newHeight}px`;
  };

  useEffect(() => {
    adjustHeight();
  }, [content]);

  // Manejo de envío
  const handleSend = async () => {
    const textToSend = content.trim();
    if (!textToSend || isSending || disabled) return;

    setIsSending(true);
    setErrorMessage(null);

    // Limpieza optimista del input
    const previousContent = content;
    setContent('');
    if (textareaRef.current) {
      textareaRef.current.style.height = '40px';
    }

    try {
      const result = await onSendMessage(textToSend);
      if (!result.success) {
        // En caso de fallo, restaurar el texto para que el usuario no pierda lo redactado
        setContent(previousContent);
        setErrorMessage(result.error || 'No se pudo entregar el mensaje a WhatsApp.');
      }
    } catch (err: unknown) {
      setContent(previousContent);
      setErrorMessage(
        err instanceof Error ? err.message : 'Error inesperado de red al enviar.'
      );
    } finally {
      setIsSending(false);
      // Re-enfocar el textarea para ergonomía continua
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleInsertQuickReply = (text: string) => {
    setContent(text);
    if (errorMessage) setErrorMessage(null);
    textareaRef.current?.focus();
  };

  // 1. Banner cuando la conversación está cerrada
  if (status === 'closed') {
    return (
      <div
        className={`p-4 border-t border-border-whisper bg-surface-subtle/80 flex items-center justify-between gap-3 ${className}`}
      >
        <div className="flex items-center gap-2 text-xs text-ink-secondary">
          <RotateCcw className="w-4 h-4 text-ink-tertiary" strokeWidth={1.5} />
          <span>Esta conversación se encuentra cerrada.</span>
        </div>
        {onReopenChat && (
          <button
            type="button"
            onClick={() => void onReopenChat()}
            className="pressable inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-white hover:bg-slate-50 text-ink-primary border border-white/90 shadow-2xs transition-all cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-jade" strokeWidth={1.5} />
            <span>Reabrir Conversación</span>
          </button>
        )}
      </div>
    );
  }

  // 2. Banner preventivo cuando la conversación está en Modo IA
  if (mode === 'ai') {
    return (
      <div
        className={`p-3.5 sm:p-4 border-t border-border-whisper bg-amber-500/10 backdrop-blur-md flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${className}`}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-300/30 flex items-center justify-center shrink-0 shadow-2xs">
            <Bot className="w-4 h-4 text-ochre" strokeWidth={1.5} />
          </div>
          <div>
            <h4 className="text-xs font-bold text-ink-primary">
              Modo IA Activo
            </h4>
            <p className="text-[11px] text-ink-secondary">
              El bot está atendiendo al comensal en WhatsApp. Toma el control para responder manualmente.
            </p>
          </div>
        </div>

        {onTakeControl && (
          <button
            type="button"
            onClick={() => void onTakeControl()}
            className="pressable inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-ochre hover:bg-ochre/90 text-white shadow-2xs transition-all shrink-0 cursor-pointer"
          >
            <UserCheck className="w-3.5 h-3.5" strokeWidth={1.5} />
            <span>Tomar Control</span>
          </button>
        )}
      </div>
    );
  }

  // 3. Área de Envío Manual (Modo Humano Activo)
  return (
    <div className={`p-3 sm:p-4 border-t border-white/90 bg-white/80 backdrop-blur-xl space-y-2 select-none ${className}`}>
      {/* Alerta de error si el envío previo falló */}
      {errorMessage && (
        <div className="flex items-center gap-1.5 p-2 rounded-xl bg-alert-crimson-subtle border border-alert-crimson/30 text-alert-crimson text-xs">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} />
          <span className="flex-1 truncate">{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-[10px] underline ml-1 cursor-pointer font-medium"
          >
            Descartar
          </button>
        </div>
      )}

      {/* 2C. BARRA DE RESPUESTAS RÁPIDAS DE 1 CLIC (SMART COPILOT) */}
      <div className="py-1.5 flex items-center gap-1.5 overflow-x-auto text-xs shrink-0 select-none scrollbar-none">
        <span className="font-mono text-[9px] font-bold text-ink-tertiary tracking-wider uppercase shrink-0 flex items-center gap-1">
          <span>RESPUESTAS RÁPIDAS:</span>
        </span>
        {QUICK_REPLIES.map((chip, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleInsertQuickReply(chip.text)}
            className="px-2.5 py-1 rounded-xl bg-white/80 hover:bg-white border border-white/90 text-ink-secondary hover:text-ink-primary font-medium text-[11px] pressable shadow-2xs shrink-0 cursor-pointer transition-all whitespace-nowrap"
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* 2D. INPUT DE ENTRADA CON ADJUNTO Y ENVÍO */}
      <div className="flex items-end gap-2 shrink-0 pt-0.5">
        <button
          type="button"
          title="Adjuntar foto de comprobante o menú"
          aria-label="Adjuntar foto de comprobante o menú"
          className="p-2.5 rounded-2xl bg-white/80 hover:bg-white border border-white text-ink-secondary hover:text-ink-primary pressable shadow-2xs shrink-0 transition-all cursor-pointer"
        >
          <Paperclip className="w-4 h-4" strokeWidth={1.5} />
        </button>

        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            if (errorMessage) setErrorMessage(null);
          }}
          onKeyDown={handleKeyDown}
          disabled={disabled || isSending}
          rows={1}
          placeholder={placeholder}
          className="flex-1 px-4 py-2.5 bg-white/90 border border-white rounded-2xl text-xs text-ink-primary focus:outline-none focus:ring-2 focus:ring-jade/40 shadow-2xs resize-none max-h-36 min-h-[42px] leading-relaxed scrollbar-thin transition-all"
        />

        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={!content.trim() || isSending || disabled}
          title="Enviar mensaje (Enter)"
          aria-label="Enviar mensaje"
          className={`px-5 py-2.5 bg-jade hover:bg-jade-hover text-white text-xs font-bold rounded-2xl pressable flex items-center gap-2 shadow-2xs shrink-0 transition-all ${
            content.trim() && !isSending && !disabled
              ? 'cursor-pointer'
              : 'opacity-60 cursor-not-allowed'
          }`}
        >
          <Send className="w-4 h-4" strokeWidth={1.5} />
          <span>Enviar</span>
        </button>
      </div>

      <div className="flex items-center justify-between text-[10px] text-ink-tertiary px-1 pt-1">
        <span>Modo Humano activo (El bot no responderá automáticamente)</span>
        <span className="hidden sm:inline font-mono">Shift+Enter para nueva línea</span>
      </div>
    </div>
  );
}
