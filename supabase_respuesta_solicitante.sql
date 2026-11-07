-- Migración para el Módulo de "Enviar Respuesta al Solicitante"
-- Habilita el cierre del ciclo documental y portal temporal (10 días) en /consulta-respuesta

ALTER TABLE public.peticiones
  ADD COLUMN IF NOT EXISTS respuesta_mensaje TEXT,
  ADD COLUMN IF NOT EXISTS respuesta_funcionario TEXT,
  ADD COLUMN IF NOT EXISTS respuesta_fecha_envio TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS respuesta_expira_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS respuesta_pin_solicitante TEXT,
  ADD COLUMN IF NOT EXISTS respuesta_archivos_incluidos JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS respuesta_drive_url TEXT;

COMMENT ON COLUMN public.peticiones.respuesta_mensaje IS 'Texto oficial de la respuesta emitida por el funcionario al solicitante';
COMMENT ON COLUMN public.peticiones.respuesta_funcionario IS 'Nombre o cargo del funcionario que emitió la respuesta';
COMMENT ON COLUMN public.peticiones.respuesta_fecha_envio IS 'Fecha y hora en que se despachó la respuesta oficial';
COMMENT ON COLUMN public.peticiones.respuesta_expira_at IS 'Fecha límite de expiración para la consulta del expediente (10 días calendario)';
COMMENT ON COLUMN public.peticiones.respuesta_pin_solicitante IS 'Código o PIN de 6 dígitos para que el solicitante desbloquee su expediente en /consulta-respuesta';
COMMENT ON COLUMN public.peticiones.respuesta_archivos_incluidos IS 'Array JSON con los IDs de archivos autorizados para descarga en el portal del solicitante';
COMMENT ON COLUMN public.peticiones.respuesta_drive_url IS 'Enlace complementario a carpeta externa o Drive si aplica';

-- 2. Recargar de inmediato el caché de esquema de PostgREST para exponer las nuevas columnas
NOTIFY pgrst, 'reload schema';

