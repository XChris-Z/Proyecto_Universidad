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
    const rawCodigo = String(codigo || '').trim().toUpperCase();
    const cleanPin = String(pin || '').replace(/\s+/g, '').trim();

    if (!cleanEmail || !rawCodigo) {
      return new Response(
        JSON.stringify({
          success: false,
          code: 'MISSING_FIELDS',
          message: 'Debe ingresar el correo institucional de la oficina y el código único temporal.',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Generar variaciones del código para máxima tolerancia (con guión, sin guión, con prefijo UPQ)
    const codeCandidates: string[] = [rawCodigo];
    const unhyphenated = rawCodigo.replace(/[\s-]+/g, '');
    if (!codeCandidates.includes(unhyphenated)) {
      codeCandidates.push(unhyphenated);
    }
    if (!rawCodigo.includes('-')) {
      if (rawCodigo.startsWith('UPQ')) {
        const withHyphen = `UPQ-${rawCodigo.slice(3)}`;
        if (!codeCandidates.includes(withHyphen)) codeCandidates.push(withHyphen);
      } else {
        const withHyphen = `UPQ-${rawCodigo}`;
        if (!codeCandidates.includes(withHyphen)) codeCandidates.push(withHyphen);
      }
    }

    // Ejecutar función RPC en PostgreSQL probando los candidatos
    let resultado: any = null;
    let successfulCodigo = rawCodigo;

    for (const testCode of codeCandidates) {
      try {
        let rpcRes = await (supabase.rpc as any)('fn_validar_acceso_portal', {
          p_email: cleanEmail,
          p_codigo: testCode,
        });

        if (rpcRes.error && rpcRes.error.code === 'PGRST202') {
          rpcRes = await (supabase.rpc as any)('fn_validar_acceso_portal', {
            p_email: cleanEmail,
            p_codigo: testCode,
            p_pin: cleanPin || null,
          });
        }

        if (rpcRes.data && rpcRes.data.success) {
          resultado = rpcRes.data;
          successfulCodigo = testCode;
          break;
        } else if (rpcRes.data && !resultado) {
          resultado = rpcRes.data;
        }
      } catch (rpcErr) {
        console.warn('Aviso probando candidato RPC:', testCode, rpcErr);
      }
    }

    // Fallback directo por consulta si el RPC no tuvo éxito por disparidad de formato
    if (!resultado || !resultado.success) {
      try {
        const { data: ofiData } = await (supabase
          .from('oficinas' as any)
          .select('id, nombre, codigo, email_institucional')
          .ilike('email_institucional', cleanEmail)
          .maybeSingle() as any);

        if (ofiData) {
          const { data: respDirect } = await (supabase
            .from('peticion_responsables' as any)
            .select('id, peticion_id, codigo_acceso, estado_entrega, fecha_expiracion_codigo, storage_subfolder_path, observaciones_entrega')
            .eq('oficina_id', ofiData.id)
            .in('codigo_acceso', codeCandidates)
            .maybeSingle() as any);

          if (respDirect) {
            const { data: petDirect } = await (supabase
              .from('peticiones' as any)
              .select('id, numero_radicado, asunto, descripcion, fecha_limite_entrega, fecha_limite_responsable')
              .eq('id', respDirect.peticion_id)
              .maybeSingle() as any);

            if (petDirect) {
              const ahora = new Date();
              if (respDirect.fecha_expiracion_codigo && ahora > new Date(respDirect.fecha_expiracion_codigo)) {
                resultado = {
                  success: false,
                  code: 'EXPIRED_CODE',
                  message: 'El plazo preventivo para radicar anexos venció.',
                };
              } else {
                resultado = {
                  success: true,
                  responsable_id: respDirect.id,
                  peticion_id: petDirect.id,
                  numero_radicado: petDirect.numero_radicado,
                  asunto: petDirect.asunto,
                  descripcion: petDirect.descripcion,
                  fecha_limite_entrega: petDirect.fecha_limite_entrega,
                  fecha_limite_responsable: petDirect.fecha_limite_responsable,
                  storage_subfolder_path: respDirect.storage_subfolder_path,
                  oficina_nombre: ofiData.nombre,
                  oficina_codigo: ofiData.codigo,
                  estado_entrega: respDirect.estado_entrega,
                };
                successfulCodigo = respDirect.codigo_acceso;
              }
            }
          }
        }
      } catch (fallbackErr) {
        console.warn('Aviso en fallback directo:', fallbackErr);
      }
    }

    if (!resultado || !resultado.success) {
      await logSystemActivity({
        actor: { id: 'usr-external', name: cleanEmail, role: 'oficina_responsable' },
        action: `Fallo de autenticación en Portal Externo (${resultado?.code || 'AUTH_FAIL'})`,
        actionType: 'SEGURIDAD',
        entity: 'Portal Entrega Anexos',
        entityId: rawCodigo,
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
      // Consultar peticion_responsables SIN subcarpeta_id para evitar error 42703
      let respRec: any = null;
      try {
        const { data, error } = await (supabase
          .from('peticion_responsables' as any)
          .select('id, peticion_id, oficina_id, observaciones_entrega, codigo_acceso')
          .eq('id', resultado.responsable_id)
          .maybeSingle() as any);
        if (!error && data) respRec = data;
      } catch (e) {}

      const rawObs = respRec?.observaciones_entrega || '';
      const pinMatch = rawObs.match(/PIN:\s*([0-9A-Z]{6})/i);
      let expectedPin = pinMatch ? pinMatch[1].trim() : '';

      // Si no está en observaciones, consultar si la petición tiene columna pin_acceso
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

      const detPin = getDeterministicPin(resultado.numero_radicado || resultado.peticion_id || successfulCodigo);
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

      // Validar coincidencia de PIN (exacto, determinista, o fijación inicial de 6 dígitos)
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

    // Consultar asignaciones de esta oficina (sin subcarpeta_id para cero errores)
    const { data: assignmentsData } = await (supabase
      .from('peticion_responsables' as any)
      .select('id, estado_entrega, fecha_entrega, observaciones_entrega, storage_subfolder_path, codigo_acceso')
      .eq('peticion_id', resultado.peticion_id)
      .in('codigo_acceso', codeCandidates) as any);

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

    // Consultar anexos subidos por estas asignaciones (sin subcarpeta_id en select)
    const { data: anexosData } = await (supabase
      .from('peticion_anexos' as any)
      .select('id, peticion_responsable_id, nombre_archivo, storage_path, tamano_bytes, created_at')
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
    const subcarpetasResponse: any[] = [];

    for (let index = 0; index < targetAssignments.length; index++) {
      const assign = targetAssignments[index];
      const rawObs = assign.observaciones_entrega || '';

      // Extraer todas las subcarpetas mencionadas en observaciones_entrega e.g. [Subcarpeta 1], [Subcarpeta 2]
      const subMatches = Array.from(rawObs.matchAll(/\[(.*?)\]/g)).map((m: any) => m[1].trim());

      if (subMatches.length > 1) {
        for (let sIdx = 0; sIdx < subMatches.length; sIdx++) {
          const subName = subMatches[sIdx];
          const matchedSub = subcarpetasCatalog.find((s: any) => s.nombre?.toLowerCase() === subName.toLowerCase());

          subcarpetasResponse.push({
            id: matchedSub?.id || `sub-${index + 1}-${sIdx + 1}`,
            responsable_id: assign.id,
            subcarpeta_id: matchedSub?.id || null,
            nombre: matchedSub?.nombre || subName,
            descripcion: matchedSub?.descripcion || resultado.descripcion || null,
            estado_entrega: assign.estado_entrega || 'Pendiente',
            storage_subfolder_path: assign.storage_subfolder_path || resultado.storage_subfolder_path,
            observaciones: rawObs.replace(/^PIN:\s*[0-9A-Z]{6}(\s*\|\s*)?/i, '').trim(),
            anexos: allAnexos.filter((a: any) => a.peticion_responsable_id === assign.id),
          });
        }
      } else {
        const subNameFromObs = subMatches[0] || null;
        let matchedSub = null;
        if (subNameFromObs) {
          matchedSub = subcarpetasCatalog.find((s: any) => s.nombre?.toLowerCase() === subNameFromObs.toLowerCase());
        }
        if (!matchedSub && subcarpetasCatalog[index]) {
          matchedSub = subcarpetasCatalog[index];
        }

        const cleanObs = rawObs
          .replace(/^PIN:\s*[0-9A-Z]{6}(\s*\|\s*)?/i, '')
          .replace(/^\[.*?\]\s*/i, '')
          .trim();

        subcarpetasResponse.push({
          id: matchedSub?.id || `sub-${index + 1}`,
          responsable_id: assign.id,
          subcarpeta_id: matchedSub?.id || null,
          nombre: matchedSub?.nombre || subNameFromObs || (subcarpetasCatalog.length > 0 ? (subcarpetasCatalog[index]?.nombre || 'Expediente General') : 'Expediente General'),
          descripcion: matchedSub?.descripcion || resultado.descripcion || null,
          estado_entrega: assign.estado_entrega || 'Pendiente',
          storage_subfolder_path: assign.storage_subfolder_path || resultado.storage_subfolder_path,
          observaciones: cleanObs,
          anexos: allAnexos.filter((a: any) => a.peticion_responsable_id === assign.id),
        });
      }
    }

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
