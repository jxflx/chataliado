-- Migration: Add sort_order to menu_items and composite index for ordering
-- Milestone 1: Menú & Catálogo Interactivo (Dashboard Next.js & Server Actions)

ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_menu_items_sort ON public.menu_items(restaurant_id, category_id, sort_order ASC);
