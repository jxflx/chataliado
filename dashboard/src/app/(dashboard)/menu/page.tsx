'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  BookOpen,
  Plus,
  FolderPlus,
  Utensils,
  RefreshCw,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { useTenant } from '@/components/layout/tenant-provider';
import { getCategories, getMenuItems } from '@/app/(dashboard)/menu/actions';
import { type MenuCategory, type MenuItem } from '@/types/database';

import { CategoryList } from '@/components/menu/category-list';
import { MenuGrid } from '@/components/menu/menu-grid';
import { CategoryForm } from '@/components/menu/category-form';
import { MenuItemForm } from '@/components/menu/menu-item-form';

export default function MenuPage() {
  const { activeRestaurant, userRole } = useTenant();

  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modales
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState<boolean>(false);
  const [categoryToEdit, setCategoryToEdit] = useState<MenuCategory | null>(null);

  const [isDishModalOpen, setIsDishModalOpen] = useState<boolean>(false);
  const [dishToEdit, setDishToEdit] = useState<MenuItem | null>(null);

  const restaurantId = activeRestaurant?.id;

  // Carga inicial y recarga de datos
  const loadMenuData = useCallback(
    async (isManualRefresh = false) => {
      if (!restaurantId) return;

      if (isManualRefresh) setRefreshing(true);
      else setLoading(true);

      setErrorMessage(null);

      try {
        const [catRes, itemsRes] = await Promise.all([
          getCategories(restaurantId),
          getMenuItems(restaurantId),
        ]);

        if (!catRes.success) {
          setErrorMessage(catRes.error || 'Error al cargar las categorías');
        } else {
          setCategories(catRes.data || []);
        }

        if (!itemsRes.success) {
          setErrorMessage((prev) =>
            prev ? `${prev} · ${itemsRes.error}` : itemsRes.error || 'Error al cargar platillos'
          );
        } else {
          setMenuItems(itemsRes.data || []);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error inesperado al cargar el menú';
        setErrorMessage(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [restaurantId]
  );

  useEffect(() => {
    if (restaurantId) {
      loadMenuData();
    }
  }, [restaurantId, loadMenuData]);

  // Handlers para Categorías
  const handleOpenCreateCategory = () => {
    setCategoryToEdit(null);
    setIsCategoryModalOpen(true);
  };

  const handleCategorySaved = (savedCategory: MenuCategory) => {
    setCategories((prev) => {
      const exists = prev.some((c) => c.id === savedCategory.id);
      if (exists) {
        return prev.map((c) => (c.id === savedCategory.id ? savedCategory : c));
      }
      return [...prev, savedCategory];
    });
  };

  // Handlers para Platillos
  const handleOpenCreateDish = () => {
    setDishToEdit(null);
    setIsDishModalOpen(true);
  };

  const handleOpenEditDish = (item: MenuItem) => {
    setDishToEdit(item);
    setIsDishModalOpen(true);
  };

  const handleDishSaved = (savedDish: MenuItem) => {
    setMenuItems((prev) => {
      const exists = prev.some((d) => d.id === savedDish.id);
      if (exists) {
        return prev.map((d) => (d.id === savedDish.id ? savedDish : d));
      }
      return [...prev, savedDish];
    });
  };

  const handleDishDeleted = (deletedId: string) => {
    setMenuItems((prev) => prev.filter((d) => d.id !== deletedId));
  };

  const handleDishAvailabilityToggled = (updatedItem: MenuItem) => {
    setMenuItems((prev) =>
      prev.map((d) => (d.id === updatedItem.id ? updatedItem : d))
    );
  };

  if (!activeRestaurant) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-center">
        <div className="liquid-card rounded-3xl p-8 max-w-md space-y-3">
          <BookOpen className="w-8 h-8 text-ink-tertiary mx-auto" />
          <h2 className="text-sm font-bold text-ink-primary">
            No hay restaurante seleccionado
          </h2>
          <p className="text-xs text-ink-secondary">
            Selecciona un restaurante en la barra lateral para gestionar su menú.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 p-4 sm:p-6 space-y-6 max-w-7xl mx-auto w-full">
      {/* Encabezado Superior */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-jade-subtle text-jade flex items-center justify-center border border-jade/20 shadow-2xs">
              <BookOpen className="w-4 h-4" />
            </div>
            <h1 className="text-xl font-bold text-ink-primary tracking-tight">
              Menú & Catálogo
            </h1>
            <span className="text-[11px] font-mono font-bold text-ink-secondary bg-white/80 px-2 py-0.5 rounded-md border border-border-whisper shadow-2xs">
              {menuItems.length} platillos
            </span>
          </div>
          <p className="text-xs text-ink-secondary mt-1 max-w-xl">
            Administra categorías, platillos, modificadores de precio y disponibilidad inmediata para el bot de WhatsApp y el sistema de cocina KDS.
          </p>
        </div>

        {/* Acciones principales */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => loadMenuData(true)}
            disabled={loading || refreshing}
            className="p-2 text-ink-secondary hover:text-ink-primary bg-white/70 hover:bg-white border border-border-whisper rounded-xl pressable shadow-2xs"
            title="Recargar menú"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-jade' : ''}`} />
          </button>

          <button
            type="button"
            onClick={handleOpenCreateCategory}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-ink-primary bg-white/80 hover:bg-white border border-border-whisper rounded-xl pressable shadow-2xs"
          >
            <FolderPlus className="w-3.5 h-3.5 text-jade" />
            <span>Nueva Categoría</span>
          </button>

          <button
            type="button"
            onClick={handleOpenCreateDish}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl pressable shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nuevo Platillo</span>
          </button>
        </div>
      </div>

      {/* Alerta de error global si hubo falla */}
      {errorMessage && (
        <div className="p-3.5 rounded-2xl bg-alert-crimson-subtle border border-alert-crimson/30 flex items-center gap-2.5 text-xs text-alert-crimson font-medium">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">{errorMessage}</span>
          <button
            type="button"
            onClick={() => loadMenuData(true)}
            className="text-xs font-bold underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Layout de 2 columnas: Categorías a la izquierda, Platillos a la derecha */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center p-12">
          <div className="liquid-card p-6 rounded-2xl flex items-center gap-3 border border-white/90 shadow-glass-subtle">
            <Loader2 className="w-5 h-5 text-jade animate-spin" />
            <span className="text-xs font-bold text-ink-primary">
              Cargando catálogo del restaurante...
            </span>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Panel Lateral de Categorías (4 cols en lg) */}
          <div className="lg:col-span-4 xl:col-span-3">
            <div className="liquid-panel rounded-3xl p-4 border border-white/90 shadow-glass-subtle">
              <CategoryList
                categories={categories}
                items={menuItems}
                restaurantId={activeRestaurant.id}
                selectedCategoryId={selectedCategoryId}
                onSelectCategory={setSelectedCategoryId}
                onCategoriesChanged={setCategories}
                onOpenCreate={handleOpenCreateCategory}
              />
            </div>
          </div>

          {/* Grilla Principal de Platillos (8 cols en lg) */}
          <div className="lg:col-span-8 xl:col-span-9">
            <MenuGrid
              items={menuItems}
              categories={categories}
              restaurantId={activeRestaurant.id}
              selectedCategoryId={selectedCategoryId}
              onSelectCategory={setSelectedCategoryId}
              onEditItem={handleOpenEditDish}
              onDeleteItem={handleDishDeleted}
              onOpenCreateDish={handleOpenCreateDish}
              onItemUpdated={handleDishAvailabilityToggled}
            />
          </div>
        </div>
      )}

      {/* Modal de Categoría */}
      <CategoryForm
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        restaurantId={activeRestaurant.id}
        categoryToEdit={categoryToEdit}
        onSuccess={handleCategorySaved}
      />

      {/* Modal de Platillo */}
      <MenuItemForm
        isOpen={isDishModalOpen}
        onClose={() => setIsDishModalOpen(false)}
        restaurantId={activeRestaurant.id}
        categories={categories}
        itemToEdit={dishToEdit}
        defaultCategoryId={selectedCategoryId}
        onSuccess={handleDishSaved}
      />
    </div>
  );
}
