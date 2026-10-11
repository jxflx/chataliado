'use client';

import React, { useState } from 'react';
import {
  Edit2,
  Trash2,
  Sliders,
  AlertCircle,
  Loader2,
  Check,
} from 'lucide-react';
import { toggleItemAvailability, deleteMenuItem } from '@/app/(dashboard)/menu/actions';
import { type MenuItem } from '@/types/database';
import { type OptionGroup } from '@/schemas/menu';

export interface MenuItemCardProps {
  item: MenuItem;
  restaurantId: string;
  categoryName?: string;
  onEdit: (item: MenuItem) => void;
  onDeleted: (itemId: string) => void;
  onAvailabilityToggled?: (updatedItem: MenuItem) => void;
}

export function MenuItemCard({
  item,
  restaurantId,
  categoryName,
  onEdit,
  onDeleted,
  onAvailabilityToggled,
}: MenuItemCardProps) {
  const [isAvailable, setIsAvailable] = useState<boolean>(item.is_available);
  const [isToggling, setIsToggling] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Contar grupos de modificadores
  const optionsGroups: OptionGroup[] = Array.isArray(item.options_schema)
    ? (item.options_schema as unknown as OptionGroup[])
    : [];
  const optionsCount = optionsGroups.length;

  const handleToggle = async () => {
    if (isToggling) return;
    const previous = isAvailable;
    setIsAvailable(!previous); // Optimistic UI
    setIsToggling(true);
    setErrorMessage(null);

    const res = await toggleItemAvailability(restaurantId, item.id);
    setIsToggling(false);

    if (!res.success || !res.data) {
      setIsAvailable(previous); // Revert
      setErrorMessage(res.error || 'No se pudo cambiar la disponibilidad');
    } else {
      setIsAvailable(res.data.is_available);
      onAvailabilityToggled?.(res.data);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    setErrorMessage(null);

    const res = await deleteMenuItem(restaurantId, item.id);
    setIsDeleting(false);

    if (!res.success) {
      setErrorMessage(res.error || 'No se pudo eliminar el platillo');
      setShowConfirmDelete(false);
    } else {
      onDeleted(item.id);
    }
  };

  return (
    <div
      className={`liquid-card rounded-2xl p-4 flex flex-col justify-between transition-all duration-200 ${
        !isAvailable ? 'opacity-70 bg-white/60' : 'hover:shadow-glass-elevated'
      }`}
    >
      <div className="space-y-2">
        {/* Cabecera de la tarjeta: Categoría y Disponibilidad Chip */}
        <div className="flex items-center justify-between gap-2">
          {categoryName ? (
            <span className="text-[10px] font-bold uppercase tracking-wider text-ink-secondary bg-surface-subtle px-2 py-0.5 rounded-md border border-border-whisper truncate max-w-[140px]">
              {categoryName}
            </span>
          ) : (
            <span className="text-[10px] text-ink-tertiary">Sin categoría</span>
          )}

          <button
            type="button"
            onClick={handleToggle}
            disabled={isToggling}
            title={isAvailable ? 'Marcar como agotado' : 'Marcar como disponible'}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold pressable transition-all border ${
              isAvailable
                ? 'bg-jade-subtle text-jade border-jade/30 hover:bg-jade-subtle/80'
                : 'bg-alert-ochre-subtle text-alert-ochre border-alert-ochre/30 hover:bg-alert-ochre-subtle/80'
            }`}
          >
            {isToggling ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isAvailable ? 'bg-jade' : 'bg-alert-ochre'
                }`}
              />
            )}
            <span>{isAvailable ? 'Disponible' : 'Agotado'}</span>
          </button>
        </div>

        {/* Nombre y Precio */}
        <div className="pt-1 flex items-start justify-between gap-2">
          <h3 className="text-xs font-bold text-ink-primary tracking-tight leading-snug">
            {item.name}
          </h3>
          <span className="text-xs font-mono font-bold text-ink-primary whitespace-nowrap bg-white/90 px-2 py-0.5 rounded-md border border-border-whisper shadow-2xs">
            {`$${Number(item.price).toFixed(2)}`}
          </span>
        </div>

        {/* Descripción */}
        {item.description ? (
          <p className="text-[11px] text-ink-secondary line-clamp-2 leading-relaxed">
            {item.description}
          </p>
        ) : (
          <p className="text-[11px] text-ink-tertiary italic">Sin descripción</p>
        )}

        {/* Modificadores summary */}
        {optionsCount > 0 && (
          <div className="pt-1 flex items-center gap-1 text-[11px] text-ink-secondary">
            <Sliders className="w-3 h-3 text-jade" />
            <span className="font-semibold">
              {`${optionsCount} ${optionsCount === 1 ? 'grupo de opción' : 'grupos de opciones'}`}
            </span>
            <span className="text-ink-tertiary text-[10px]">
              ({optionsGroups.map((g) => g.name).filter(Boolean).join(', ')})
            </span>
          </div>
        )}

        {/* Alerta de error si ocurrió */}
        {errorMessage && (
          <div className="p-2 rounded-lg bg-alert-crimson-subtle border border-alert-crimson/20 flex items-start gap-1.5 text-[11px] text-alert-crimson font-medium">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span className="leading-tight">{errorMessage}</span>
          </div>
        )}
      </div>

      {/* Pie de tarjeta: Confirmación de borrado o Botones de acción */}
      <div className="pt-3 mt-3 border-t border-border-whisper flex items-center justify-between">
        {showConfirmDelete ? (
          <div className="w-full flex items-center justify-between gap-2 p-1.5 rounded-xl bg-alert-crimson-subtle/50 border border-alert-crimson/30">
            <span className="text-[10px] font-bold text-alert-crimson">
              ¿Eliminar platillo?
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowConfirmDelete(false)}
                disabled={isDeleting}
                className="text-[10px] font-semibold text-ink-secondary hover:text-ink-primary px-2 py-0.5 rounded bg-white border border-border-whisper"
              >
                No
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="text-[10px] font-bold text-white bg-alert-crimson hover:bg-alert-crimson/90 px-2.5 py-0.5 rounded flex items-center gap-1"
              >
                {isDeleting ? (
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                ) : (
                  <Check className="w-2.5 h-2.5" />
                )}
                <span>Sí, borrar</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            <span className="text-[10px] font-mono text-ink-tertiary">
              ID: {item.id.slice(0, 8)}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onEdit(item)}
                className="flex items-center gap-1 text-[11px] font-semibold text-ink-secondary hover:text-ink-primary px-2.5 py-1 rounded-lg bg-white/70 hover:bg-white border border-border-whisper pressable shadow-2xs"
              >
                <Edit2 className="w-3 h-3" />
                <span>Editar</span>
              </button>
              <button
                type="button"
                onClick={() => setShowConfirmDelete(true)}
                className="text-ink-tertiary hover:text-alert-crimson p-1.5 rounded-lg hover:bg-alert-crimson-subtle border border-transparent hover:border-alert-crimson/20 pressable"
                title="Eliminar platillo"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
