-- supabase/migrations/0004_restructure_roles_and_peticiones.sql
-- ==========================================================================
-- SGD Unitrópico: Migración de Arquitectura, Roles Dinámicos y Módulo Peticiones
-- ==========================================================================

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==========================================================================
-- 1. REESTRUCTURACIÓN DE ROLES (ÚNICAMENTE 2 ROLES PRINCIPALES)
-- ==========================================================================
INSERT INTO public.roles (id, code, name, level, level_name, description, color, is_protected)
VALUES 
  ('admin', 'ADMIN', 'Administrador', 1, 'Nivel 1 (Total)', 'Acceso total al sistema, gestión de usuarios, proyectos y permisos dinámicos.', '#00594E', true),
  ('funcionario', 'FUNCIONARIO', 'Funcionario', 2, 'Nivel 2 (Operativo)', 'Acceso condicionado a los permisos dinámicos asignados por el Administrador.', '#B5A160', false)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  level = EXCLUDED.level,
  level_name = EXCLUDED.level_name,
  description = EXCLUDED.description,
  color = EXCLUDED.color,
  is_protected = EXCLUDED.is_protected;

-- Actualizar usuarios existentes al nuevo esquema de 2 roles
UPDATE public.users 
SET role_id = 'admin' 
WHERE role_id IN ('role-root', 'role-rector', 'admin');

UPDATE public.users 
SET role_id = 'funcionario' 
WHERE role_id NOT IN ('admin');

-- Deshabilitar roles obsoletos eliminando o marcando sin usuarios
DELETE FROM public.role_permissions WHERE role_id NOT IN ('admin', 'funcionario');
DELETE FROM public.roles WHERE id NOT IN ('admin', 'funcionario');

-- ==========================================================================
-- 2. TABLA DE PERMISOS DINÁMICOS POR USUARIO (user_permissions)
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.user_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    permission_id TEXT NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
    is_granted BOOLEAN DEFAULT TRUE,
    granted_by TEXT REFERENCES public.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_user_permission UNIQUE(user_id, permission_id)
);

-- ==========================================================================
-- 3. TABLA DE PERFILES DE USUARIO (PROFILES) Y PROTECCIÓN ESTRICTA DE EMAIL
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id TEXT PRIMARY KEY, -- id compatible con auth.users y public.users
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'funcionario')) DEFAULT 'funcionario',
    avatar_url TEXT,
    is_provisional_password BOOLEAN DEFAULT TRUE,
    phone TEXT,
    cargo TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sincronizar usuarios existentes en public.profiles
INSERT INTO public.profiles (id, email, full_name, role, avatar_url, is_provisional_password, cargo)
SELECT 
  u.id, 
  u.email, 
  u.name, 
  CASE WHEN u.role_id = 'admin' THEN 'admin' ELSE 'funcionario' END,
  NULL,
  FALSE,
  u.role_title
FROM public.users u
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role;

-- Trigger PL/pgSQL: Protección Estricta del Correo Electrónico
CREATE OR REPLACE FUNCTION fn_protect_user_email()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.email IS DISTINCT FROM OLD.email THEN
        RAISE EXCEPTION 'SEGURIDAD: El correo institucional (%) es inmutable y no puede modificarse.', OLD.email;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_profiles_email ON public.profiles;
CREATE TRIGGER trg_protect_profiles_email
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION fn_protect_user_email();

DROP TRIGGER IF EXISTS trg_protect_users_email ON public.users;
CREATE TRIGGER trg_protect_users_email
BEFORE UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION fn_protect_user_email();

-- ==========================================================================
-- 4. CATÁLOGO DE OFICINAS RESPONSABLES (OFICINAS)
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.oficinas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo TEXT UNIQUE NOT NULL,
    nombre TEXT UNIQUE NOT NULL,
    email_institucional TEXT NOT NULL,
    titular_cargo TEXT,
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Oficinas institucionales base
INSERT INTO public.oficinas (codigo, nombre, email_institucional, titular_cargo)
VALUES
  ('REC', 'Despacho de Rectoría', 'rectoria@unitropico.edu.co', 'Rector'),
  ('SEC-GEN', 'Secretaría General', 'secretaria.general@unitropico.edu.co', 'Secretario General'),
  ('OFI-JUR', 'Oficina Asesora Jurídica', 'juridica@unitropico.edu.co', 'Jefe Oficina Jurídica'),
  ('VIC-ACAD', 'Vicerrectoría Académica', 'viceacademica@unitropico.edu.co', 'Vicerrector Académico'),
  ('VIC-ADMIN', 'Vicerrectoría Administrativa y Financiera', 'vicefinanciera@unitropico.edu.co', 'Vicerrector Administrativo'),
  ('PLA-INST', 'Dirección de Planeación', 'planeacion@unitropico.edu.co', 'Director de Planeación'),
  ('CTRL-INT', 'Control Interno y Disciplinario', 'disciplinario@unitropico.edu.co', 'Jefe de Control Interno'),
  ('CORRESP', 'Gestión Documental y Correspondencia', 'correspondencia@unitropico.edu.co', 'Coordinador de Correspondencia'),
  ('ADM-REG', 'Admisiones, Registro y Control', 'admisiones@unitropico.edu.co', 'Director de Registro'),
  ('TAL-HUM', 'Dirección de Talento Humano', 'talentohumano@unitropico.edu.co', 'Director de Talento Humano'),
  ('BIEN-EST', 'Bienestar Universitario', 'bienestar@unitropico.edu.co', 'Director de Bienestar')
