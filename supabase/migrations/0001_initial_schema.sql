-- supabase/migrations/0001_initial_schema.sql
-- ==========================================================================
-- SGD Unitrópico - Esquema Inicial de Base de Datos PostgreSQL
-- ==========================================================================

-- Extensión UUID y Criptografía
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Tabla de Permisos
CREATE TABLE IF NOT EXISTS public.permissions (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL CHECK (category IN ('Consulta', 'Operación', 'Gestión', 'Configuración', 'Seguridad')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabla de Roles Institucionales
CREATE TABLE IF NOT EXISTS public.roles (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    level INTEGER NOT NULL,
    level_name TEXT NOT NULL,
    description TEXT,
    color TEXT NOT NULL DEFAULT '#0284c7',
    is_protected BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabla Intermedia Rol-Permisos
CREATE TABLE IF NOT EXISTS public.role_permissions (
    role_id TEXT REFERENCES public.roles(id) ON DELETE CASCADE,
    permission_id TEXT REFERENCES public.permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- 4. Tabla de Dependencias
CREATE TABLE IF NOT EXISTS public.dependencias (
    id TEXT PRIMARY KEY,
    codigo TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    nivel TEXT NOT NULL,
    jefe TEXT NOT NULL,
    jefe_cargo TEXT NOT NULL,
    correo TEXT NOT NULL,
    ext TEXT,
    color TEXT NOT NULL DEFAULT '#00594E',
    competencias TEXT,
    archivos_activos INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Tabla de Usuarios Institucionales
CREATE TABLE IF NOT EXISTS public.users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role_title TEXT NOT NULL,
    role_id TEXT REFERENCES public.roles(id),
    dependencia_id TEXT REFERENCES public.dependencias(id),
    email TEXT UNIQUE NOT NULL,
    initials VARCHAR(4) NOT NULL,
    avatar_color TEXT NOT NULL DEFAULT '#00594E',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Tabla de Documentos y Expedientes
CREATE TABLE IF NOT EXISTS public.documents (
    id TEXT PRIMARY KEY DEFAULT ('doc-' || SUBSTRING(gen_random_uuid()::text, 1, 8)),
    radicado TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    origin_right TEXT,
    applicant TEXT NOT NULL,
    applicant_type TEXT,
    sla_days INTEGER NOT NULL DEFAULT 15,
    file_name TEXT,
    format VARCHAR(10) DEFAULT 'pdf',
    size VARCHAR(20),
    upload_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE NOT NULL,
    responsible_id TEXT REFERENCES public.users(id),
    priority VARCHAR(10) NOT NULL CHECK (priority IN ('Alta', 'Media', 'Baja')),
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'En Trámite',
    response_status VARCHAR(20) NOT NULL DEFAULT 'pendiente' CHECK (response_status IN ('pendiente', 'respondida')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Tabla de Respuestas a Documentos / Peticiones
CREATE TABLE IF NOT EXISTS public.document_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id TEXT REFERENCES public.documents(id) ON DELETE CASCADE,
    radicado TEXT UNIQUE NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    subject TEXT NOT NULL,
    template_title TEXT,
    decision TEXT NOT NULL,
    content TEXT NOT NULL,
    responded_by TEXT REFERENCES public.users(id),
    signed_name TEXT NOT NULL,
    signed_role TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Tabla de Normas y Cuerpos Colegiados
CREATE TABLE IF NOT EXISTS public.colegiados_normas (
    id TEXT PRIMARY KEY,
    organo TEXT NOT NULL,
    organo_code VARCHAR(20) NOT NULL CHECK (organo_code IN ('csu', 'ca', 'rectoria', 'electoral')),
    tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('Acuerdo', 'Resolución', 'Circular')),
    numero VARCHAR(20) NOT NULL,
    year VARCHAR(4) NOT NULL,
    fecha DATE NOT NULL,
    titulo TEXT NOT NULL,
    descriptor TEXT,
    vigencia VARCHAR(20) DEFAULT 'vigente',
    resumen TEXT,
    signatarios TEXT,
    file_download TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Tabla de Convenios Institucionales
CREATE TABLE IF NOT EXISTS public.convenios (
    id TEXT PRIMARY KEY,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('gubernamental', 'internacional', 'nacional')),
    tipo_label TEXT NOT NULL,
    numero VARCHAR(50) NOT NULL,
    entidad TEXT NOT NULL,
    objeto TEXT NOT NULL,
    inicio DATE NOT NULL,
    fin DATE NOT NULL,
    cuantia TEXT,
    supervisor TEXT,
    estado VARCHAR(30) DEFAULT 'Activo / En Ejecución',
    archivo_minuta TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Tabla de Auditoría Inmutable (Blockchain-style chained hashes)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id TEXT PRIMARY KEY DEFAULT ('alog-' || EXTRACT(EPOCH FROM NOW())::BIGINT),
    raw_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actor_id TEXT REFERENCES public.users(id),
    actor_name TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    action TEXT NOT NULL,
    action_type VARCHAR(30) NOT NULL,
    entity TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    details TEXT NOT NULL,
    before_state JSONB,
    after_state JSONB,
    severity VARCHAR(10) NOT NULL CHECK (severity IN ('INFO', 'WARN', 'CRITICAL')),
    previous_hash VARCHAR(64) NOT NULL,
    integrity_hash VARCHAR(64) NOT NULL,
    ip_address INET DEFAULT '127.0.0.1',
    cipher VARCHAR(50) DEFAULT 'AES-256-GCM / SHA-256'
);

-- Índices de Rendimiento
CREATE INDEX IF NOT EXISTS idx_documents_due_date ON public.documents(due_date);
CREATE INDEX IF NOT EXISTS idx_documents_category ON public.documents(category);
CREATE INDEX IF NOT EXISTS idx_documents_responsible ON public.documents(responsible_id);
CREATE INDEX IF NOT EXISTS idx_audit_raw_timestamp ON public.audit_logs(raw_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_integrity_hash ON public.audit_logs(integrity_hash);

