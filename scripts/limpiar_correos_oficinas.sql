-- ==============================================================================
-- LIMPIEZA DE CORREOS EN TABLA OFICINAS (CONSERVAR SOLO PRUEBA 1 Y PRUEBA 2)
-- scripts/limpiar_correos_oficinas.sql
-- ==============================================================================

-- 1. Asegurar que las oficinas de prueba tengan sus correos asignados
UPDATE public.oficinas
SET email_institucional = 'taxxgameryt@gmail.com'
WHERE codigo = 'PRUEBA-1' OR nombre ILIKE '%prueba 1%';

UPDATE public.oficinas
SET email_institucional = 'oscargalindo.es@unitropico.edu.co'
WHERE codigo = 'PRUEBA-2' OR nombre ILIKE '%prueba 2%';

-- 2. Limpiar todos los correos institucionales de las demás oficinas (dejando solo el nombre)
UPDATE public.oficinas
SET email_institucional = NULL
WHERE codigo NOT IN ('PRUEBA-1', 'PRUEBA-2')
  AND nombre NOT ILIKE '%prueba%';

-- Verificar el catálogo actual
SELECT codigo, nombre, email_institucional, activo
FROM public.oficinas
ORDER BY 
  CASE WHEN codigo IN ('PRUEBA-1', 'PRUEBA-2') OR nombre ILIKE '%prueba%' THEN 0 ELSE 1 END,
  nombre;

