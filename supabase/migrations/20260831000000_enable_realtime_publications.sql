-- ============================================================================
-- ChatAliado — Migración: Publicación Supabase Realtime para Dashboard y KDS
-- ============================================================================
-- Habilita el broadcast de eventos en tiempo real (INSERT, UPDATE, DELETE)
-- para las tablas clave del Dashboard y KDS, garantizando idempotencia.
-- ============================================================================

DO $block$
DECLARE
  tbl text;
  tables text[] := ARRAY['conversations', 'messages', 'orders', 'order_items', 'customers'];
BEGIN
  -- 1. Asegurar que la publicación supabase_realtime existe
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  -- 2. Agregar tablas que no estén ya en la publicación
  FOREACH tbl IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 
      FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    END IF;
  END LOOP;
END $block$;
