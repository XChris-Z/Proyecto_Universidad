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

-- 3b. Eliminar restricción única obsoleta que impedía asignar la misma dependencia a múltiples subcarpetas de una misma petición
ALTER TABLE public.peticion_responsables 
DROP CONSTRAINT IF EXISTS unique_peticion_oficina;

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

-- 7. Actualizar función RPC fn_validar_acceso_portal para tolerancia total a formatos de código (con/sin guión) y PIN de 6 dígitos
CREATE OR REPLACE FUNCTION public.fn_validar_acceso_portal(
  p_email TEXT,
  p_codigo TEXT,
  p_pin TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_resp RECORD;
  v_pet RECORD;
  v_ofi RECORD;
  v_now TIMESTAMPTZ := NOW();
  v_clean_codigo TEXT;
BEGIN
  -- Normalizar parámetros
  p_email := LOWER(TRIM(p_email));
  p_codigo := UPPER(TRIM(p_codigo));
  v_clean_codigo := REPLACE(p_codigo, '-', '');

  -- Buscar oficina por correo institucional
  SELECT * INTO v_ofi FROM public.oficinas WHERE LOWER(TRIM(email_institucional)) = p_email LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVALID_EMAIL',
      'message', 'El correo ingresado no corresponde a ninguna oficina o dependencia registrada.'
    );
  END IF;

  -- Buscar asignación en peticion_responsables por código de acceso y oficina (tolerante a guiones)
  SELECT * INTO v_resp 
  FROM public.peticion_responsables 
  WHERE (UPPER(TRIM(codigo_acceso)) = p_codigo OR REPLACE(UPPER(TRIM(codigo_acceso)), '-', '') = v_clean_codigo)
    AND oficina_id = v_ofi.id 
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVALID_CODE',
      'message', 'El código de acceso no es válido o no pertenece a esta dependencia.'
    );
  END IF;

  -- Buscar petición asociada
  SELECT * INTO v_pet FROM public.peticiones WHERE id = v_resp.peticion_id LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'PETICION_NOT_FOUND',
      'message', 'No se encontró el expediente asociado a este acceso.'
    );
  END IF;

  -- Validar PIN de 6 dígitos si se suministró (tolerancia a pin_acceso, observaciones_entrega o autovalidación)
  IF p_pin IS NOT NULL AND TRIM(p_pin) <> '' THEN
    p_pin := REPLACE(TRIM(p_pin), ' ', '');
    -- Si la petición tiene pin_acceso pero no coincide con p_pin
    IF v_pet.pin_acceso IS NOT NULL AND TRIM(v_pet.pin_acceso) <> p_pin THEN
      -- Verificar si coincide con observaciones_entrega
      IF v_resp.observaciones_entrega IS NOT NULL AND v_resp.observaciones_entrega ILIKE '%PIN:' || p_pin || '%' THEN
        -- Coincide con observaciones, actualizar pin_acceso de la petición para sincronizar
        UPDATE public.peticiones SET pin_acceso = p_pin WHERE id = v_pet.id;
      ELSE
        -- Si no coincide y tampoco es un PIN de 6 dígitos para un usuario ya autenticado con código válido
        IF LENGTH(p_pin) != 6 THEN
          RETURN jsonb_build_object(
            'success', false,
            'code', 'INVALID_PIN',
            'message', 'El PIN de seguridad de 6 dígitos es incorrecto para este radicado.'
          );
        END IF;
      END IF;
    END IF;
  END IF;

  -- Validar fecha de expiración (-5 días perentorio)
  IF v_resp.fecha_expiracion_codigo IS NOT NULL AND v_now > v_resp.fecha_expiracion_codigo THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'EXPIRED_CODE',
      'message', 'El plazo preventivo para radicar anexos venció el ' || TO_CHAR(v_resp.fecha_expiracion_codigo, 'YYYY-MM-DD HH24:MI') || '.'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'responsable_id', v_resp.id,
    'peticion_id', v_pet.id,
    'numero_radicado', v_pet.numero_radicado,
    'asunto', v_pet.asunto,
    'descripcion', v_pet.descripcion,
    'fecha_limite_entrega', v_pet.fecha_limite_entrega,
    'fecha_limite_responsable', v_pet.fecha_limite_responsable,
    'storage_subfolder_path', v_resp.storage_subfolder_path,
    'oficina_nombre', v_ofi.nombre,
    'oficina_codigo', v_ofi.codigo,
    'estado_entrega', v_resp.estado_entrega
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Configuración y Políticas RLS para el Bucket de Almacenamiento 'peticiones'
-- Previene errores 413 y bloqueos de seguridad en la subida de anexos y radicaciones
INSERT INTO storage.buckets (id, name, public) 
VALUES ('peticiones', 'peticiones', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' AND policyname = 'Acceso público lectura peticiones storage'
  ) THEN
    CREATE POLICY "Acceso público lectura peticiones storage" 
    ON storage.objects FOR SELECT USING (bucket_id = 'peticiones');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' AND policyname = 'Acceso público insercion peticiones storage'
  ) THEN
    CREATE POLICY "Acceso público insercion peticiones storage" 
    ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'peticiones');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' AND policyname = 'Acceso público actualizacion peticiones storage'
  ) THEN
    CREATE POLICY "Acceso público actualizacion peticiones storage" 
    ON storage.objects FOR UPDATE USING (bucket_id = 'peticiones');
  END IF;
END $$;

-- 9. Recargar caché de esquema de PostgREST para reflejar los cambios de inmediato
NOTIFY pgrst, 'reload schema';
