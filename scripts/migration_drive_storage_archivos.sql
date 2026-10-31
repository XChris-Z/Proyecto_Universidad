-- ==============================================================================
-- MIGRACIÓN: GESTOR DE ARCHIVOS ESTILO DRIVE Y STORAGE PARA PETICIONES Y ANEXOS
-- scripts/migration_drive_storage_archivos.sql
-- ==============================================================================

-- 1. Asegurar campo de instrucciones de anexos en peticiones
ALTER TABLE public.peticiones 
  ADD COLUMN IF NOT EXISTS instrucciones_anexos text;

COMMENT ON COLUMN public.peticiones.instrucciones_anexos IS 
  'Instrucciones específicas o requerimiento de anexos dirigidos a los responsables en el correo formal';

-- 2. Asegurar existencia de la tabla peticion_anexos (Raíz del Radicado + Anexos de Oficinas)
CREATE TABLE IF NOT EXISTS public.peticion_anexos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  peticion_id uuid NOT NULL REFERENCES public.peticiones(id) ON DELETE CASCADE,
  peticion_responsable_id uuid REFERENCES public.peticion_responsables(id) ON DELETE SET NULL,
  nombre_archivo text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  tamano_bytes bigint,
  subido_por_email text NOT NULL,
  es_anexo_oficina boolean DEFAULT false,
  created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Índices para búsqueda rápida en el Gestor de Archivos y en el Portal
CREATE INDEX IF NOT EXISTS idx_peticion_anexos_peticion_id ON public.peticion_anexos(peticion_id);
CREATE INDEX IF NOT EXISTS idx_peticion_anexos_responsable_id ON public.peticion_anexos(peticion_responsable_id);
CREATE INDEX IF NOT EXISTS idx_peticion_anexos_es_anexo_oficina ON public.peticion_anexos(es_anexo_oficina);

-- 3. Habilitar RLS en peticion_anexos
ALTER TABLE public.peticion_anexos ENABLE ROW LEVEL SECURITY;

-- Política de lectura de anexos (Lectura para usuarios autenticados del SGD y acceso público controlado para portal)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'peticion_anexos' AND policyname = 'Permitir lectura de anexos'
  ) THEN
    CREATE POLICY "Permitir lectura de anexos" 
      ON public.peticion_anexos FOR SELECT 
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'peticion_anexos' AND policyname = 'Permitir insercion de anexos'
  ) THEN
    CREATE POLICY "Permitir insercion de anexos" 
      ON public.peticion_anexos FOR INSERT 
      WITH CHECK (true);
  END IF;
END $$;

-- 4. Crear / Configurar Bucket de Almacenamiento "peticiones" en Supabase Storage
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'peticiones',
  'peticiones',
  true,
  52428800, -- 50 MB límite por archivo
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/zip',
    'application/x-zip-compressed'
  ]
)
ON CONFLICT (id) DO UPDATE
SET 
  public = true,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 5. Políticas de Acceso a Supabase Storage para el bucket "peticiones"
DO $$
BEGIN
  -- Política para permitir que cualquier cliente o servidor descargue/vea objetos en el bucket 'peticiones'
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Acceso publico lectura peticiones'
  ) THEN
    CREATE POLICY "Acceso publico lectura peticiones"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'peticiones');
  END IF;

  -- Política para permitir la subida de archivos al bucket 'peticiones'
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Permitir insercion objetos peticiones'
  ) THEN
    CREATE POLICY "Permitir insercion objetos peticiones"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'peticiones');
  END IF;

  -- Política para permitir actualización / reemplazo si fuera necesario
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Permitir actualizacion objetos peticiones'
  ) THEN
    CREATE POLICY "Permitir actualizacion objetos peticiones"
      ON storage.objects FOR UPDATE
      USING (bucket_id = 'peticiones');
  END IF;
END $$;