ON CONFLICT (nombre) DO UPDATE SET
  codigo = EXCLUDED.codigo,
  email_institucional = EXCLUDED.email_institucional,
  titular_cargo = EXCLUDED.titular_cargo;

-- ==========================================================================
-- 5. MÓDULO "SUBIR PETICIÓN" CON RADICADO SECUENCIAL Y REGLA DE LOS 5 DÍAS
-- ==========================================================================
CREATE SEQUENCE IF NOT EXISTS radicado_peticion_seq START 1;

CREATE TABLE IF NOT EXISTS public.peticiones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_radicado TEXT UNIQUE NOT NULL,
    asunto TEXT NOT NULL,
    descripcion TEXT,
    solicitante_nombre TEXT NOT NULL,
    solicitante_email TEXT,
    solicitante_tipo TEXT DEFAULT 'Ciudadano',
    categoria TEXT DEFAULT 'Petición General',
    prioridad VARCHAR(10) DEFAULT 'Media' CHECK (prioridad IN ('Alta', 'Media', 'Baja')),
    estado VARCHAR(20) DEFAULT 'En Trámite' CHECK (estado IN ('En Trámite', 'Revisión', 'Respondida', 'Vencida')),
    fecha_radicacion DATE DEFAULT CURRENT_DATE,
    fecha_limite_entrega DATE NOT NULL,
    fecha_limite_responsable DATE NOT NULL,
    storage_folder_path TEXT NOT NULL,
    creado_por TEXT REFERENCES public.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger PL/pgSQL: Cálculo automático de Radicado, 5 Días de Margen y Storage Path
CREATE OR REPLACE FUNCTION fn_peticion_before_insert()
RETURNS TRIGGER AS $$
DECLARE
    v_year TEXT;
    v_seq_num BIGINT;
BEGIN
    v_year := TO_CHAR(NOW(), 'YYYY');
    
    -- 1. Generación de Radicado Único si no viene establecido
    IF NEW.numero_radicado IS NULL OR NEW.numero_radicado = '' THEN
        v_seq_num := nextval('radicado_peticion_seq');
        NEW.numero_radicado := 'RAD-' || v_year || '-' || LPAD(v_seq_num::text, 5, '0');
    END IF;

    -- 2. REGLA ESTRICTA DE LOS 5 DÍAS:
    -- fecha_limite_responsable = fecha_limite_entrega - 5 días calendario
    NEW.fecha_limite_responsable := NEW.fecha_limite_entrega - INTERVAL '5 days';

    -- 3. Carpeta Virtual principal en Storage
    NEW.storage_folder_path := 'peticiones/' || NEW.numero_radicado || '/';

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_peticion_before_insert ON public.peticiones;
CREATE TRIGGER trg_peticion_before_insert
BEFORE INSERT ON public.peticiones
FOR EACH ROW
EXECUTE FUNCTION fn_peticion_before_insert();

-- ==========================================================================
-- 6. ASIGNACIÓN MULTI-RESPONSABLE Y CÓDIGOS ÚNICOS TEMPORALES
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.peticion_responsables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    peticion_id UUID NOT NULL REFERENCES public.peticiones(id) ON DELETE CASCADE,
    oficina_id UUID NOT NULL REFERENCES public.oficinas(id) ON DELETE RESTRICT,
    codigo_acceso TEXT UNIQUE NOT NULL,
    fecha_expiracion_codigo TIMESTAMPTZ NOT NULL,
    storage_subfolder_path TEXT NOT NULL,
    estado_entrega VARCHAR(20) DEFAULT 'Pendiente' CHECK (estado_entrega IN ('Pendiente', 'Entregado', 'Extemporáneo')),
    fecha_entrega TIMESTAMPTZ,
    observaciones_entrega TEXT,
    email_enviado_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_peticion_oficina UNIQUE (peticion_id, oficina_id)
);

-- Trigger PL/pgSQL: Generación de token único, subcarpeta y vigencia de 5 días
CREATE OR REPLACE FUNCTION fn_peticion_responsable_before_insert()
RETURNS TRIGGER AS $$
DECLARE
    v_radicado TEXT;
    v_fecha_limite_resp DATE;
    v_nombre_oficina TEXT;
    v_slug_oficina TEXT;
