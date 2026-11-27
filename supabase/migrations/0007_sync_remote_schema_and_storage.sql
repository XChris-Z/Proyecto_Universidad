-- supabase/migrations/0007_sync_remote_schema_and_storage.sql
-- Sincronización integral del esquema remoto de Supabase, restricciones, índices y Storage buckets
-- Aplicada en el proyecto remoto Practica (irjjpjtvhxoakiazfswn)

-- 1. Extensiones requeridas
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. COLEGIADOS_NORMAS (Cuerpos Colegiados y Normativa)
ALTER TABLE public.colegiados_normas
  DROP CONSTRAINT IF EXISTS colegiados_normas_tipo_check;

ALTER TABLE public.colegiados_normas
  ALTER COLUMN tipo TYPE TEXT,
  ALTER COLUMN numero TYPE TEXT,
  ALTER COLUMN year TYPE TEXT,
  ALTER COLUMN vigencia TYPE TEXT;

ALTER TABLE public.colegiados_normas
  ADD COLUMN IF NOT EXISTS anio INTEGER,
  ADD COLUMN IF NOT EXISTS cuerpo_colegiado TEXT,
  ADD COLUMN IF NOT EXISTS tipo_acto TEXT,
  ADD COLUMN IF NOT EXISTS numero_acto TEXT,
  ADD COLUMN IF NOT EXISTS fecha_expedicion DATE,
  ADD COLUMN IF NOT EXISTS asunto TEXT,
  ADD COLUMN IF NOT EXISTS archivo_url TEXT,
  ADD COLUMN IF NOT EXISTS archivo_nombre TEXT;

CREATE INDEX IF NOT EXISTS idx_colegiados_normas_organo_anio
  ON public.colegiados_normas (organo_code, anio);

-- 3. MIEMBROS_CONSEJO
CREATE TABLE IF NOT EXISTS public.miembros_consejo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cuerpo_colegiado TEXT NOT NULL,
  nombre_completo TEXT NOT NULL,
  cargo_calidad TEXT NOT NULL,
  correo TEXT,
  foto_url TEXT,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'inactivo', 'archivado')),
  acta_inicio_url TEXT,
  acta_inicio_nombre TEXT,
  razon_cambio TEXT,
  acta_cambio_url TEXT,
  acta_cambio_nombre TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_miembros_colegiado ON public.miembros_consejo (cuerpo_colegiado);
CREATE INDEX IF NOT EXISTS idx_miembros_estado ON public.miembros_consejo (estado);
CREATE INDEX IF NOT EXISTS idx_miembros_fecha_fin ON public.miembros_consejo (fecha_fin);

ALTER TABLE public.miembros_consejo ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'miembros_consejo' AND policyname = 'miembros_consejo_policy_all'
  ) THEN
    CREATE POLICY "miembros_consejo_policy_all"
      ON public.miembros_consejo FOR ALL TO public USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 4. ASUNTOS JURÍDICOS (juridico_carpetas, juridico_documentos, juridicos_casos)
CREATE TABLE IF NOT EXISTS public.juridico_carpetas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria_raiz TEXT NOT NULL CHECK (categoria_raiz IN ('conceptos_internos', 'litigios_judiciales', 'auditoria_entes_control')),
  parent_id UUID REFERENCES public.juridico_carpetas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  tema TEXT,
  anio INTEGER,
  descripcion TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.juridico_documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria_raiz TEXT NOT NULL CHECK (categoria_raiz IN ('conceptos_internos', 'litigios_judiciales', 'auditoria_entes_control')),
  carpeta_id UUID REFERENCES public.juridico_carpetas(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  tema TEXT,
  anio INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM now())::INT,
  palabras_clave TEXT,
  descripcion TEXT,
  archivo_url TEXT NOT NULL,
  archivo_nombre TEXT NOT NULL,
  archivo_tamano BIGINT,
  contenido_extraido TEXT DEFAULT '',
  search_vector TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('spanish', coalesce(titulo, '')), 'A') ||
    setweight(to_tsvector('spanish', coalesce(tema, '')), 'A') ||
    setweight(to_tsvector('spanish', coalesce(palabras_clave, '')), 'A') ||
    setweight(to_tsvector('spanish', coalesce(archivo_nombre, '')), 'B') ||
    setweight(to_tsvector('spanish', coalesce(descripcion, '')), 'B') ||
    setweight(to_tsvector('spanish', coalesce(contenido_extraido, '')), 'C')
  ) STORED,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_juridico_doc_search ON public.juridico_documentos USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_juridico_doc_anio_tema ON public.juridico_documentos (categoria_raiz, anio, tema);
CREATE INDEX IF NOT EXISTS idx_juridico_doc_carpeta_id ON public.juridico_documentos (carpeta_id);
CREATE INDEX IF NOT EXISTS idx_juridico_carpetas_cat ON public.juridico_carpetas (categoria_raiz, parent_id);
CREATE INDEX IF NOT EXISTS idx_juridico_carpetas_parent_id ON public.juridico_carpetas (parent_id);

