import React, { useState, useEffect } from 'react';
import {
  X,
  Pencil,
  Check,
  MapPin,
  AlertTriangle,
  Heart,
  Package,
  FileText,
  MessageCircle,
  ExternalLink,
  Calendar,
  AlertCircle,
  UserCheck,
  BookOpen,
} from 'lucide-react';
import { type Customer } from '@/types/database';
import { parseCustomerNotes } from './notes-parser';
import { formatPhoneNumber } from './chat-item';
import { CustomerSidebarSkeleton } from './chat-skeletons';

export interface CustomerSidebarProps {
  customer?: (Pick<Customer, 'id' | 'name' | 'phone' | 'notes_md'> & { created_at?: string }) | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateNotes: (notesMd: string) => Promise<{ success: boolean; error?: string }>;
  loading?: boolean;
  className?: string;
}

/**
 * Formatea la fecha de registro del cliente en font-mono.
 */
function formatRegistrationDate(dateString?: string | null): string {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

/**
 * Panel lateral derecho con ficha del cliente y Libreta del Mesero ("notes_md").
 * 
 * Reglas de diseño Liquid Glass & Dieter Rams:
 * - CERO EMOJIS (iconos vectoriales Lucide exclusivos de 1.5px: MapPin, AlertTriangle, Heart, Package).
 * - Visor estructurado de los 4 bloques de memoria del comensal.
 * - Editor in-place de notas Markdown con persistencia segura y actualización optimista.
 * - Tipografía JetBrains Mono / font-mono para teléfonos y fechas.
 */
export function CustomerSidebar({
  customer,
  isOpen,
  onClose,
  onUpdateNotes,
  loading = false,
  className = '',
}: CustomerSidebarProps) {
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [draftNotes, setDraftNotes] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Sincronizar el borrador cuando cambia el cliente activo
  useEffect(() => {
    setDraftNotes(customer?.notes_md || '');
    setIsEditing(false);
    setSaveError(null);
  }, [customer?.id, customer?.notes_md]);

  if (!isOpen) return null;

  const customerName = customer?.name?.trim() || null;
  const customerPhone = customer?.phone || null;
  const cleanPhone = customerPhone ? customerPhone.replace(/\D/g, '') : null;
  const waUrl = cleanPhone ? `https://wa.me/${cleanPhone}` : null;
  const regDate = formatRegistrationDate(customer?.created_at);

  const blocks = parseCustomerNotes(customer?.notes_md);
  const hasAnyStructuredBlock =
    Boolean(blocks.delivery) ||
    Boolean(blocks.allergies) ||
    Boolean(blocks.preferences) ||
    Boolean(blocks.lastOrder);

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setSaveError(null);

    try {
      const res = await onUpdateNotes(draftNotes);
      if (res.success) {
        setIsEditing(false);
      } else {
        setSaveError(res.error || 'No se pudieron guardar las notas.');
      }
    } catch (err: unknown) {
      setSaveError(
        err instanceof Error ? err.message : 'Error inesperado al guardar notas.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setDraftNotes(customer?.notes_md || '');
    setIsEditing(false);
    setSaveError(null);
  };

  return (
    <aside
      className={`w-full md:w-80 liquid-panel rounded-r-2xl border-l border-white/90 p-4 shadow-2xl flex flex-col justify-between overflow-y-auto ${className}`}
      aria-label="Ficha del cliente"
    >
      {/* Cabecera del Panel */}
      <div className="flex items-center justify-between pb-3 border-b border-white/80 shrink-0">
        <div className="font-extrabold text-xs text-ink-primary uppercase tracking-wider flex items-center gap-1.5">
          <UserCheck className="w-4 h-4 text-jade" strokeWidth={1.5} />
          <h2 className="text-xs font-extrabold text-ink-primary uppercase tracking-wider">
            Ficha del Cliente & Bloc
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg text-ink-tertiary hover:text-ink-primary pressable cursor-pointer transition-colors"
          aria-label="Cerrar ficha de cliente"
        >
          <X className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>

      {/* Contenido Scrolleable */}
      <div className="flex-1 overflow-y-auto space-y-4 py-3 scrollbar-thin">
        {loading ? (
          <CustomerSidebarSkeleton />
        ) : !customer ? (
          <div className="h-48 flex flex-col items-center justify-center text-center text-ink-secondary">
            <p className="text-xs">No hay cliente seleccionado.</p>
          </div>
        ) : (
          <>
            {/* 1. Tarjeta de Perfil */}
            <div className="liquid-card p-3.5 rounded-xl border border-white space-y-2.5 text-xs shadow-2xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-periwinkle-tint border border-white/90 flex items-center justify-center font-mono text-xs font-bold text-periwinkle-ink shadow-2xs shrink-0">
                  {customerName
                    ? customerName.slice(0, 2).toUpperCase()
                    : customerPhone?.slice(-2) || 'CL'}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-extrabold text-sm text-ink-primary truncate">
                    {customerName || 'Cliente sin nombre'}
                  </h3>
                  {customerPhone && (
                    <p className="font-mono text-ink-secondary text-[11px]">
                      {formatPhoneNumber(customerPhone)}
                    </p>
                  )}
                </div>
              </div>

              {/* Acciones y Metadatos del Perfil */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-ink-secondary">
                {regDate ? (
                  <div className="flex items-center gap-1 font-mono text-[10px]">
                    <Calendar className="w-3 h-3 text-ink-tertiary" strokeWidth={1.5} />
                    <span>Registrado: {regDate}</span>
                  </div>
                ) : (
                  <span />
                )}

                {waUrl && (
                  <a
                    href={waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pressable inline-flex items-center gap-1 text-jade hover:text-jade-hover font-semibold text-[11px]"
                  >
                    <MessageCircle className="w-3 h-3" strokeWidth={1.5} />
                    <span>WhatsApp</span>
                    <ExternalLink className="w-2.5 h-2.5" strokeWidth={1.5} />
                  </a>
                )}
              </div>
            </div>

            {/* 2. Sección "Libreta del Mesero" con 4 Bloques Estructurados */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="text-xs font-extrabold text-ink-primary flex items-center gap-1.5 uppercase tracking-wider">
                  <BookOpen className="w-3.5 h-3.5 text-jade" strokeWidth={1.5} />
                  <span>Libreta del Mesero</span>
                </div>

                {!isEditing && (
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="pressable inline-flex items-center gap-1 text-xs font-semibold text-jade hover:text-jade-hover cursor-pointer"
                  >
                    <Pencil className="w-3 h-3" strokeWidth={1.5} />
                    <span>Editar Notas</span>
                  </button>
                )}
              </div>

              {/* Mensaje de error al guardar */}
              {saveError && (
                <div className="flex items-center gap-1.5 p-2 rounded-xl bg-alert-crimson-subtle border border-alert-crimson/30 text-alert-crimson text-xs">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.5} />
                  <span className="flex-1">{saveError}</span>
                </div>
              )}

              {/* Modo Edición In-Place */}
              {isEditing ? (
                <div className="space-y-2">
                  <textarea
                    value={draftNotes}
                    onChange={(e) => setDraftNotes(e.target.value)}
                    disabled={isSaving}
                    rows={8}
                    maxLength={5000}
                    placeholder={`- Entrega: Calle Principal #123\n- Restricciones/Alergias: Sin cebolla\n- Preferencias Habituales: Pizza Margherita\n- Último Pedido Confirmado: Orden #102`}
                    className="w-full p-3 text-xs font-mono text-ink-primary bg-white/90 border border-white rounded-xl resize-y focus:outline-none focus:ring-2 focus:ring-jade/40 shadow-inner-bevel leading-relaxed scrollbar-thin"
                  />

                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] text-ink-tertiary">
                      {draftNotes.length} / 5000
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleCancel}
                        disabled={isSaving}
                        className="pressable px-2.5 py-1 text-xs font-medium text-ink-secondary hover:text-ink-primary bg-white border border-white/90 rounded-lg shadow-2xs cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSave()}
                        disabled={isSaving}
                        className="pressable inline-flex items-center gap-1 px-3 py-1 text-xs font-bold text-white bg-jade hover:bg-jade-hover rounded-lg shadow-2xs cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" strokeWidth={1.5} />
                        <span>{isSaving ? 'Guardando...' : 'Guardar'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Modo Lectura: 4 Bloques Estructurados con Iconos Vectoriales Sobrios */
                <div className="space-y-2">
                  {/* Bloque 1: Entrega */}
                  <div className="liquid-card p-3 rounded-xl border border-white space-y-1 text-xs shadow-2xs">
                    <div className="flex items-center gap-1.5 font-bold text-ink-primary">
                      <MapPin className="w-3.5 h-3.5 text-ink-secondary" strokeWidth={1.5} />
                      <span>Entrega</span>
                    </div>
                    <p className="text-xs text-ink-secondary leading-relaxed pl-5 font-mono">
                      {blocks.delivery || 'Sin dirección registrada'}
                    </p>
                  </div>

                  {/* Bloque 2: Restricciones / Alergias */}
                  <div className="liquid-card p-3 rounded-xl border border-white space-y-1 text-xs shadow-2xs">
                    <div className="flex items-center gap-1.5 font-bold text-ochre">
                      <AlertTriangle className="w-3.5 h-3.5 text-ochre" strokeWidth={1.5} />
                      <span>Restricciones / Alergias</span>
                    </div>
                    <p className="text-xs text-ink-secondary leading-relaxed pl-5 font-mono">
                      {blocks.allergies || 'Ninguna restricción registrada'}
                    </p>
                  </div>

                  {/* Bloque 3: Preferencias Habituales */}
                  <div className="liquid-card p-3 rounded-xl border border-white space-y-1 text-xs shadow-2xs">
                    <div className="flex items-center gap-1.5 font-bold text-jade">
                      <Heart className="w-3.5 h-3.5 text-jade" strokeWidth={1.5} />
                      <span>Preferencias Habituales</span>
                    </div>
                    <p className="text-xs text-ink-secondary leading-relaxed pl-5 font-mono">
                      {blocks.preferences || 'Sin preferencias registradas'}
                    </p>
                  </div>

                  {/* Bloque 4: Último Pedido Confirmado */}
                  <div className="liquid-card p-3 rounded-xl border border-white space-y-1 text-xs shadow-2xs">
                    <div className="flex items-center gap-1.5 font-bold text-ink-primary">
                      <Package className="w-3.5 h-3.5 text-ink-secondary" strokeWidth={1.5} />
                      <span>Último Pedido Confirmado</span>
                    </div>
                    <p className="text-xs text-ink-secondary leading-relaxed pl-5 font-mono">
                      {blocks.lastOrder || 'Sin pedidos confirmados'}
                    </p>
                  </div>

                  {/* Fallback para Notas Libres no estructuradas */}
                  {!hasAnyStructuredBlock && blocks.raw && (
                    <div className="liquid-card p-3 rounded-xl border border-white space-y-1 text-xs shadow-2xs">
                      <div className="flex items-center gap-1.5 font-bold text-ink-primary">
                        <FileText className="w-3.5 h-3.5 text-ink-secondary" strokeWidth={1.5} />
                        <span>Notas Generales</span>
                      </div>
                      <p className="text-xs text-ink-secondary leading-relaxed pl-5 whitespace-pre-wrap font-mono">
                        {blocks.raw}
                      </p>
                    </div>
                  )}

                  <p className="text-[10px] text-ink-tertiary italic pt-1">
                    El agente de IA consulta este bloc en Supabase antes de generar cada respuesta en WhatsApp.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Footer: Cerrar Ficha */}
      <div className="pt-3 border-t border-white/80 shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="pressable w-full py-2 bg-white hover:bg-slate-50 border border-white rounded-xl text-xs font-bold text-ink-secondary flex items-center justify-center gap-1.5 shadow-2xs transition-all cursor-pointer"
        >
          <X className="w-3.5 h-3.5" strokeWidth={1.5} />
          <span>Cerrar Ficha</span>
        </button>
      </div>
    </aside>
  );
}
