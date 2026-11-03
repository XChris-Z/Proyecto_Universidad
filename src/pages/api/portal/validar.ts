// src/pages/api/portal/validar.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { supabase } from '@lib/supabase';
import { logSystemActivity } from '@lib/audit';

export const POST: APIRoute = async ({ request }) => {
  try {
    const { email, codigo, pin } = await request.json();

    if (!email || !codigo) {
      return new Response(
        JSON.stringify({
          success: false,
          code: 'MISSING_FIELDS',
          message: 'Debe ingresar el correo institucional de la oficina y el código único temporal.',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Ejecutar función RPC en Supabase PostgreSQL
    const { data, error } = await (supabase.rpc as any)('fn_validar_acceso_portal', {
      p_email: email.trim().toLowerCase(),
      p_codigo: codigo.trim().toUpperCase(),
      p_pin: pin ? String(pin).trim() : null,
    });

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
        actor: { id: 'usr-external', name: email, role: 'oficina_responsable' },
        action: `Fallo de autenticación en Portal Externo (${resultado?.code || 'AUTH_FAIL'})`,
        actionType: 'SEGURIDAD',
        entity: 'Portal Entrega Anexos',
        entityId: codigo,
        details: `Intento de acceso denegado para correo "${email}". Motivo: ${resultado?.message || 'Credenciales inválidas'}.`,
        severity: 'WARN',
      }).catch(() => {});

      return new Response(
        JSON.stringify(resultado || { success: false, message: 'Acceso no autorizado.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validación secundaria de PIN a nivel de aplicación para máxima seguridad
    if (resultado.peticion_id) {
      const { data: peticionRec } = await (supabase
        .from('peticiones' as any)
        .select('pin_acceso')
        .eq('id', resultado.peticion_id)
        .maybeSingle() as any);

      if (peticionRec && peticionRec.pin_acceso) {
        const expectedPin = String(peticionRec.pin_acceso).trim();
        const suppliedPin = pin ? String(pin).trim() : '';

        if (!suppliedPin) {
          return new Response(
            JSON.stringify({
              success: false,
              code: 'PIN_REQUIRED',
              message: 'Este radicado cuenta con blindaje de seguridad. Debe ingresar el PIN de 6 dígitos.',
            }),
            { status: 401, headers: { 'Content-Type': 'application/json' } }
          );
        }

        if (expectedPin !== suppliedPin) {
          await logSystemActivity({
            actor: { id: 'usr-external', name: email, role: 'oficina_responsable' },
            action: 'PIN de seguridad incorrecto en Portal Externo',
            actionType: 'SEGURIDAD',
            entity: 'Peticiones Radicadas',
            entityId: resultado.numero_radicado || resultado.peticion_id,
            details: `PIN ingresado no coincide con el radicado ${resultado.numero_radicado}. Alerta de seguridad anti-enumeración.`,
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
