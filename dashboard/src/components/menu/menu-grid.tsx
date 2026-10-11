'use client';

import React, { useState, useMemo } from 'react';
import {
  Search,
  Plus,
  UtensilsCrossed,
  X,
  SlidersHorizontal,
} from 'lucide-react';
import { type MenuCategory, type MenuItem } from '@/types/database';
import { MenuItemCard } from './menu-item-card';

export interface MenuGridProps {
  items: MenuItem[];
  categories: MenuCategory[];
  restaurantId: string;
  selectedCategoryId: string | null;
  onSelectCategory: (categoryId: string | null) => void;
  onEditItem: (item: MenuItem) => void;
  onDeleteItem: (itemId: string) => void;
  onOpenCreateDish: () => void;
  onItemUpdated: (updatedItem: MenuItem) => void;
}

type AvailabilityFilter = 'all' | 'available' | 'unavailable';

export function MenuGrid({
  items,
  categories,
  restaurantId,
  selectedCategoryId,
  onSelectCategory,
  onEditItem,
  onDeleteItem,
  onOpenCreateDish,
  onItemUpdated,
}: MenuGridProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [availabilityFilter, setAvailabilityFilter] = useState<AvailabilityFilter>('all');

  // Mapa de nombres de categorías
  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((cat) => map.set(cat.id, cat.name));
    return map;
  }, [categories]);

  // Filtrado reactivo de platillos
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Filtro por categoría
      if (selectedCategoryId && item.category_id !== selectedCategoryId) {
        return false;
      }

      // Filtro por disponibilidad
      if (availabilityFilter === 'available' && !item.is_available) {
        return false;
      }
      if (availabilityFilter === 'unavailable' && item.is_available) {
        return false;
      }

      // Filtro por búsqueda de texto
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesName = item.name.toLowerCase().includes(query);
        const matchesDesc = (item.description || '').toLowerCase().includes(query);
        if (!matchesName && !matchesDesc) return false;
      }

      return true;
    });
  }, [items, selectedCategoryId, availabilityFilter, searchQuery]);

  // Contadores para píldoras
  const counts = useMemo(() => {
    const total = items.length;
    const available = items.filter((i) => i.is_available).length;
    const unavailable = total - available;
    return { total, available, unavailable };
  }, [items]);

  const activeCategoryName = selectedCategoryId
    ? categoryMap.get(selectedCategoryId) || 'Categoría seleccionada'
    : 'Todos los Platillos';

  return (
    <div className="space-y-4">
      {/* Barra de Filtros y Búsqueda */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Buscador */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-ink-tertiary absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por nombre o ingredientes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs text-ink-primary bg-white/80 border border-border-whisper rounded-xl pl-9 pr-8 py-2 focus:outline-none focus:ring-1 focus:ring-jade placeholder:text-ink-tertiary shadow-2xs"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-tertiary hover:text-ink-primary p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Píldoras de disponibilidad & CTA */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex p-0.5 rounded-xl bg-surface-subtle border border-border-whisper shadow-2xs">
            <button
              type="button"
              onClick={() => setAvailabilityFilter('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                availabilityFilter === 'all'
                  ? 'bg-white text-ink-primary font-bold shadow-2xs'
                  : 'text-ink-secondary hover:text-ink-primary'
              }`}
            >
              Todos <span className="font-mono text-[11px] text-ink-tertiary">({counts.total})</span>
            </button>
            <button
              type="button"
              onClick={() => setAvailabilityFilter('available')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                availabilityFilter === 'available'
                  ? 'bg-white text-jade font-bold shadow-2xs'
                  : 'text-ink-secondary hover:text-ink-primary'
              }`}
            >
              Disponibles <span className="font-mono text-[11px] text-ink-tertiary">({counts.available})</span>
            </button>
            <button
              type="button"
              onClick={() => setAvailabilityFilter('unavailable')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                availabilityFilter === 'unavailable'
                  ? 'bg-white text-alert-ochre font-bold shadow-2xs'
                  : 'text-ink-secondary hover:text-ink-primary'
              }`}
            >
              Agotados <span className="font-mono text-[11px] text-ink-tertiary">({counts.unavailable})</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onOpenCreateDish}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl pressable shadow-2xs ml-auto sm:ml-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nuevo Platillo</span>
          </button>
        </div>
      </div>

      {/* Píldoras de Categorías (Filtro Horizontal Rápido para pantallas grandes o móviles) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        <button
          type="button"
          onClick={() => onSelectCategory(null)}
          className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-xl transition-all border ${
            selectedCategoryId === null
              ? 'bg-slate-900 text-white font-bold border-slate-900 shadow-2xs'
              : 'bg-white/70 hover:bg-white text-ink-secondary font-medium border-border-whisper'
          }`}
        >
          Todas las Secciones
        </button>
        {categories.map((cat) => {
          const isSelected = selectedCategoryId === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onSelectCategory(cat.id)}
              className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-xl transition-all border ${
                isSelected
                  ? 'bg-slate-900 text-white font-bold border-slate-900 shadow-2xs'
                  : 'bg-white/70 hover:bg-white text-ink-secondary font-medium border-border-whisper'
              }`}
            >
              {cat.name}
            </button>
          );
        })}
      </div>

      {/* Estado del filtro activo */}
      <div className="flex items-center justify-between text-xs text-ink-secondary px-1">
        <div className="flex items-center gap-2">
          <span className="font-bold text-ink-primary">{activeCategoryName}</span>
          <span>·</span>
          <span>
            Mostrando <span className="font-mono font-bold">{filteredItems.length}</span> de{' '}
            <span className="font-mono font-bold">{items.length}</span> platillos
          </span>
        </div>
        {(selectedCategoryId !== null || availabilityFilter !== 'all' || searchQuery) && (
          <button
            type="button"
            onClick={() => {
              onSelectCategory(null);
              setAvailabilityFilter('all');
              setSearchQuery('');
            }}
            className="text-[11px] font-semibold text-jade hover:underline inline-flex items-center gap-1"
          >
            <SlidersHorizontal className="w-3 h-3" />
            <span>Limpiar filtros</span>
          </button>
        )}
      </div>

      {/* Cuadrícula de Platillos */}
      {filteredItems.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {filteredItems.map((item) => (
            <MenuItemCard
              key={item.id}
              item={item}
              restaurantId={restaurantId}
              categoryName={item.category_id ? categoryMap.get(item.category_id) : undefined}
              onEdit={onEditItem}
              onDeleted={onDeleteItem}
              onAvailabilityToggled={onItemUpdated}
            />
          ))}
        </div>
      ) : (
        /* Estados Vacíos */
        <div className="p-12 text-center rounded-3xl border border-dashed border-border-strong/80 bg-white/40 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-surface-subtle border border-border-whisper mx-auto flex items-center justify-center text-ink-tertiary">
            <UtensilsCrossed className="w-6 h-6" />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h3 className="text-sm font-bold text-ink-primary">
              {items.length === 0
                ? 'No hay platillos en el catálogo'
                : 'No se encontraron platillos'}
            </h3>
            <p className="text-xs text-ink-secondary leading-relaxed">
              {items.length === 0
                ? 'Comienza a agregar los platillos de tu menú para que el bot de WhatsApp pueda recomendarlos y tomar pedidos.'
                : 'Intenta ajustar tus criterios de búsqueda o cambiar la categoría seleccionada.'}
            </p>
          </div>
          {items.length === 0 ? (
            <button
              type="button"
              onClick={onOpenCreateDish}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl pressable shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Crear Primer Platillo</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                onSelectCategory(null);
                setAvailabilityFilter('all');
                setSearchQuery('');
              }}
              className="inline-flex items-center gap-1 text-xs font-semibold text-jade hover:underline"
            >
              Restablecer todos los filtros
            </button>
          )}
        </div>
      )}
    </div>
  );
}
