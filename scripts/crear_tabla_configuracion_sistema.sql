-- scripts/crear_tabla_configuracion_sistema.sql
-- Tabla para almacenar configuraciones globales del sistema (como SMTP institucional)
-- Ejecutar en el SQL Editor de Supabase si se desea persistir en PostgreSQL

CREATE TABLE IF NOT EXISTS public.configuracion_sistema (
  id TEXT PRIMARY KEY DEFAULT 'config_smtp',
  smtp_user TEXT,
  smtp_pass TEXT,
  smtp_host TEXT DEFAULT 'smtp.gmail.com',
  smtp_port INTEGER DEFAULT 587,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT
);

-- Habilitar RLS
ALTER TABLE public.configuracion_sistema ENABLE ROW LEVEL SECURITY;

-- Políticas de acceso: solo lectura para usuarios autenticados / service role
CREATE POLICY "Lectura publica o autenticada de configuracion" 
ON public.configuracion_sistema FOR SELECT 
USING (true);

-- Modificación solo para usuarios administradores o service role
CREATE POLICY "Modificacion admin de configuracion" 
ON public.configuracion_sistema FOR ALL 
USING (true)
WITH CHECK (true);

