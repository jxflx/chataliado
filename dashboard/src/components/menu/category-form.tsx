'use client';

import React, { useState, useEffect } from 'react';
import { X, Check, AlertCircle, Loader2, FolderPlus, Edit2 } from 'lucide-react';
import { createCategory, updateCategory } from '@/app/(dashboard)/menu/actions';
import { type MenuCategory } from '@/types/database';
import { createCategorySchema, updateCategorySchema } from '@/schemas/menu';

export interface CategoryFormProps {
  isOpen: boolean;
  onClose: () => void;
  restaurantId: string;
  categoryToEdit?: MenuCategory | null;
  onSuccess?: (category: MenuCategory) => void;
}

export function CategoryForm({
  isOpen,
  onClose,
  restaurantId,
  categoryToEdit = null,
  onSuccess,
}: CategoryFormProps) {
  const [name, setName] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isEditing = !!categoryToEdit;

  useEffect(() => {
    if (categoryToEdit) {
      setName(categoryToEdit.name);
      setIsActive(categoryToEdit.is_active);
    } else {
      setName('');
      setIsActive(true);
    }
    setErrorMessage(null);
  }, [categoryToEdit, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedName = name.trim();

    if (isEditing) {
      const parsed = updateCategorySchema.safeParse({
        name: trimmedName,
        is_active: isActive,
      });
      if (!parsed.success) {
        setErrorMessage(parsed.error.issues[0]?.message || 'Datos de categoría inválidos');
        return;
      }

      setLoading(true);
      const res = await updateCategory(restaurantId, categoryToEdit.id, {
        name: trimmedName,
        is_active: isActive,
      });
      setLoading(false);

      if (!res.success || !res.data) {
        setErrorMessage(res.error || 'No se pudo actualizar la categoría');
        return;
      }

      onSuccess?.(res.data);
      onClose();
    } else {
      const parsed = createCategorySchema.safeParse({
        name: trimmedName,
        is_active: isActive,
      });
      if (!parsed.success) {
        setErrorMessage(parsed.error.issues[0]?.message || 'Datos de categoría inválidos');
        return;
      }

      setLoading(true);
      const res = await createCategory(restaurantId, trimmedName);
      setLoading(false);

      if (!res.success || !res.data) {
        setErrorMessage(res.error || 'No se pudo crear la categoría');
        return;
      }

      onSuccess?.(res.data);
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="category-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-sm animate-in fade-in duration-150"
    >
      <div className="liquid-card w-full max-w-md rounded-3xl p-6 shadow-glass-elevated border border-white/90 space-y-5">
        {/* Cabecera del diálogo */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-jade-subtle text-jade flex items-center justify-center border border-jade/20">
              {isEditing ? <Edit2 className="w-4 h-4" /> : <FolderPlus className="w-4 h-4" />}
            </div>
            <div>
              <h2 id="category-dialog-title" className="text-sm font-bold text-ink-primary tracking-tight">
                {isEditing ? 'Editar Categoría' : 'Nueva Categoría'}
              </h2>
              <p className="text-[11px] text-ink-secondary">
                {isEditing
                  ? 'Modifica el nombre o estado de la categoría'
                  : 'Organiza tus platillos en secciones del menú'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="text-ink-tertiary hover:text-ink-primary p-1.5 rounded-lg pressable"
            aria-label="Cerrar modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mensaje de error */}
        {errorMessage && (
          <div className="p-3 rounded-xl bg-alert-crimson-subtle border border-alert-crimson/20 flex items-center gap-2 text-xs text-alert-crimson font-medium">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="category-name" className="block text-xs font-bold text-ink-primary">
              Nombre de la Categoría
            </label>
            <input
              id="category-name"
              type="text"
              required
              maxLength={100}
              placeholder="ej. Pizzas Clásicas, Bebidas, Postres"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
              className="w-full text-xs text-ink-primary bg-white/90 border border-border-whisper rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-1 focus:ring-jade placeholder:text-ink-tertiary shadow-2xs"
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-white/60 border border-border-whisper">
            <div>
              <span className="text-xs font-bold text-ink-primary block">
                Estado Activo
              </span>
              <span className="text-[11px] text-ink-secondary block">
                Visible para clientes y el bot de WhatsApp
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                disabled={loading}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-jade"></div>
            </label>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold text-ink-secondary hover:text-ink-primary bg-white/70 hover:bg-white border border-border-whisper rounded-xl pressable"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-xl pressable shadow-2xs"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>{isEditing ? 'Guardar Cambios' : 'Crear Categoría'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
