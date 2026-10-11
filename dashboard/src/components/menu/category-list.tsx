'use client';

import React, { useState } from 'react';
import {
  GripVertical,
  Plus,
  Edit2,
  Trash2,
  Check,
  X,
  Layers,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import {
  reorderCategories,
  updateCategory,
  deleteCategory,
} from '@/app/(dashboard)/menu/actions';
import { type MenuCategory, type MenuItem } from '@/types/database';

export interface CategoryListProps {
  categories: MenuCategory[];
  items: MenuItem[];
  restaurantId: string;
  selectedCategoryId: string | null;
  onSelectCategory: (id: string | null) => void;
  onCategoriesChanged: (categories: MenuCategory[]) => void;
  onOpenCreate: () => void;
}

export function CategoryList({
  categories,
  items,
  restaurantId,
  selectedCategoryId,
  onSelectCategory,
  onCategoriesChanged,
  onOpenCreate,
}: CategoryListProps) {
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Mapear conteo de platillos por categoría
  const countByCategory = React.useMemo(() => {
    const map: Record<string, number> = {};
    items.forEach((item) => {
      if (item.category_id) {
        map[item.category_id] = (map[item.category_id] || 0) + 1;
      }
    });
    return map;
  }, [items]);

  // Total de platillos
  const totalDishes = items.length;

  // Manejo de Drag and Drop Nativo HTML5 (Cero dependencias externas)
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    setDraggedIdx(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIdx !== index) {
      setDragOverIdx(index);
    }
  };

  const handleDragEnd = () => {
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>, dropIndex: number) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === dropIndex) {
      setDraggedIdx(null);
      setDragOverIdx(null);
      return;
    }

    const reordered = [...categories];
    const [movedItem] = reordered.splice(draggedIdx, 1);
    if (!movedItem) return;
    reordered.splice(dropIndex, 0, movedItem);

    // Actualización optimista inmediata
    onCategoriesChanged(reordered);
    setDraggedIdx(null);
    setDragOverIdx(null);

    // Persistir orden en servidor
    const orderedIds = reordered.map((cat) => cat.id);
    const res = await reorderCategories(restaurantId, orderedIds);
    if (!res.success) {
      setErrorMessage(res.error || 'No se pudo guardar el nuevo orden');
      // Revertir
      onCategoriesChanged(categories);
    }
  };

  // Edición rápida en línea
  const handleStartEditing = (cat: MenuCategory) => {
    setEditingId(cat.id);
    setEditingName(cat.name);
    setErrorMessage(null);
  };

  const handleCancelEditing = () => {
    setEditingId(null);
    setEditingName('');
  };

  const handleSaveInline = async (categoryId: string) => {
    const trimmed = editingName.trim();
    if (!trimmed) {
      setErrorMessage('El nombre no puede estar vacío');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    const res = await updateCategory(restaurantId, categoryId, { name: trimmed });
    setIsSaving(false);

    if (!res.success || !res.data) {
      setErrorMessage(res.error || 'No se pudo actualizar la categoría');
      return;
    }

    const updated = categories.map((c) => (c.id === categoryId ? res.data! : c));
    onCategoriesChanged(updated);
    setEditingId(null);
  };

  // Toggle Activo / Inactivo
  const handleToggleActive = async (e: React.MouseEvent, cat: MenuCategory) => {
    e.stopPropagation();
    setIsSaving(true);
    setErrorMessage(null);

    const res = await updateCategory(restaurantId, cat.id, { is_active: !cat.is_active });
    setIsSaving(false);

    if (!res.success || !res.data) {
      setErrorMessage(res.error || 'No se pudo cambiar el estado de la categoría');
      return;
    }

    const updated = categories.map((c) => (c.id === cat.id ? res.data! : c));
    onCategoriesChanged(updated);
  };

  // Eliminación con confirmación y manejo de error amigable
  const handleDeleteCategory = async (e: React.MouseEvent, categoryId: string) => {
    e.stopPropagation();
    setIsSaving(true);
    setErrorMessage(null);

    const res = await deleteCategory(restaurantId, categoryId);
    setIsSaving(false);
    setDeletingId(null);

    if (!res.success) {
      setErrorMessage(res.error || 'No se pudo eliminar la categoría');
      return;
    }

    const updated = categories.filter((c) => c.id !== categoryId);
    onCategoriesChanged(updated);
    if (selectedCategoryId === categoryId) {
      onSelectCategory(null);
    }
  };

  return (
    <div className="space-y-3">
      {/* Encabezado del panel de categorías */}
      <div className="flex items-center justify-between pb-1">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-jade" />
          <h2 className="text-xs font-bold text-ink-primary uppercase tracking-wider">
            Categorías ({categories.length})
          </h2>
        </div>
        <button
          type="button"
          onClick={onOpenCreate}
          className="flex items-center gap-1 text-[11px] font-bold text-jade hover:text-jade-hover bg-jade-subtle hover:bg-jade-subtle/80 px-2.5 py-1 rounded-lg pressable shadow-2xs"
        >
          <Plus className="w-3 h-3" />
          <span>Nueva</span>
        </button>
      </div>

      {/* Alerta de error inline */}
      {errorMessage && (
        <div className="p-2.5 rounded-xl bg-alert-crimson-subtle border border-alert-crimson/30 flex items-start gap-2 text-xs text-alert-crimson font-medium">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-[11px] leading-tight">{errorMessage}</div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-alert-crimson/70 hover:text-alert-crimson"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Píldora para "Todos los Platillos" */}
      <div
        onClick={() => onSelectCategory(null)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onSelectCategory(null)}
        className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer pressable transition-all border ${
          selectedCategoryId === null
            ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
            : 'bg-white/80 hover:bg-white text-ink-primary border-border-whisper'
        }`}
      >
        <div className="flex items-center gap-2 truncate">
          <span className="text-xs font-bold tracking-tight truncate">
            Todos los Platillos
          </span>
        </div>
        <span
          className={`text-xs font-mono font-bold px-2 py-0.5 rounded-md ${
            selectedCategoryId === null
              ? 'bg-white/20 text-white'
              : 'bg-surface-subtle text-ink-secondary border border-border-whisper'
          }`}
        >
          {totalDishes}
        </span>
      </div>

      {/* Lista de Categorías con Drag and Drop */}
      <div className="space-y-1.5">
        {categories.map((cat, idx) => {
          const isSelected = selectedCategoryId === cat.id;
          const isDragging = draggedIdx === idx;
          const isOver = dragOverIdx === idx && draggedIdx !== idx;
          const isEditing = editingId === cat.id;
          const isConfirmingDelete = deletingId === cat.id;
          const dishCount = countByCategory[cat.id] || 0;

          return (
            <div
              key={cat.id}
              draggable={!isEditing}
              onDragStart={(e) => handleDragStart(e, idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDragEnd={handleDragEnd}
              onDrop={(e) => handleDrop(e, idx)}
              onClick={() => {
                if (!isEditing && !isConfirmingDelete) {
                  onSelectCategory(cat.id);
                }
              }}
              className={`group flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all border ${
                isOver ? 'border-t-2 border-t-jade bg-jade-subtle/30' : ''
              } ${
                isDragging ? 'opacity-40 scale-95' : ''
              } ${
                isSelected
                  ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                  : 'bg-white/80 hover:bg-white text-ink-primary border-border-whisper'
              } ${!cat.is_active && !isSelected ? 'opacity-60 bg-surface-subtle' : ''}`}
            >
              {/* Lado izquierdo: Manija de arrastre y Nombre */}
              <div className="flex items-center gap-2 flex-1 min-w-0 pr-2">
                <span
                  className={`cursor-grab active:cursor-grabbing p-0.5 rounded hover:bg-black/5 ${
                    isSelected ? 'text-white/60 hover:text-white' : 'text-ink-tertiary'
                  }`}
                  title="Arrastrar para reordenar"
                >
                  <GripVertical className="w-3.5 h-3.5" />
                </span>

                {isEditing ? (
                  <div
                    className="flex items-center gap-1 flex-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveInline(cat.id);
                        if (e.key === 'Escape') handleCancelEditing();
                      }}
                      autoFocus
                      disabled={isSaving}
                      className="w-full text-xs font-bold text-ink-primary bg-white border border-border-strong rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-jade"
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveInline(cat.id)}
                      disabled={isSaving}
                      className="p-1 rounded text-jade hover:bg-jade-subtle"
                      title="Guardar nombre"
                    >
                      {isSaving ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelEditing}
                      disabled={isSaving}
                      className="p-1 rounded text-ink-tertiary hover:text-ink-primary"
                      title="Cancelar"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-xs font-bold tracking-tight truncate">
                      {cat.name}
                    </span>
                    {!cat.is_active && (
                      <span
                        className={`text-[9px] font-bold uppercase px-1.5 py-0.2 rounded ${
                          isSelected
                            ? 'bg-white/20 text-white/80'
                            : 'bg-alert-ochre-subtle text-alert-ochre border border-alert-ochre/20'
                        }`}
                      >
                        Inactiva
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Lado derecho: Conteo y Acciones */}
              {!isEditing && (
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {/* Badge de conteo de platillos */}
                  <span
                    className={`text-xs font-mono font-bold px-2 py-0.5 rounded-md ${
                      isSelected
                        ? 'bg-white/20 text-white'
                        : 'bg-surface-subtle text-ink-secondary border border-border-whisper'
                    }`}
                  >
                    {dishCount}
                  </span>

                  {isConfirmingDelete ? (
                    <div
                      className="flex items-center gap-1 bg-white p-1 rounded-lg border border-alert-crimson shadow-2xs"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={(e) => handleDeleteCategory(e, cat.id)}
                        disabled={isSaving}
                        className="text-[10px] font-bold text-white bg-alert-crimson px-2 py-0.5 rounded"
                      >
                        {isSaving ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          'Borrar'
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingId(null)}
                        className="text-[10px] font-semibold text-ink-secondary px-1 py-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div
                      className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity gap-0.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Botón editar nombre */}
                      <button
                        type="button"
                        onClick={() => handleStartEditing(cat)}
                        className={`p-1 rounded hover:bg-black/10 ${
                          isSelected ? 'text-white' : 'text-ink-secondary hover:text-ink-primary'
                        }`}
                        title="Editar nombre"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>

                      {/* Botón toggle activo */}
                      <button
                        type="button"
                        onClick={(e) => handleToggleActive(e, cat)}
                        className={`p-1 rounded hover:bg-black/10 text-[10px] font-bold ${
                          cat.is_active
                            ? isSelected
                              ? 'text-jade-subtle'
                              : 'text-jade'
                            : 'text-ink-tertiary'
                        }`}
                        title={cat.is_active ? 'Desactivar categoría' : 'Activar categoría'}
                      >
                        {cat.is_active ? (
                          <Check className="w-3 h-3" />
                        ) : (
                          <X className="w-3 h-3" />
                        )}
                      </button>

                      {/* Botón eliminar */}
                      <button
                        type="button"
                        onClick={() => setDeletingId(cat.id)}
                        className={`p-1 rounded hover:bg-alert-crimson-subtle ${
                          isSelected ? 'text-white/80 hover:text-alert-crimson' : 'text-ink-tertiary hover:text-alert-crimson'
                        }`}
                        title="Eliminar categoría"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {categories.length === 0 && (
          <div className="p-4 text-center rounded-xl border border-dashed border-border-whisper bg-white/40">
            <p className="text-xs text-ink-tertiary">No hay categorías creadas aún</p>
            <button
              type="button"
              onClick={onOpenCreate}
              className="mt-2 text-xs font-bold text-jade hover:underline inline-flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              <span>Crear primera categoría</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
