-- ====================================================================
-- SISTEMA DE GESTIÓN DOCUMENTAL (SGD) UNITRÓPICO
-- Script SQL Oficial: Aprovisionamiento del Superusuario Administrador
-- Correo: christianlemus.es@unitropico.edu.co
-- Contraseña inicial: Admin123
-- ====================================================================

-- 1. Habilitar extensión criptográfica
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 2. Desactivar temporalmente triggers de inmutabilidad de email para usr-root
ALTER TABLE public.profiles DISABLE TRIGGER trg_protect_profiles_email;
ALTER TABLE public.users DISABLE TRIGGER trg_protect_users_email;

-- 3. Limpieza de usuarios de prueba (mantener solo superusuario principal)
DELETE FROM public.user_permissions WHERE user_id != 'usr-root';
DELETE FROM public.profiles WHERE id != 'usr-root';
DELETE FROM public.users WHERE id != 'usr-root';

-- 4. Registrar o actualizar Superusuario en public.profiles
INSERT INTO public.profiles (
  id,
  email,
  full_name,
  role,
  cargo,
  is_provisional_password,
  created_at,
  updated_at
) VALUES (
  'usr-root',
  'christianlemus.es@unitropico.edu.co',
  'ING. Christian Lemus',
  'admin',
  'Superusuario Root / Sec. General',
  false,
  now(),
  now()
)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role,
  cargo = EXCLUDED.cargo,
  is_provisional_password = false,
  updated_at = now();

-- 5. Registrar o actualizar Superusuario en public.users
INSERT INTO public.users (
  id,
  name,
  email,
  role_id,
  role_title,
  initials,
  avatar_color,
  is_active,
  created_at,
  updated_at
) VALUES (
  'usr-root',
  'ING. Christian Lemus',
  'christianlemus.es@unitropico.edu.co',
  'admin',
  'Superusuario Root / Sec. General',
  'CL',
  '#00594E',
  true,
  now(),
  now()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  role_id = EXCLUDED.role_id,
  role_title = EXCLUDED.role_title,
  initials = EXCLUDED.initials,
  avatar_color = EXCLUDED.avatar_color,
  is_active = true,
  updated_at = now();

-- 6. Reactivar triggers de inmutabilidad
ALTER TABLE public.profiles ENABLE TRIGGER trg_protect_profiles_email;
ALTER TABLE public.users ENABLE TRIGGER trg_protect_users_email;

-- 7. Crear vista de compatibilidad 'perfiles'
CREATE OR REPLACE VIEW public.perfiles AS 
SELECT * FROM public.profiles;

-- 8. Asignar matriz total de permisos al Superusuario
DELETE FROM public.user_permissions WHERE user_id = 'usr-root';
INSERT INTO public.user_permissions (user_id, permission_id, is_granted, created_at)
SELECT 'usr-root', id, true, now() FROM public.permissions
ON CONFLICT DO NOTHING;

-- 9. Aprovisionamiento seguro en Supabase Auth (auth.users y auth.identities)
DO $$
DECLARE
  v_user_id uuid := 'e5b7b620-1a2f-48d6-953b-01a2f8d60001';
  v_encrypted_pw text := extensions.crypt('Admin123', extensions.gen_salt('bf', 10));
  v_email text := 'christianlemus.es@unitropico.edu.co';
  v_now timestamptz := now();
BEGIN
  -- Eliminar registros previos en auth si existieran
  DELETE FROM auth.identities WHERE email = v_email OR user_id = v_user_id;
  DELETE FROM auth.users WHERE email = v_email OR id = v_user_id;

  -- Insertar usuario en auth.users con contraseña encriptada (bcrypt)
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    v_email,
    v_encrypted_pw,
    v_now,
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"ING. Christian Lemus","role":"admin"}'::jsonb,
    v_now,
    v_now,
    '',
    '',
    '',
    ''
  );

  -- Insertar identidad correspondiente en auth.identities
  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email),
    'email',
    v_user_id::text,
    v_now,
    v_now,
    v_now
  );
END $$;
