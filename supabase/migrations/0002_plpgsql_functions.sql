-- supabase/migrations/0002_plpgsql_functions.sql
-- ==========================================================================
-- SGD Unitrópico - Funciones y Procedimientos Almacenados en PL/pgSQL
-- ==========================================================================

-- 1. Función RPC: Obtener Estadísticas Centrales del Dashboard
CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_docs INT;
    v_pending_docs INT;
    v_urgent_docs INT;
    v_total_petitions INT;
    v_active_csu INT;
    v_result JSONB;
BEGIN
    SELECT COUNT(*) INTO v_total_docs FROM public.documents;
    
    SELECT COUNT(*) INTO v_pending_docs 
    FROM public.documents 
    WHERE response_status = 'pendiente';
    
    SELECT COUNT(*) INTO v_urgent_docs 
    FROM public.documents 
    WHERE response_status = 'pendiente' 
      AND due_date <= (CURRENT_DATE + INTERVAL '3 days');

    SELECT COUNT(*) INTO v_total_petitions 
    FROM public.documents 
    WHERE category = 'Derecho de Petición';

    SELECT COUNT(*) INTO v_active_csu 
    FROM public.colegiados_normas 
    WHERE organo_code = 'csu' AND vigencia = 'vigente';

    v_result := jsonb_build_object(
        'totalDocuments', v_total_docs,
        'pendingDocuments', v_pending_docs,
        'urgentDocuments', v_urgent_docs,
        'totalPetitions', v_total_petitions,
        'activeCsuNormas', v_active_csu,
        'generatedAt', NOW()
    );

    RETURN v_result;
END;
$$;

-- 2. Función RPC: Verificar si un usuario tiene un permiso específico (RBAC)
CREATE OR REPLACE FUNCTION public.check_user_permission(
    p_user_id TEXT,
    p_permission_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_role_code TEXT;
    v_has_perm BOOLEAN := FALSE;
BEGIN
    -- Obtener código de rol del usuario
    SELECT r.code INTO v_role_code
    FROM public.users u
    JOIN public.roles r ON u.role_id = r.id
    WHERE u.id = p_user_id;

    -- Si es root, acceso total irrestricto
    IF v_role_code = 'root' THEN
        RETURN TRUE;
    END IF;

    -- Validar si el rol tiene el permiso asignado
    SELECT EXISTS (
        SELECT 1
        FROM public.role_permissions rp
        JOIN public.users u ON u.role_id = rp.role_id
        WHERE u.id = p_user_id AND rp.permission_id = p_permission_id
    ) INTO v_has_perm;

    RETURN v_has_perm;
END;
$$;

-- 3. Función PL/pgSQL: Registro inmutable de auditoría con encadenamiento de Hashes
CREATE OR REPLACE FUNCTION public.fn_log_audit_event(
    p_actor_id TEXT,
    p_action TEXT,
    p_action_type TEXT,
    p_entity TEXT,
    p_entity_id TEXT,
    p_details TEXT,
    p_before JSONB DEFAULT NULL,
    p_after JSONB DEFAULT NULL,
    p_severity TEXT DEFAULT 'INFO'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_prev_hash VARCHAR(64);
    v_new_hash VARCHAR(64);
    v_actor_name TEXT;
    v_actor_role TEXT;
    v_new_id TEXT;
    v_payload TEXT;
BEGIN
    -- Obtener datos del actor
    SELECT name, role_title INTO v_actor_name, v_actor_role
    FROM public.users
    WHERE id = p_actor_id;

    IF v_actor_name IS NULL THEN
        v_actor_name := 'Sistema SGD';
        v_actor_role := 'Servicio Automatizado';
    END IF;

    -- Obtener el hash del último evento registrado
    SELECT integrity_hash INTO v_prev_hash
    FROM public.audit_logs
    ORDER BY raw_timestamp DESC, id DESC
    LIMIT 1;

    IF v_prev_hash IS NULL THEN
        v_prev_hash := '0000000000000000000000000000000000000000000000000000000000000000';
    END IF;

    v_new_id := 'alog-' || EXTRACT(EPOCH FROM NOW())::BIGINT || '-' || SUBSTRING(gen_random_uuid()::text, 1, 4);

    -- Generar nuevo hash criptográfico SHA-256 encadenado
    v_payload := v_prev_hash || p_action || p_entity_id || NOW()::TEXT || COALESCE(p_details, '');
    v_new_hash := encode(digest(v_payload, 'sha256'), 'hex');

    -- Insertar en bitácora inmutable
    INSERT INTO public.audit_logs (
        id,
        raw_timestamp,
        actor_id,
        actor_name,
        actor_role,
        action,
        action_type,
        entity,
        entity_id,
        details,
        before_state,
        after_state,
        severity,
        previous_hash,
        integrity_hash
    ) VALUES (
        v_new_id,
        NOW(),
        p_actor_id,
        v_actor_name,
        v_actor_role,
        p_action,
        p_action_type,
        p_entity,
        p_entity_id,
        p_details,
        p_before,
        p_after,
        p_severity,
        v_prev_hash,
        v_new_hash
    );

    RETURN v_new_hash;
END;
$$;

-- 4. Trigger PL/pgSQL: Auditoría automática tras insertar o modificar expedientes
CREATE OR REPLACE FUNCTION public.trg_audit_document_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        PERFORM public.fn_log_audit_event(
            NEW.responsible_id,
            'Radicación de Nuevo Documento/Expediente',
            'SUBIDA_ARCHIVO',
            'Expediente Documental',
            NEW.radicado,
            'Radicado generado: ' || NEW.title,
            NULL,
            to_jsonb(NEW),
            'INFO'
        );
    ELSIF (TG_OP = 'UPDATE') THEN
        PERFORM public.fn_log_audit_event(
            NEW.responsible_id,
            'Actualización de Expediente',
            'MODIFICACION',
            'Expediente Documental',
            NEW.radicado,
            'Modificación de estado a: ' || NEW.status,
            to_jsonb(OLD),
            to_jsonb(NEW),
            'INFO'
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_document_audit ON public.documents;
CREATE TRIGGER trigger_document_audit
AFTER INSERT OR UPDATE ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_document_change();

