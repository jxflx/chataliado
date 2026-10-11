'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Check,
  AlertCircle,
  Loader2,
  Utensils,
  Edit2,
  Plus,
} from 'lucide-react';
import { createMenuItem, updateMenuItem } from '@/app/(dashboard)/menu/actions';
import { type MenuCategory, type MenuItem } from '@/types/database';
import {
  createMenuItemSchema,
  updateMenuItemSchema,
  type OptionGroup,
} from '@/schemas/menu';
import { OptionsSchemaBuilder } from './options-schema-builder';

export interface MenuItemFormProps {
  isOpen: boolean;
  onClose: () => void;
  restaurantId: string;
  categories: MenuCategory[];
  itemToEdit?: MenuItem | null;
  defaultCategoryId?: string | null;
  onSuccess?: (item: MenuItem) => void;
}

export function MenuItemForm({
  isOpen,
  onClose,
  restaurantId,
  categories,
  itemToEdit = null,
  defaultCategoryId = null,
  onSuccess,
}: MenuItemFormProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [isAvailable, setIsAvailable] = useState(true);
  const [optionsSchemaState, setOptionsSchemaState] = useState<OptionGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isEditing = !!itemToEdit;

  useEffect(() => {
    if (itemToEdit) {
      setName(itemToEdit.name);
      setDescription(itemToEdit.description || '');
      setPrice(itemToEdit.price.toString());
      setCategoryId(itemToEdit.category_id || '');
      setIsAvailable(itemToEdit.is_available);
      const opts = Array.isArray(itemToEdit.options_schema)
        ? (itemToEdit.options_schema as unknown as OptionGroup[])
        : [];
      setOptionsSchemaState(opts);
    } else {
      setName('');
      setDescription('');
      setPrice('');
      setCategoryId(defaultCategoryId || (categories[0]?.id ?? ''));
      setIsAvailable(true);
      setOptionsSchemaState([]);
    }
    setErrorMessage(null);
  }, [itemToEdit, defaultCategoryId, categories, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      setErrorMessage('Ingresa un precio válido (mayor o igual a 0)');
      return;
    }

    const payload = {
      name: name.trim(),
      description: description.trim(),
      price: parsedPrice,
      category_id: categoryId ? categoryId : null,
      is_available: isAvailable,
      options_schema: optionsSchemaState,
    };

    if (isEditing) {
      const parsed = updateMenuItemSchema.safeParse(payload);
      if (!parsed.success) {
        setErrorMessage(parsed.error.issues[0]?.message || 'Datos del platillo inválidos');
        return;
      }

      setLoading(true);
      const res = await updateMenuItem(restaurantId, itemToEdit.id, payload);
      setLoading(false);

      if (!res.success || !res.data) {
        setErrorMessage(res.error || 'No se pudo actualizar el platillo');
        return;
      }

      onSuccess?.(res.data);
      onClose();
    } else {
      const parsed = createMenuItemSchema.safeParse(payload);
      if (!parsed.success) {
        setErrorMessage(parsed.error.issues[0]?.message || 'Datos del platillo inválidos');
        return;
      }

      setLoading(true);
      const res = await createMenuItem(restaurantId, payload);
      setLoading(false);

      if (!res.success || !res.data) {
        setErrorMessage(res.error || 'No se pudo crear el platillo');
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
      aria-labelledby="menu-item-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/35 backdrop-blur-sm animate-in fade-in duration-150 overflow-y-auto"
    >
      <div className="liquid-card w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl p-6 shadow-glass-elevated border border-white/90 my-auto">
        {/* Cabecera del diálogo */}
        <div className="flex items-center justify-between pb-4 border-b border-border-whisper flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-jade-subtle text-jade flex items-center justify-center border border-jade/20">
              {isEditing ? <Edit2 className="w-4 h-4" /> : <Utensils className="w-4 h-4" />}
            </div>
            <div>
              <h2 id="menu-item-dialog-title" className="text-sm font-bold text-ink-primary tracking-tight">
                {isEditing ? 'Editar Platillo' : 'Nuevo Platillo'}
              </h2>
              <p className="text-[11px] text-ink-secondary">
                {isEditing
                  ? 'Modifica precios, disponibilidad o modificadores'
                  : 'Agrega un nuevo producto a tu menú interactivo'}
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
          <div className="mt-4 p-3 rounded-xl bg-alert-crimson-subtle border border-alert-crimson/20 flex items-center gap-2 text-xs text-alert-crimson font-medium flex-shrink-0">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Formulario scrolleable */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
          {/* Nombre y Precio */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1.5">
              <label htmlFor="dish-name" className="block text-xs font-bold text-ink-primary">
                Nombre del Platillo
              </label>
              <input
                id="dish-name"
                type="text"
                required
                maxLength={200}
                placeholder="ej. Pizza Margarita Artesanal"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
                className="w-full text-xs text-ink-primary bg-white/90 border border-border-whisper rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-1 focus:ring-jade placeholder:text-ink-tertiary shadow-2xs"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="dish-price" className="block text-xs font-bold text-ink-primary">
                Precio Base (MXN)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs font-mono font-bold text-ink-tertiary">
                  $
                </span>
                <input
                  id="dish-price"
                  type="number"
                  step="0.5"
                  min="0"
                  required
                  placeholder="180.00"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  disabled={loading}
                  className="w-full text-xs font-mono font-bold text-ink-primary bg-white/90 border border-border-whisper rounded-xl pl-7 pr-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-jade placeholder:text-ink-tertiary shadow-2xs"
                />
              </div>
            </div>
          </div>

          {/* Categoría y Disponibilidad */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="dish-category" className="block text-xs font-bold text-ink-primary">
                Categoría
              </label>
              <select
                id="dish-category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                disabled={loading}
                className="w-full text-xs font-semibold text-ink-primary bg-white/90 border border-border-whisper rounded-xl px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-jade shadow-2xs"
              >
                <option value="">Sin categoría asignada</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name} {!cat.is_active ? '(Inactiva)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-white/60 border border-border-whisper self-end">
              <div>
                <span className="text-xs font-bold text-ink-primary block">
                  Disponibilidad Inmediata
                </span>
                <span className="text-[11px] text-ink-secondary block">
                  {isAvailable ? 'Disponible para ordenar' : 'Agotado temporalmente'}
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isAvailable}
                  onChange={(e) => setIsAvailable(e.target.checked)}
                  disabled={loading}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-jade"></div>
              </label>
            </div>
          </div>

          {/* Descripción */}
          <div className="space-y-1.5">
            <label htmlFor="dish-description" className="block text-xs font-bold text-ink-primary">
              Descripción del Platillo
            </label>
            <textarea
              id="dish-description"
              rows={2}
              maxLength={1000}
              placeholder="Ingredientes principales, porción, maridaje sugerido..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={loading}
              className="w-full text-xs text-ink-primary bg-white/90 border border-border-whisper rounded-xl p-3 focus:outline-none focus:ring-1 focus:ring-jade placeholder:text-ink-tertiary shadow-2xs resize-none"
            />
          </div>

          {/* Constructor de modificadores & variantes */}
          <div className="pt-2 border-t border-border-whisper">
            <OptionsSchemaBuilder
              value={optionsSchemaState}
              onChange={setOptionsSchemaState}
              disabled={loading}
            />
          </div>

          {/* Botones de acción */}
          <div className="pt-4 border-t border-border-whisper flex items-center justify-end gap-2 flex-shrink-0">
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
              disabled={loading || !name.trim() || !price}
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
                  <span>{isEditing ? 'Guardar Cambios' : 'Crear Platillo'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
