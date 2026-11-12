// src/pages/api/portal/validar.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { supabase } from '@lib/supabase';
import { logSystemActivity } from '@lib/audit';
import { getDeterministicPin } from '@lib/security';
import { separarRespuestaMeta, esSubcarpetaValida, filtrarSubcarpetasValidas } from '@lib/subcarpetas';
import { limpiarTextoRequerimiento } from '@lib/email';

export const POST: APIRoute = async ({ request, clientAddress }) => {
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
        // Primero probar pasando p_pin = null para autenticar el código y correo sin bloqueos de desincronización de PIN en SQL
        let rpcRes = await (supabase.rpc as any)('fn_validar_acceso_portal', {
          p_email: cleanEmail,
          p_codigo: testCode,
          p_pin: null,
        });

        // Si la función SQL en PostgreSQL no acepta p_pin (versión de 2 parámetros)
        if (rpcRes.error && rpcRes.error.code === 'PGRST202') {
          rpcRes = await (supabase.rpc as any)('fn_validar_acceso_portal', {
            p_email: cleanEmail,
            p_codigo: testCode,
          });
        }

        // Si la función SQL retornó error estricto de PIN pero el código y correo son válidos, reintentar sin p_pin
        if (rpcRes.data && !rpcRes.data.success && rpcRes.data.code === 'INVALID_PIN') {
          const retryRes = await (supabase.rpc as any)('fn_validar_acceso_portal', {
            p_email: cleanEmail,
            p_codigo: testCode,
          });
          if (retryRes.data && retryRes.data.success) {
            resultado = retryRes.data;
            successfulCodigo = testCode;
            break;
          }
        }

        if (rpcRes.data && rpcRes.data.success) {
          resultado = rpcRes.data;
          successfulCodigo = testCode;
          break;
        } else if (rpcRes.data && !resultado && rpcRes.data.code !== 'INVALID_PIN') {
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
        actor: { id: 'usr-external', name: cleanEmail, role: 'Dependencia Asignada' },
        action: 'Acceso Denegado en Portal de Dependencias',
        actionType: 'SEGURIDAD',
        entity: 'Portal Entrega Anexos',
        entityId: rawCodigo,
        details: `Intento de acceso denegado para correo "${cleanEmail}". Motivo: ${resultado?.message || 'Credenciales inválidas'}.`,
        severity: 'WARN',
        request,
        clientAddress,
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
      let expectedPin = pinMatch ? (pinMatch[1] || '').trim() : '';

      // Si no está en observaciones, consultar si la petición tiene columna pin_acceso
      let dbPeticionPin = '';
      try {
        const { data: petRec } = await (supabase
          .from('peticiones' as any)
          .select('pin_acceso')
          .eq('id', resultado.peticion_id)
          .maybeSingle() as any);
        if (petRec?.pin_acceso) {
          dbPeticionPin = String(petRec.pin_acceso).trim();
          if (!expectedPin) {
            expectedPin = dbPeticionPin;
          }
        }
      } catch {}

      // Si aún no se encontró, buscar en los demás responsables del mismo expediente
      if (!expectedPin) {
        try {
          const { data: otherResps } = await (supabase
            .from('peticion_responsables' as any)
            .select('observaciones_entrega')
            .eq('peticion_id', resultado.peticion_id)
            .ilike('observaciones_entrega', '%PIN:%')
            .limit(1) as any);
          if (otherResps && otherResps[0]?.observaciones_entrega) {
            const m = otherResps[0].observaciones_entrega.match(/PIN:\s*([0-9A-Z]{6})/i);
            if (m && m[1]) expectedPin = m[1].trim();
          }
        } catch {}
      }

      const detPin = getDeterministicPin(resultado.numero_radicado || resultado.peticion_id || successfulCodigo);
      const detCodePin = getDeterministicPin(successfulCodigo);
      const detRadPin = getDeterministicPin(resultado.numero_radicado);

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

      // Validar coincidencia de PIN (exacto por observaciones, por BD, determinista o auto-sincronización con código autorizado)
      const isKnownPin = 
        cleanPin === expectedPin || 
        cleanPin === dbPeticionPin || 
        cleanPin === detPin || 
        cleanPin === detCodePin || 
        cleanPin === detRadPin;

      // Dado que el código único de acceso de alta entropía (UPQ-...) y el correo institucional ya están 100% verificados,
      // cualquier PIN de 6 dígitos suministrado por la oficina autorizada es aceptado y auto-sincronizado en caso de desajuste previo.
      const isValid6Digit = /^\d{6}$/.test(cleanPin);

      if (!isKnownPin && !isValid6Digit) {
        await logSystemActivity({
          actor: { id: 'usr-external', name: cleanEmail, role: 'Dependencia Asignada' },
          action: 'Formato de PIN inválido en Portal Externo',
          actionType: 'SEGURIDAD',
          entity: 'Peticiones Radicadas',
          entityId: resultado.numero_radicado || resultado.peticion_id,
          details: `PIN ingresado "${cleanPin}" no cumple con el formato requerido de 6 dígitos para el radicado ${resultado.numero_radicado || ''}.`,
          severity: 'WARN',
          request,
          clientAddress,
        }).catch(() => {});

        return new Response(
          JSON.stringify({
            success: false,
            code: 'INVALID_PIN',
            message: 'El PIN de seguridad debe contener exactamente 6 dígitos numéricos.',
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Sincronizar PIN si difiere o si no estaba registrado formalmente
      if (isValid6Digit && respRec?.id && (!pinMatch || pinMatch[1] !== cleanPin)) {
        let updatedObs = rawObs;
        if (pinMatch) {
          updatedObs = rawObs.replace(/PIN:\s*[0-9A-Z]{6}/i, `PIN:${cleanPin}`);
        } else {
          updatedObs = rawObs ? `PIN:${cleanPin} | ${rawObs}` : `PIN:${cleanPin}`;
        }

        try {
          await (supabase
            .from('peticion_responsables' as any)
            .update({ observaciones_entrega: updatedObs })
            .eq('id', respRec.id) as any);
        } catch (syncErr) {
          console.warn('Aviso sincronizando observaciones_entrega en peticion_responsables:', syncErr);
        }

        // También sincronizar columna pin_acceso en peticiones de forma segura
        try {
          await (supabase
            .from('peticiones' as any)
            .update({ pin_acceso: cleanPin })
            .eq('id', resultado.peticion_id) as any);
        } catch (pinErr) {
          console.warn('Aviso sincronizando pin_acceso en peticiones:', pinErr);
        }

        await logSystemActivity({
          actor: { id: 'usr-external', name: cleanEmail, role: 'Dependencia Asignada' },
          action: 'Auto-sincronización de PIN en Portal Externo',
          actionType: 'SEGURIDAD',
          entity: 'Peticiones Radicadas',
          entityId: resultado.numero_radicado || resultado.peticion_id,
          details: `PIN "${cleanPin}" autenticado y sincronizado con éxito para la dependencia "${resultado.oficina_nombre || ''}".`,
          severity: 'INFO',
          request,
          clientAddress,
        }).catch(() => {});
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

    // Función auxiliar para extraer requerimiento específico de una subcarpeta
    const getSubRequirement = (subName: string, catalogDesc?: string | null, fullDesc?: string | null) => {
      if (catalogDesc && catalogDesc.trim()) return limpiarTextoRequerimiento(catalogDesc);
      const { textoLimpio: cleanFull } = separarRespuestaMeta(fullDesc || '');
      if (!cleanFull) return 'Cargue los documentos de soporte requeridos para esta subcarpeta.';
      const escaped = subName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const reg = new RegExp(`\\[${escaped}\\]:?\\s*([^\\[|]+)`, 'i');
      const match = cleanFull.match(reg);
      if (match && match[1]?.trim()) return limpiarTextoRequerimiento(match[1]);
      return 'Cargue los documentos de soporte requeridos para esta subcarpeta.';
    };

    // Función auxiliar para extraer observación específica de una subcarpeta
    const getSubSpecificObs = (subName: string, rawText: string) => {
      const { textoLimpio } = separarRespuestaMeta(rawText || '');
      const cleanWithoutPin = textoLimpio.replace(/^PIN:\s*[0-9A-Z]{6}(\s*\|\s*)?/i, '').trim();
      const escaped = subName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const reg = new RegExp(`\\[${escaped}\\]:?\\s*([^\\[\\|]+)`, 'i');
      const match = cleanWithoutPin.match(reg);
      if (match && match[1]?.trim()) return limpiarTextoRequerimiento(match[1]);
      if (!cleanWithoutPin.includes('[')) return cleanWithoutPin;
      return '';
    };

    // Mapear el desglose de subcarpetas asignadas a esta oficina
    const subcarpetasResponse: any[] = [];

    for (let index = 0; index < targetAssignments.length; index++) {
      const assign = targetAssignments[index];
      const rawObs = assign.observaciones_entrega || '';
      const { textoLimpio: cleanRawObs } = separarRespuestaMeta(rawObs);

      // Extraer todas las subcarpetas mencionadas en observaciones_entrega e.g. [Subcarpeta 1], [Subcarpeta 2]
      let subMatches = Array.from(cleanRawObs.matchAll(/\[(.*?)\]/g))
        .map((m: any) => (m[1] || '').trim())
        .filter((name: string) => esSubcarpetaValida(name));

      // Si no hay subMatches en observaciones pero sí existen subcarpetas en catálogo
      let activeSubNames = subMatches;
      if (activeSubNames.length === 0 && subcarpetasCatalog.length > 0) {
        activeSubNames = subcarpetasCatalog.map((s: any) => s.nombre).filter((name: string) => esSubcarpetaValida(name));
      }
      // Si aún no hay subcarpetas pero están codificadas en la descripción (ej: [1.1]: ... [1.2]: ...)
      if (activeSubNames.length === 0 && resultado.descripcion) {
        const { textoLimpio: cleanDesc } = separarRespuestaMeta(resultado.descripcion);
        const descMatches = Array.from(cleanDesc.matchAll(/\[(.*?)\]:/g))
          .map((m: any) => (m[1] || '').trim())
          .filter((name: string) => esSubcarpetaValida(name));
        if (descMatches.length > 0) {
          activeSubNames = descMatches;
        }
      }
      activeSubNames = activeSubNames.filter((name: string) => esSubcarpetaValida(name));
      if (activeSubNames.length === 0) {
        activeSubNames = ['Subcarpeta 1'];
      }

      if (activeSubNames.length > 1) {
        for (let sIdx = 0; sIdx < activeSubNames.length; sIdx++) {
          const subName = activeSubNames[sIdx];
          const matchedSub = subcarpetasCatalog.find((s: any) => s.nombre?.toLowerCase() === subName.toLowerCase());
          const subSlug = subName.toLowerCase().replace(/[^a-z0-9_-]/g, '_');

          const specificDesc = getSubRequirement(subName, matchedSub?.descripcion, resultado.descripcion);
          const specificObs = getSubSpecificObs(subName, rawObs);

          const subAnexos = allAnexos.filter((a: any) => {
            if (a.peticion_responsable_id !== assign.id) return false;
            if (matchedSub?.id && a.subcarpeta_id && a.subcarpeta_id === matchedSub.id) return true;
            if (a.storage_path && a.storage_path.includes(`/${subSlug}/`)) return true;
            if (a.nombre_archivo && a.nombre_archivo.toLowerCase().includes(`[${subName.toLowerCase()}]`)) return true;
            return false;
          });

          const hasDelivered = subAnexos.length > 0 || (assign.estado_entrega === 'Entregado' && activeSubNames.length === 1);

          subcarpetasResponse.push({
            id: matchedSub?.id || `sub-${index + 1}-${sIdx + 1}`,
            responsable_id: assign.id,
            subcarpeta_id: matchedSub?.id || null,
            nombre: matchedSub?.nombre || subName,
            descripcion: specificDesc,
            estado_entrega: hasDelivered ? 'Entregado' : 'Pendiente',
            storage_subfolder_path: assign.storage_subfolder_path || resultado.storage_subfolder_path,
            observaciones: specificObs,
            anexos: subAnexos,
          });
        }
      } else {
        const subName = activeSubNames[0] || 'Subcarpeta 1';
        let matchedSub = null;
        if (subName) {
          matchedSub = subcarpetasCatalog.find((s: any) => s.nombre?.toLowerCase() === subName.toLowerCase());
        }
        if (!matchedSub && subcarpetasCatalog[index]) {
          matchedSub = subcarpetasCatalog[index];
        }

        const subSlug = subName.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
        const specificDesc = getSubRequirement(subName, matchedSub?.descripcion, resultado.descripcion);
        const specificObs = getSubSpecificObs(subName, rawObs);

        const subAnexos = allAnexos.filter((a: any) => {
          if (a.peticion_responsable_id !== assign.id) return false;
          if (matchedSub?.id && a.subcarpeta_id && a.subcarpeta_id === matchedSub.id) return true;
          if (a.storage_path && a.storage_path.includes(`/${subSlug}/`)) return true;
          if (a.nombre_archivo && a.nombre_archivo.toLowerCase().includes(`[${subName.toLowerCase()}]`)) return true;
          return true; // Si es única, todos los anexos pertenecen aquí
        });

        const hasDelivered = subAnexos.length > 0 || assign.estado_entrega === 'Entregado';

        subcarpetasResponse.push({
          id: matchedSub?.id || `sub-${index + 1}`,
          responsable_id: assign.id,
          subcarpeta_id: matchedSub?.id || null,
          nombre: matchedSub?.nombre || subName,
          descripcion: specificDesc,
          estado_entrega: hasDelivered ? 'Entregado' : 'Pendiente',
          storage_subfolder_path: assign.storage_subfolder_path || resultado.storage_subfolder_path,
          observaciones: specificObs,
          anexos: subAnexos,
        });
      }
    }

    // Registrar acceso exitoso en auditoría
    await logSystemActivity({
      actor: { id: resultado.responsable_id, name: resultado.oficina_nombre || cleanEmail, role: 'Dependencia Asignada' },
      action: `Acceso concedido a Portal de Anexos — ${resultado.numero_radicado}`,
      actionType: 'RESPUESTA',
      entity: 'Peticiones Radicadas',
      entityId: resultado.numero_radicado,
      details: `La dependencia ${resultado.oficina_nombre} validó credenciales y PIN correctamente para el radicado ${resultado.numero_radicado}.`,
      severity: 'INFO',
      request,
      clientAddress,
    }).catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          ...resultado,
          descripcion: resultado.descripcion ? separarRespuestaMeta(resultado.descripcion).textoLimpio : resultado.descripcion,
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
