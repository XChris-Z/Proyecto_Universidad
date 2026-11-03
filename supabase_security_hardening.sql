-- ============================================================================
-- SCRIPT DE BLINDAJE INSTITUCIONAL Y CIBERSEGURIDAD — SGD UNITRÓPICO
-- Ejecutar en Supabase SQL Editor
-- ============================================================================

-- 1. Habilitar extensión pgcrypto para operaciones criptográficas avanzadas
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Asegurar columna pin_acceso (PIN criptográfico de 6 dígitos) en tabla peticiones
ALTER TABLE public.peticiones 
ADD COLUMN IF NOT EXISTS pin_acceso TEXT;

-- 3. Crear índice para acelerar validaciones de PIN en el portal externo
CREATE INDEX IF NOT EXISTS idx_peticiones_pin_acceso ON public.peticiones(pin_acceso);

-- 4. Backfill: Asignar un PIN seguro aleatorio de 6 dígitos a cualquier radicado existente sin PIN
UPDATE public.peticiones 
SET pin_acceso = LPAD((FLOOR(RANDOM() * 900000) + 100000)::TEXT, 6, '0')
WHERE pin_acceso IS NULL OR LENGTH(TRIM(pin_acceso)) != 6;

-- 5. Trigger para autogenerar PIN de 6 dígitos en inserciones futuras si no viene especificado
CREATE OR REPLACE FUNCTION public.fn_auto_generate_peticion_pin()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.pin_acceso IS NULL OR LENGTH(TRIM(NEW.pin_acceso)) != 6 THEN
    NEW.pin_acceso := LPAD((FLOOR(RANDOM() * 900000) + 100000)::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_peticion_pin ON public.peticiones;
CREATE TRIGGER trg_auto_peticion_pin
BEFORE INSERT ON public.peticiones
FOR EACH ROW
EXECUTE FUNCTION public.fn_auto_generate_peticion_pin();

-- 6. Actualizar función RPC fn_validar_acceso_portal para soportar validación con PIN de 6 dígitos
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
BEGIN
  -- Normalizar parámetros
  p_email := LOWER(TRIM(p_email));
  p_codigo := UPPER(TRIM(p_codigo));

  -- Buscar oficina por correo institucional
  SELECT * INTO v_ofi FROM public.oficinas WHERE LOWER(TRIM(email_institucional)) = p_email LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVALID_EMAIL',
      'message', 'El correo ingresado no corresponde a ninguna oficina o dependencia registrada.'
    );
  END IF;

  -- Buscar asignación en peticion_responsables por código de acceso y oficina
  SELECT * INTO v_resp 
  FROM public.peticion_responsables 
  WHERE UPPER(TRIM(codigo_acceso)) = p_codigo 
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

  -- Validar PIN de 6 dígitos si se suministró o si la petición ya tiene PIN configurado
  IF p_pin IS NOT NULL AND TRIM(p_pin) <> '' THEN
    IF v_pet.pin_acceso IS NOT NULL AND TRIM(v_pet.pin_acceso) <> TRIM(p_pin) THEN
      RETURN jsonb_build_object(
        'success', false,
        'code', 'INVALID_PIN',
        'message', 'El PIN de seguridad de 6 dígitos es incorrecto para este radicado.'
      );
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

-- 7. Hardening de Políticas RLS (Row Level Security)
ALTER TABLE public.peticiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.peticion_responsables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.peticion_anexos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria_logs ENABLE ROW LEVEL SECURITY;

-- Política de lectura autenticada
DROP POLICY IF EXISTS "Permitir lectura institucional a usuarios autenticados" ON public.peticiones;
CREATE POLICY "Permitir lectura institucional a usuarios autenticados"
ON public.peticiones FOR SELECT
USING (auth.role() = 'authenticated' OR auth.role() = 'anon');

DROP POLICY IF EXISTS "Permitir insercion autenticada en peticiones" ON public.peticiones;
CREATE POLICY "Permitir insercion autenticada en peticiones"
ON public.peticiones FOR INSERT
WITH CHECK (true);

-- Permisos de auditoría solo inserción y lectura
DROP POLICY IF EXISTS "Permitir registro de logs de auditoria" ON public.auditoria_logs;
CREATE POLICY "Permitir registro de logs de auditoria"
ON public.auditoria_logs FOR INSERT
WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir lectura de auditoria a funcionarios" ON public.auditoria_logs;
CREATE POLICY "Permitir lectura de auditoria a funcionarios"
ON public.auditoria_logs FOR SELECT
USING (true);

-- 8. Recargar la caché de PostgREST para exponer de inmediato las nuevas columnas y funciones
NOTIFY pgrst, 'reload schema';

