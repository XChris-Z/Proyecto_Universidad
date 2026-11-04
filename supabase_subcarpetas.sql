-- ============================================================================
-- SCRIPT DE MIGRACIÓN: SISTEMA DE SUBCARPETAS CON MÚLTIPLES RESPONSABLES
-- SGD Unitrópico — Sistema de Gestión Documental y Correspondencia
-- ============================================================================
-- Este script es completamente idempotente (se puede ejecutar múltiples veces sin error).
-- Ejecutar en el SQL Editor de Supabase.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Asegurar columna pin_acceso en peticiones
ALTER TABLE public.peticiones 
ADD COLUMN IF NOT EXISTS pin_acceso TEXT;

CREATE INDEX IF NOT EXISTS idx_peticiones_pin_acceso 
ON public.peticiones(pin_acceso);

-- 2. Tabla de Subcarpetas por Radicado
CREATE TABLE IF NOT EXISTS public.peticion_subcarpetas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  peticion_id UUID NOT NULL REFERENCES public.peticiones(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Vincular peticion_responsables a la subcarpeta asignada y agregar campo observaciones
ALTER TABLE public.peticion_responsables
ADD COLUMN IF NOT EXISTS subcarpeta_id UUID REFERENCES public.peticion_subcarpetas(id) ON DELETE CASCADE;

ALTER TABLE public.peticion_responsables
ADD COLUMN IF NOT EXISTS observaciones TEXT;

-- 4. Vincular peticion_anexos a la subcarpeta correspondiente
ALTER TABLE public.peticion_anexos
ADD COLUMN IF NOT EXISTS subcarpeta_id UUID REFERENCES public.peticion_subcarpetas(id) ON DELETE SET NULL;

-- 5. Índices de rendimiento
CREATE INDEX IF NOT EXISTS idx_subcarpetas_peticion_id 
ON public.peticion_subcarpetas(peticion_id);

CREATE INDEX IF NOT EXISTS idx_responsables_subcarpeta_id 
ON public.peticion_responsables(subcarpeta_id);

CREATE INDEX IF NOT EXISTS idx_anexos_subcarpeta_id 
ON public.peticion_anexos(subcarpeta_id);

-- 6. Habilitar RLS (Row Level Security) y definir políticas permisivas
ALTER TABLE public.peticion_subcarpetas ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'peticion_subcarpetas' AND policyname = 'Acceso público lectura subcarpetas'
  ) THEN
    CREATE POLICY "Acceso público lectura subcarpetas" 
    ON public.peticion_subcarpetas FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'peticion_subcarpetas' AND policyname = 'Acceso público insercion subcarpetas'
  ) THEN
    CREATE POLICY "Acceso público insercion subcarpetas" 
    ON public.peticion_subcarpetas FOR INSERT WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'peticion_subcarpetas' AND policyname = 'Acceso público actualizacion subcarpetas'
  ) THEN
    CREATE POLICY "Acceso público actualizacion subcarpetas" 
    ON public.peticion_subcarpetas FOR UPDATE USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'peticion_subcarpetas' AND policyname = 'Acceso público eliminacion subcarpetas'
  ) THEN
    CREATE POLICY "Acceso público eliminacion subcarpetas" 
    ON public.peticion_subcarpetas FOR DELETE USING (true);
  END IF;
END $$;

-- 7. Recargar caché de esquema de PostgREST para reflejar los cambios de inmediato
NOTIFY pgrst, 'reload schema';
