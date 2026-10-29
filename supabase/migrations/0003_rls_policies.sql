-- supabase/migrations/0003_rls_policies.sql
-- ==========================================================================
-- SGD Unitrópico - Políticas de Seguridad de Fila (RLS) en PostgreSQL
-- ==========================================================================

-- Habilitar RLS en todas las tablas sensibles
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 1. Políticas para Documents:
-- Lectura pública para usuarios autenticados
CREATE POLICY "Permitir lectura de documentos a usuarios autenticados"
ON public.documents
FOR SELECT
TO authenticated
USING (true);

-- Inserción permitida a usuarios con rol operativo o superior
CREATE POLICY "Permitir radicación de expedientes"
ON public.documents
FOR INSERT
TO authenticated
WITH CHECK (
    public.check_user_permission(auth.uid()::text, 'upload_files')
);

-- Modificación permitida al responsable o administradores
CREATE POLICY "Permitir actualización de expedientes"
ON public.documents
FOR UPDATE
TO authenticated
USING (
    responsible_id = auth.uid()::text
    OR public.check_user_permission(auth.uid()::text, 'reassign_files')
);

-- 2. Políticas para Audit Logs:
-- Solo lectura para administradores / superusuarios
CREATE POLICY "Lectura estricta de auditoría para administradores"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.users u
        JOIN public.roles r ON u.role_id = r.id
        WHERE u.id = auth.uid()::text AND r.code IN ('root', 'admin')
    )
);

-- Prohibir cualquier actualización o eliminación manual de logs de auditoría (Inmutabilidad)
CREATE POLICY "Inmutabilidad de logs - Prohibido UPDATE"
ON public.audit_logs
FOR UPDATE
TO authenticated
USING (false);

CREATE POLICY "Inmutabilidad de logs - Prohibido DELETE"
ON public.audit_logs
FOR DELETE
TO authenticated
USING (false);