ALTER TABLE public.juridico_carpetas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.juridico_documentos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'juridico_carpetas' AND policyname = 'juridico_carpetas_policy_all'
  ) THEN
    CREATE POLICY "juridico_carpetas_policy_all"
      ON public.juridico_carpetas FOR ALL TO public USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'juridico_documentos' AND policyname = 'juridico_documentos_policy_all'
  ) THEN
    CREATE POLICY "juridico_documentos_policy_all"
      ON public.juridico_documentos FOR ALL TO public USING (true) WITH CHECK (true);
  END IF;
END $$;

ALTER TABLE public.juridicos_casos
  ADD COLUMN IF NOT EXISTS expediente TEXT,
  ADD COLUMN IF NOT EXISTS despacho TEXT,
  ADD COLUMN IF NOT EXISTS observaciones TEXT;

-- 5. PROGRAMAS ACADÉMICOS
ALTER TABLE public.programas_academicos
  ADD COLUMN IF NOT EXISTS archivo_url TEXT,
  ADD COLUMN IF NOT EXISTS archivo_nombre TEXT;

-- 6. PETICIONES, SUBCARPETAS, RESPONSABLES Y ANEXOS
ALTER TABLE public.peticiones
  DROP CONSTRAINT IF EXISTS peticiones_estado_check;

ALTER TABLE public.peticiones
  ALTER COLUMN estado TYPE TEXT;

ALTER TABLE public.peticiones
  ADD CONSTRAINT peticiones_estado_check CHECK (
    estado IS NULL OR estado = ANY (ARRAY[
      'En Trámite', 'en_tramite', 'Pendiente', 'pendiente',
      'Revisión', 'revision',
      'Respondida', 'respondida', 'Resuelta', 'resuelta',
      'Finalizada', 'finalizada', 'Completada', 'completada',
      'Cerrada', 'cerrada', 'Archivada', 'archivada',
      'Vencida', 'vencida'
    ])
  );

ALTER TABLE public.peticiones
  ADD COLUMN IF NOT EXISTS pin_acceso TEXT,
  ADD COLUMN IF NOT EXISTS clasificacion_peticion TEXT,
  ADD COLUMN IF NOT EXISTS drive_folder_id TEXT,
  ADD COLUMN IF NOT EXISTS drive_folder_url TEXT,
  ADD COLUMN IF NOT EXISTS respuesta_mensaje TEXT,
  ADD COLUMN IF NOT EXISTS respuesta_funcionario TEXT,
  ADD COLUMN IF NOT EXISTS respuesta_fecha_envio TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS respuesta_expira_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS respuesta_pin_solicitante TEXT,
  ADD COLUMN IF NOT EXISTS respuesta_archivos_incluidos JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS respuesta_drive_url TEXT,
  ADD COLUMN IF NOT EXISTS fecha_respuesta TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS respuesta_oficial BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS respondida BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_peticiones_pin_acceso ON public.peticiones (pin_acceso);

UPDATE public.peticiones
SET pin_acceso = LPAD((FLOOR(RANDOM() * 900000) + 100000)::TEXT, 6, '0')
WHERE pin_acceso IS NULL OR LENGTH(TRIM(pin_acceso)) != 6;

CREATE TABLE IF NOT EXISTS public.peticion_subcarpetas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  peticion_id UUID NOT NULL REFERENCES public.peticiones(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subcarpetas_peticion_id ON public.peticion_subcarpetas (peticion_id);
ALTER TABLE public.peticion_subcarpetas ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'peticion_subcarpetas' AND policyname = 'peticion_subcarpetas_policy_all'
  ) THEN
    CREATE POLICY "peticion_subcarpetas_policy_all"
      ON public.peticion_subcarpetas FOR ALL TO public USING (true) WITH CHECK (true);
  END IF;
END $$;

