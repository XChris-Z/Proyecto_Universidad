-- scripts/migration_peticiones_oficinas.sql
-- ==============================================================================
-- MIGRACIÓN: AJUSTES EN TABLA PETICIONES Y REGISTRO DE OFICINAS DE PRUEBA
-- ==============================================================================

-- 1. Permitir que la descripción sea opcional (nullable) y agregar campo de instrucciones de anexos
ALTER TABLE public.peticiones 
  ALTER COLUMN descripcion DROP NOT NULL;

ALTER TABLE public.peticiones 
  ADD COLUMN IF NOT EXISTS instrucciones_anexos text;

COMMENT ON COLUMN public.peticiones.instrucciones_anexos IS 
  'Instrucciones específicas o requerimiento de anexos dirigidos a los responsables en el correo formal';

-- 2. Asegurar que existan las 2 oficinas de prueba con sus respectivos correos electrónicos
-- Prueba 1 -> taxxgameryt@gmail.com
-- Prueba 2 -> oscargalindo.es@unitropico.edu.co

INSERT INTO public.oficinas (codigo, nombre, email_institucional, titular_cargo, activo)
VALUES 
  ('PRUEBA-1', 'Prueba 1', 'taxxgameryt@gmail.com', 'Responsable de Pruebas 1', true),
  ('PRUEBA-2', 'Prueba 2', 'oscargalindo.es@unitropico.edu.co', 'Responsable de Pruebas 2', true)
ON CONFLICT (codigo) DO UPDATE 
SET 
  nombre = EXCLUDED.nombre,
  email_institucional = EXCLUDED.email_institucional,
  titular_cargo = EXCLUDED.titular_cargo,
  activo = true;

-- 3. Habilitar permisos RLS para lectura en oficinas
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'oficinas' AND policyname = 'Permitir lectura publica o autenticada de oficinas'
  ) THEN
    CREATE POLICY "Permitir lectura publica o autenticada de oficinas" 
      ON public.oficinas FOR SELECT 
      USING (true);
  END IF;
END $$;

