-- Migration: 0005_miembros_consejo_and_asuntos_juridicos.sql
-- Creado para la especificación integral de Cuerpos Colegiados, Miembros de Consejo y Asuntos Jurídicos.

-- 1. Tabla de Miembros de Consejo
CREATE TABLE IF NOT EXISTS miembros_consejo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cuerpo_colegiado TEXT NOT NULL,
  nombre_completo TEXT NOT NULL,
  cargo_calidad TEXT NOT NULL,
  correo TEXT,
  foto_url TEXT,                  -- Opcional (Supabase Storage)
  fecha_inicio DATE NOT NULL,     -- Periodo manual de inicio
  fecha_fin DATE NOT NULL,        -- Periodo manual de finalización / caducidad
  estado TEXT NOT NULL DEFAULT 'activo', -- 'activo' | 'inactivo'
  acta_inicio_url TEXT,           -- Archivo acta de inicio / designación / posesión
  acta_inicio_nombre TEXT,
  razon_cambio TEXT,              -- Motivo de cambio, reemplazo o retiro
  acta_cambio_url TEXT,           -- Archivo soporte del cambio / reemplazo
  acta_cambio_nombre TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_miembros_colegiado ON miembros_consejo(cuerpo_colegiado);
CREATE INDEX IF NOT EXISTS idx_miembros_estado ON miembros_consejo(estado);
CREATE INDEX IF NOT EXISTS idx_miembros_fecha_fin ON miembros_consejo(fecha_fin);

-- 2. Tablas de Asuntos Jurídicos (Jerárquico + Búsqueda Profunda Full-Text)
CREATE TABLE IF NOT EXISTS juridico_carpetas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria_raiz TEXT NOT NULL CHECK (categoria_raiz IN ('conceptos_internos', 'litigios_judiciales', 'auditoria_entes_control')),
  parent_id UUID REFERENCES juridico_carpetas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  tema TEXT,                          -- Ej: 'Contratación', 'Talento Humano', 'Tutelas', 'Contraloría'
  anio INTEGER,                       -- Ej: 2021..2026 (opcional por carpeta)
  descripcion TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS juridico_documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria_raiz TEXT NOT NULL CHECK (categoria_raiz IN ('conceptos_internos', 'litigios_judiciales', 'auditoria_entes_control')),
  carpeta_id UUID REFERENCES juridico_carpetas(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  tema TEXT,                          -- Tema jurídico o administrativo
  anio INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM now())::INT,
  palabras_clave TEXT,                -- Etiquetas / radicado / partes / número de proceso
  descripcion TEXT,
  archivo_url TEXT NOT NULL,
  archivo_nombre TEXT NOT NULL,
  archivo_tamano BIGINT,
  contenido_extraido TEXT DEFAULT '', -- Texto plano extraído automáticamente del archivo (PDF/DOCX/TXT)
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

CREATE INDEX IF NOT EXISTS idx_juridico_doc_search ON juridico_documentos USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_juridico_doc_anio_tema ON juridico_documentos (categoria_raiz, anio, tema);
CREATE INDEX IF NOT EXISTS idx_juridico_carpetas_cat ON juridico_carpetas (categoria_raiz, parent_id);

-- 3. Extensiones y compatibilidad en peticiones y colegiados_normas
ALTER TABLE IF EXISTS peticiones ADD COLUMN IF NOT EXISTS drive_folder_id TEXT;
ALTER TABLE IF EXISTS peticiones ADD COLUMN IF NOT EXISTS drive_folder_url TEXT;

ALTER TABLE IF EXISTS colegiados_normas ADD COLUMN IF NOT EXISTS anio INTEGER;
ALTER TABLE IF EXISTS colegiados_normas ADD COLUMN IF NOT EXISTS cuerpo_colegiado TEXT;
ALTER TABLE IF EXISTS colegiados_normas ADD COLUMN IF NOT EXISTS tipo_acto TEXT;
ALTER TABLE IF EXISTS colegiados_normas ADD COLUMN IF NOT EXISTS numero_acto TEXT;
ALTER TABLE IF EXISTS colegiados_normas ADD COLUMN IF NOT EXISTS fecha_expedicion DATE;
ALTER TABLE IF EXISTS colegiados_normas ADD COLUMN IF NOT EXISTS asunto TEXT;
ALTER TABLE IF EXISTS colegiados_normas ADD COLUMN IF NOT EXISTS archivo_url TEXT;
ALTER TABLE IF EXISTS colegiados_normas ADD COLUMN IF NOT EXISTS archivo_nombre TEXT;