BEGIN
    -- Obtener datos de la petición
    SELECT numero_radicado, fecha_limite_responsable
    INTO v_radicado, v_fecha_limite_resp
    FROM public.peticiones
    WHERE id = NEW.peticion_id;

    -- Obtener nombre de la oficina
    SELECT nombre INTO v_nombre_oficina
    FROM public.oficinas
    WHERE id = NEW.oficina_id;

    -- Generar código único temporal si no viene definido
    IF NEW.codigo_acceso IS NULL OR NEW.codigo_acceso = '' THEN
        NEW.codigo_acceso := 'UPQ-' || UPPER(SUBSTRING(md5(random()::text || clock_timestamp()::text) FROM 1 FOR 8));
    END IF;

    -- La vigencia expira estrictamente a las 23:59:59 del día fecha_limite_responsable
    NEW.fecha_expiracion_codigo := (v_fecha_limite_resp::text || ' 23:59:59-05')::timestamptz;

    -- Subcarpeta virtual para esta oficina en el radicado
    v_slug_oficina := regexp_replace(lower(v_nombre_oficina), '[^a-z0-9_-]', '_', 'g');
    NEW.storage_subfolder_path := 'peticiones/' || v_radicado || '/' || v_slug_oficina || '/';

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_peticion_responsable_before_insert ON public.peticion_responsables;
CREATE TRIGGER trg_peticion_responsable_before_insert
BEFORE INSERT ON public.peticion_responsables
FOR EACH ROW
EXECUTE FUNCTION fn_peticion_responsable_before_insert();

-- ==========================================================================
-- 7. TABLA DE ANEXOS / SOPORTES DE PETICIÓN
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.peticion_anexos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    peticion_id UUID NOT NULL REFERENCES public.peticiones(id) ON DELETE CASCADE,
    peticion_responsable_id UUID REFERENCES public.peticion_responsables(id) ON DELETE SET NULL,
    nombre_archivo TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    tamano_bytes BIGINT,
    mime_type TEXT,
    subido_por_email TEXT NOT NULL,
    es_anexo_oficina BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================================================
-- 8. RPC: VALIDACIÓN DE ACCESO AL PORTAL EXTERNO (LOGIN CON CÓDIGO ÚNICO)
-- ==========================================================================
CREATE OR REPLACE FUNCTION fn_validar_acceso_portal(
    p_email TEXT,
    p_codigo TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_record RECORD;
    v_ahora TIMESTAMPTZ := NOW();
BEGIN
    -- Limpieza de parámetros
    p_email := LOWER(TRIM(p_email));
    p_codigo := UPPER(TRIM(p_codigo));

    -- Buscar asignación activa
    SELECT 
        pr.id AS responsable_id,
        pr.peticion_id,
        pr.codigo_acceso,
        pr.fecha_expiracion_codigo,
        pr.storage_subfolder_path,
        pr.estado_entrega,
        o.nombre AS oficina_nombre,
        o.email_institucional,
        p.numero_radicado,
        p.asunto AS peticion_asunto,
        p.descripcion AS peticion_descripcion,
        p.fecha_limite_entrega,
        p.fecha_limite_responsable
    INTO v_record
    FROM public.peticion_responsables pr
    JOIN public.oficinas o ON pr.oficina_id = o.id
    JOIN public.peticiones p ON pr.peticion_id = p.id
    WHERE LOWER(o.email_institucional) = p_email
      AND UPPER(pr.codigo_acceso) = p_codigo;

    -- Validar si la combinación existe
    IF v_record IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'INVALID_CREDENTIALS',
            'message', 'El correo de oficina o el código de acceso temporal no coinciden con ninguna asignación activa.'
        );
    END IF;

    -- Validar regla de los 5 días / expiración estricta
    IF v_ahora > v_record.fecha_expiracion_codigo THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'EXPIRED_DEADLINE',
            'message', 'El plazo de entrega para esta oficina ha expirado (límite: ' || TO_CHAR(v_record.fecha_limite_responsable, 'DD/MM/YYYY') || '). No se reciben anexos dentro de los últimos 5 días previos al cierre.',
            'radicado', v_record.numero_radicado,
            'fecha_limite_responsable', v_record.fecha_limite_responsable
        );
    END IF;

    -- Acceso autorizado
    RETURN jsonb_build_object(
        'success', true,
        'responsable_id', v_record.responsable_id,
        'peticion_id', v_record.peticion_id,
        'numero_radicado', v_record.numero_radicado,
        'oficina_nombre', v_record.oficina_nombre,
        'email_institucional', v_record.email_institucional,
        'asunto', v_record.peticion_asunto,
        'descripcion', v_record.peticion_descripcion,
        'fecha_limite_responsable', v_record.fecha_limite_responsable,
        'fecha_limite_entrega', v_record.fecha_limite_entrega,
        'storage_subfolder_path', v_record.storage_subfolder_path,
        'estado_entrega', v_record.estado_entrega
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================================================
-- 9. CONFIGURACIÓN DE BUCKETS EN SUPABASE STORAGE
-- ==========================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('avatars', 'avatars', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  ('peticiones', 'peticiones', false, 52428800, ARRAY['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'image/jpeg', 'image/png', 'application/zip'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
