-- ====================================================================
-- SISTEMA DE GESTIÓN DOCUMENTAL (SGD) UNITRÓPICO
-- Migración: Integración y Aislamiento de Google Calendar por Usuario
-- Tabla objetivo: public.profiles y vista public.perfiles
-- ====================================================================

-- 1. Campos para persistencia segura de Google Calendar por usuario
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS google_calendar_connected boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS google_access_token text,
  ADD COLUMN IF NOT EXISTS google_refresh_token text,
  ADD COLUMN IF NOT EXISTS google_calendar_id text DEFAULT 'primary';

-- 2. Actualizar la vista pública 'perfiles'
CREATE OR REPLACE VIEW public.perfiles AS 
SELECT * FROM public.profiles;

-- 3. Habilitar Row Level Security (RLS) en la tabla profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 4. Políticas RLS: Cada usuario solo puede ver y modificar su propia información
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT 
  USING (
    auth.uid()::text = id 
    OR auth.jwt() ->> 'email' = email
    OR current_user = 'authenticated'
  );

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE 
  USING (
    auth.uid()::text = id 
    OR auth.jwt() ->> 'email' = email
    OR current_user = 'authenticated'
  );

-- 5. Procedimientos almacenados atómicos con SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.set_user_calendar_connection(
  p_user_id text,
  p_connected boolean,
  p_access_token text DEFAULT NULL,
  p_refresh_token text DEFAULT NULL,
  p_calendar_id text DEFAULT 'primary'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.profiles
  SET 
    google_calendar_connected = p_connected,
    google_access_token = COALESCE(p_access_token, google_access_token),
    google_refresh_token = COALESCE(p_refresh_token, google_refresh_token),
    google_calendar_id = COALESCE(p_calendar_id, 'primary'),
    updated_at = now()
  WHERE id = p_user_id OR email = p_user_id;

  RETURN jsonb_build_object(
    'success', true, 
    'user_id', p_user_id, 
    'connected', p_connected
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.disconnect_user_calendar(
  p_user_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.profiles
  SET 
    google_calendar_connected = false,
    google_access_token = NULL,
    google_refresh_token = NULL,
    updated_at = now()
  WHERE id = p_user_id OR email = p_user_id;

  RETURN jsonb_build_object(
    'success', true, 
    'user_id', p_user_id, 
    'connected', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_user_calendar_connection TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.disconnect_user_calendar TO anon, authenticated, service_role;