ALTER TABLE public.peticion_responsables
  ADD COLUMN IF NOT EXISTS subcarpeta_id UUID REFERENCES public.peticion_subcarpetas(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS observaciones TEXT;

ALTER TABLE public.peticion_responsables
  DROP CONSTRAINT IF EXISTS unique_peticion_oficina,
  DROP CONSTRAINT IF EXISTS peticion_responsables_peticion_id_oficina_id_key;

DROP INDEX IF EXISTS public.idx_peticion_responsables_peticion_oficina;
CREATE INDEX IF NOT EXISTS idx_responsables_subcarpeta_id ON public.peticion_responsables (subcarpeta_id);
CREATE INDEX IF NOT EXISTS idx_responsables_peticion_id ON public.peticion_responsables (peticion_id);
CREATE INDEX IF NOT EXISTS idx_responsables_oficina_id ON public.peticion_responsables (oficina_id);

ALTER TABLE public.peticion_anexos
  ADD COLUMN IF NOT EXISTS subcarpeta_id UUID REFERENCES public.peticion_subcarpetas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_anexos_subcarpeta_id ON public.peticion_anexos (subcarpeta_id);
CREATE INDEX IF NOT EXISTS idx_anexos_peticion_id ON public.peticion_anexos (peticion_id);
CREATE INDEX IF NOT EXISTS idx_anexos_responsable_id ON public.peticion_anexos (peticion_responsable_id);

CREATE OR REPLACE FUNCTION public.fn_peticion_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_year TEXT;
    v_seq_num BIGINT;
BEGIN
    v_year := TO_CHAR(NOW(), 'YYYY');

    IF NEW.numero_radicado IS NULL OR NEW.numero_radicado = '' THEN
        v_seq_num := nextval('public.radicado_peticion_seq');
        NEW.numero_radicado := 'RAD-' || v_year || '-' || LPAD(v_seq_num::text, 5, '0');
    END IF;

    IF NEW.fecha_limite_responsable IS NULL AND NEW.fecha_limite_entrega IS NOT NULL THEN
        NEW.fecha_limite_responsable := NEW.fecha_limite_entrega - INTERVAL '5 days';
    END IF;

    IF NEW.storage_folder_path IS NULL OR NEW.storage_folder_path = '' THEN
        NEW.storage_folder_path := 'peticiones/' || NEW.numero_radicado || '/';
    END IF;

    IF NEW.pin_acceso IS NULL OR LENGTH(TRIM(NEW.pin_acceso)) != 6 THEN
        NEW.pin_acceso := LPAD((FLOOR(RANDOM() * 900000) + 100000)::TEXT, 6, '0');
    END IF;

    RETURN NEW;
END;
$$;

-- 7. CONFIGURACIÓN DEL SISTEMA Y RBAC
CREATE TABLE IF NOT EXISTS public.configuracion_sistema (
  id TEXT PRIMARY KEY DEFAULT 'config_smtp',
  smtp_user TEXT,
  smtp_pass TEXT,
  smtp_host TEXT DEFAULT 'smtp.gmail.com',
  smtp_port INTEGER DEFAULT 587,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT
);

ALTER TABLE public.configuracion_sistema ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'configuracion_sistema' AND policyname = 'configuracion_sistema_policy_all'
  ) THEN
    CREATE POLICY "configuracion_sistema_policy_all"
      ON public.configuracion_sistema FOR ALL TO public USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'system_settings' AND policyname = 'system_settings_policy_all'
  ) THEN
    CREATE POLICY "system_settings_policy_all"
      ON public.system_settings FOR ALL TO public USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 8. STORAGE BUCKETS & POLICIES
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('peticiones', 'peticiones', true, NULL, NULL),
  ('miembros-consejo', 'miembros-consejo', true, NULL, NULL),
  ('juridico', 'juridico', true, NULL, NULL)
ON CONFLICT (id) DO UPDATE
SET
  public = true,
  file_size_limit = NULL,
  allowed_mime_types = NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'peticiones_update_all') THEN
    CREATE POLICY "peticiones_update_all" ON storage.objects FOR UPDATE TO public USING (bucket_id = 'peticiones') WITH CHECK (bucket_id = 'peticiones');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'peticiones_delete_all') THEN
    CREATE POLICY "peticiones_delete_all" ON storage.objects FOR DELETE TO public USING (bucket_id = 'peticiones');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'miembros_consejo_storage_select_all') THEN
    CREATE POLICY "miembros_consejo_storage_select_all" ON storage.objects FOR SELECT TO public USING (bucket_id = 'miembros-consejo');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'miembros_consejo_storage_insert_all') THEN
    CREATE POLICY "miembros_consejo_storage_insert_all" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'miembros-consejo');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'miembros_consejo_storage_update_all') THEN
    CREATE POLICY "miembros_consejo_storage_update_all" ON storage.objects FOR UPDATE TO public USING (bucket_id = 'miembros-consejo') WITH CHECK (bucket_id = 'miembros-consejo');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'miembros_consejo_storage_delete_all') THEN
    CREATE POLICY "miembros_consejo_storage_delete_all" ON storage.objects FOR DELETE TO public USING (bucket_id = 'miembros-consejo');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'juridico_storage_select_all') THEN
    CREATE POLICY "juridico_storage_select_all" ON storage.objects FOR SELECT TO public USING (bucket_id = 'juridico');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'juridico_storage_insert_all') THEN
    CREATE POLICY "juridico_storage_insert_all" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'juridico');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'juridico_storage_update_all') THEN
    CREATE POLICY "juridico_storage_update_all" ON storage.objects FOR UPDATE TO public USING (bucket_id = 'juridico') WITH CHECK (bucket_id = 'juridico');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'juridico_storage_delete_all') THEN
    CREATE POLICY "juridico_storage_delete_all" ON storage.objects FOR DELETE TO public USING (bucket_id = 'juridico');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
