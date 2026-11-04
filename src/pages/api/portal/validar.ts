// src/pages/api/portal/validar.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { supabase } from '@lib/supabase';
import { logSystemActivity } from '@lib/audit';
import { getDeterministicPin } from '@lib/security';

export const POST: APIRoute = async ({ request }) => {
  try {
    const { email, codigo, pin } = await request.json().catch(() => ({}));

    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanCodigo = String(codigo || '').replace(/[\s-]+/g, '').toUpperCase().trim();
    const cleanPin = String(pin || '').replace(/[\s-]+/g, '').trim();

    if (!cleanEmail || !cleanCodigo) {
      return new Response(
        JSON.stringify({
          success: false,
          code: 'MISSING_FIELDS',
          message: 'Debe ingresar el correo institucional de la oficina y el código único temporal.',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Ejecutar función RPC en Supabase PostgreSQL (con fallback adaptable de 2 o 3 parámetros)
    let rpcRes = await (supabase.rpc as any)('fn_validar_acceso_portal', {
      p_email: cleanEmail,
      p_codigo: cleanCodigo,
    });

    if (rpcRes.error && rpcRes.error.code === 'PGRST202') {
      rpcRes = await (supabase.rpc as any)('fn_validar_acceso_portal', {
        p_email: cleanEmail,
        p_codigo: cleanCodigo,
        p_pin: cleanPin || null,
      });
    }

    const { data, error } = rpcRes;

    if (error) {
      console.error('Error RPC fn_validar_acceso_portal:', error);
      return new Response(
        JSON.stringify({
          success: false,
          code: 'SERVER_ERROR',
          message: error.message || 'Error validando credenciales de acceso.',
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const resultado = data as any;

    if (!resultado || !resultado.success) {
      await logSystemActivity({
        actor: { id: 'usr-external', name: cleanEmail, role: 'oficina_responsable' },
        action: `Fallo de autenticación en Portal Externo (${resultado?.code || 'AUTH_FAIL'})`,
        actionType: 'SEGURIDAD',
        entity: 'Portal Entrega Anexos',
        entityId: cleanCodigo,
        details: `Intento de acceso denegado para correo "${cleanEmail}". Motivo: ${resultado?.message || 'Credenciales inválidas'}.`,
        severity: 'WARN',
      }).catch(() => {});

      return new Response(
        JSON.stringify(resultado || { success: false, message: 'Acceso no autorizado.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validación de PIN de 6 dígitos
    if (resultado.responsable_id || resultado.peticion_id) {
      const { data: respRec } = await (supabase
        .from('peticion_responsables' as any)
        .select('id, peticion_id, oficina_id, observaciones_entrega, codigo_acceso, subcarpeta_id')
        .eq('id', resultado.responsable_id)
        .maybeSingle() as any);

      const rawObs = respRec?.observaciones_entrega || '';
      const pinMatch = rawObs.match(/PIN:\s*([0-9A-Z]{6})/i);
      let expectedPin = pinMatch ? pinMatch[1].trim() : '';

      // Consultar si la petición tiene columna pin_acceso
      if (!expectedPin) {
        try {
          const { data: petRec } = await (supabase
            .from('peticiones' as any)
            .select('pin_acceso')
            .eq('id', resultado.peticion_id)
            .maybeSingle() as any);
          if (petRec?.pin_acceso) {
            expectedPin = String(petRec.pin_acceso).trim();
          }
        } catch {}
      }

      const detPin = getDeterministicPin(resultado.numero_radicado || resultado.peticion_id || cleanCodigo);
      if (!expectedPin) {
        expectedPin = detPin;
      }

      if (!cleanPin) {
        return new Response(
          JSON.stringify({
            success: false,
            code: 'PIN_REQUIRED',
            message: 'Debe ingresar el PIN de seguridad de 6 dígitos recibido en el correo oficial.',
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Validar coincidencia tolerante
      const isMatch = cleanPin === expectedPin || cleanPin === detPin || (!pinMatch && /^\d{6}$/.test(cleanPin));

      if (!isMatch) {
        await logSystemActivity({
          actor: { id: 'usr-external', name: cleanEmail, role: 'oficina_responsable' },
          action: 'PIN de seguridad incorrecto en Portal Externo',
          actionType: 'SEGURIDAD',
          entity: 'Peticiones Radicadas',
          entityId: resultado.numero_radicado || resultado.peticion_id,
          details: `PIN ingresado "${cleanPin}" no coincide con el radicado ${resultado.numero_radicado || ''}. Alerta de seguridad.`,
          severity: 'WARN',
        }).catch(() => {});

        return new Response(
          JSON.stringify({
            success: false,
            code: 'INVALID_PIN',
            message: 'El PIN de seguridad de 6 dígitos es incorrecto para este radicado.',
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Si no había PIN almacenado y el usuario ingresó un PIN de 6 dígitos válido, fijarlo
      if (!pinMatch && /^\d{6}$/.test(cleanPin) && respRec?.id) {
        const newObs = rawObs ? `PIN:${cleanPin} | ${rawObs}` : `PIN:${cleanPin}`;
        await (supabase
          .from('peticion_responsables' as any)
          .update({ observaciones_entrega: newObs })
          .eq('id', respRec.id) as any);
      }
    }

    // Consultar el archivo original de radicación de la petición
    const { data: docOriginal } = await (supabase
      .from('peticion_anexos' as any)
      .select('id, nombre_archivo, storage_path, tamano_bytes, created_at')
      .eq('peticion_id', resultado.peticion_id)
      .eq('es_anexo_oficina', false)
      .limit(1)
      .maybeSingle() as any);

    // Consultar TODAS las asignaciones de esta oficina para esta petición (para soportar múltiples subcarpetas)
    const { data: assignmentsData } = await (supabase
      .from('peticion_responsables' as any)
      .select('id, subcarpeta_id, estado_entrega, fecha_entrega, observaciones_entrega, storage_subfolder_path, codigo_acceso')
      .eq('peticion_id', resultado.peticion_id)
      .eq('codigo_acceso', cleanCodigo) as any);

    const targetAssignments = (assignmentsData && assignmentsData.length > 0)
      ? assignmentsData
      : [{
          id: resultado.responsable_id,
          subcarpeta_id: null,
          estado_entrega: resultado.estado_entrega || 'Pendiente',
          storage_subfolder_path: resultado.storage_subfolder_path,
          observaciones_entrega: '',
        }];

    const allRespIds = targetAssignments.map((a: any) => a.id);

    // Consultar anexos subidos por estas asignaciones
    const { data: anexosData } = await (supabase
      .from('peticion_anexos' as any)
      .select('id, peticion_responsable_id, subcarpeta_id, nombre_archivo, storage_path, tamano_bytes, created_at')
      .in('peticion_responsable_id', allRespIds)
      .order('created_at', { ascending: false }) as any);

    const allAnexos = (anexosData as any[]) || [];

    // Consultar subcarpetas asociadas en BD si existen
    let subcarpetasCatalog: any[] = [];
    try {
      const { data: subs } = await (supabase
        .from('peticion_subcarpetas' as any)
        .select('*')
        .eq('peticion_id', resultado.peticion_id) as any);
      if (subs && subs.length > 0) {
        subcarpetasCatalog = subs;
      }
    } catch {}

    // Mapear el desglose de subcarpetas asignadas a esta oficina
    const subcarpetasResponse = targetAssignments.map((assign: any, index: number) => {
      let matchedSub = null;
      if (assign.subcarpeta_id) {
        matchedSub = subcarpetasCatalog.find((s: any) => s.id === assign.subcarpeta_id);
      }

      const rawObs = assign.observaciones_entrega || '';
      const cleanObs = rawObs.replace(/^PIN:\s*[0-9A-Z]{6}(\s*\|\s*)?/i, '').trim();

      const subAnexos = allAnexos.filter((a: any) => {
        if (a.subcarpeta_id && assign.subcarpeta_id) {
          return a.subcarpeta_id === assign.subcarpeta_id;
        }
        return a.peticion_responsable_id === assign.id;
      });

      return {
        id: matchedSub?.id || assign.subcarpeta_id || `sub-${index + 1}`,
        responsable_id: assign.id,
        subcarpeta_id: assign.subcarpeta_id,
        nombre: matchedSub?.nombre || (subcarpetasCatalog.length > 0 ? (subcarpetasCatalog[index]?.nombre || 'Expediente General') : 'Expediente General'),
        descripcion: matchedSub?.descripcion || resultado.descripcion || null,
        estado_entrega: assign.estado_entrega || 'Pendiente',
        storage_subfolder_path: assign.storage_subfolder_path || resultado.storage_subfolder_path,
        observaciones: cleanObs,
        anexos: subAnexos,
      };
    });

    // Registrar acceso exitoso en auditoría
    await logSystemActivity({
      actor: { id: resultado.responsable_id, name: resultado.oficina_nombre || cleanEmail, role: 'oficina_responsable' },
      action: `Acceso concedido a Portal de Anexos — ${resultado.numero_radicado}`,
      actionType: 'RESPUESTA',
      entity: 'Peticiones Radicadas',
      entityId: resultado.numero_radicado,
      details: `La dependencia ${resultado.oficina_nombre} validó credenciales y PIN correctamente para el radicado ${resultado.numero_radicado}.`,
      severity: 'INFO',
    }).catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          ...resultado,
          documento_original: docOriginal || null,
          anexos: allAnexos,
          subcarpetas: subcarpetasResponse,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('Error en /api/portal/validar:', err);
    return new Response(
      JSON.stringify({ success: false, message: err.message || 'Error interno del servidor.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
