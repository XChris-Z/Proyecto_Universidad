// src/pages/api/portal/validar.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { supabase } from '@lib/supabase';
import { logSystemActivity } from '@lib/audit';
import { getDeterministicPin } from '@lib/security';

export const POST: APIRoute = async ({ request }) => {
  try {
    const { email, codigo, pin } = await request.json();

    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanCodigo = String(codigo || '').replace(/\s+/g, '').toUpperCase().trim();
    const cleanPin = String(pin || '').replace(/\s+/g, '').trim();

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
      // Registrar intento fallido en auditoría
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
      // 1. Consultar registro del responsable para recuperar PIN persistido
      const { data: respRec } = await (supabase
        .from('peticion_responsables' as any)
        .select('id, observaciones_entrega, codigo_acceso')
        .eq('id', resultado.responsable_id)
        .maybeSingle() as any);

      const rawObs = respRec?.observaciones_entrega || '';
      const pinMatch = rawObs.match(/PIN:\s*([0-9A-Z]{6})/i);
      let expectedPin = pinMatch ? pinMatch[1].trim() : '';

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

      // Validar coincidencia
      const isMatch = cleanPin === expectedPin || cleanPin === detPin;

      if (!isMatch) {
        // Fallback: si no había PIN guardado previamente y el usuario ingresó un PIN numérico de 6 dígitos
        if (!pinMatch && /^\d{6}$/.test(cleanPin)) {
          // Bloquear este PIN para el responsable y permitir continuar
          const newObs = rawObs ? `PIN:${cleanPin} | ${rawObs}` : `PIN:${cleanPin}`;
          await (supabase
            .from('peticion_responsables' as any)
            .update({ observaciones_entrega: newObs })
            .eq('id', resultado.responsable_id) as any);
        } else {
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

    // Consultar anexos ya subidos por esta oficina para esta petición
    const { data: anexosData } = await (supabase
      .from('peticion_anexos' as any)
      .select('id, nombre_archivo, storage_path, tamano_bytes, created_at')
      .eq('peticion_responsable_id', resultado.responsable_id)
      .order('created_at', { ascending: false }) as any);

    // Registrar acceso exitoso en auditoría
    await logSystemActivity({
      actor: { id: resultado.responsable_id, name: resultado.oficina_nombre || email, role: 'oficina_responsable' },
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
          anexos: anexosData || [],
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
