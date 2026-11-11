// src/pages/api/consultar-respuesta.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { supabase } from '@lib/supabase';
import { getDeterministicPin } from '@lib/security';
import { separarRespuestaMeta, esSubcarpetaValida, filtrarSubcarpetasValidas } from '@lib/subcarpetas';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const rawRadicado = String(body.radicado || '').trim().toUpperCase();
    const rawEmail = String(body.correo || body.email || '').trim().toLowerCase();
    const rawPin = String(body.pin || body.codigo || '').replace(/\s+/g, '').trim();

    if (!rawRadicado) {
      return new Response(
        JSON.stringify({ success: false, code: 'MISSING_RADICADO', error: 'Por favor ingrese el número de radicado.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!rawPin || rawPin.length < 4) {
      return new Response(
        JSON.stringify({ success: false, code: 'MISSING_PIN', error: 'Por favor ingrese el código de seguridad de 6 dígitos.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (rawEmail && !rawEmail.includes('@')) {
      return new Response(
        JSON.stringify({ success: false, code: 'MISSING_EMAIL', error: 'Por favor ingrese un correo electrónico válido.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 1. Consultar la petición en la base de datos (seguro para tipo UUID en 'id' o cadena en 'numero_radicado')
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawRadicado);
    let petQuery = supabase.from('peticiones' as any).select('*');
    if (isUuid) {
      petQuery = petQuery.eq('id', rawRadicado);
    } else {
      petQuery = petQuery.ilike('numero_radicado', rawRadicado);
    }
    const { data: peticion, error: petErr } = await (petQuery.maybeSingle() as any);

    if (petErr || !peticion) {
      return new Response(
        JSON.stringify({
          success: false,
          code: 'NOT_FOUND',
          error: 'Las credenciales ingresadas (Correo o Código de 6 dígitos) no coinciden con este radicado.',
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2. Extraer metadatos de respuesta con el parser centralizado y resiliente
    const { respuestaMeta, allPins } = separarRespuestaMeta(peticion.instrucciones_anexos || peticion.descripcion || '');
    const metaRespuesta = respuestaMeta || {};

    // 3. Validar Correo Electrónico del Solicitante de forma flexible (si fue suministrado)
    if (rawEmail) {
      const emailsToCheck = [
        peticion.solicitante_email,
        peticion.correo_solicitante,
        peticion.solicitante_correo,
        peticion.correo,
        peticion.email,
        metaRespuesta.correo,
      ].map((e: any) => String(e || '').trim().toLowerCase()).filter(Boolean);

      const emailCoincide = emailsToCheck.length === 0 || emailsToCheck.includes(rawEmail);
      if (!emailCoincide) {
        return new Response(
          JSON.stringify({
            success: false,
            code: 'INVALID_CREDENTIALS',
            error: 'Las credenciales ingresadas (Correo o Código de 6 dígitos) no coinciden con este radicado.',
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // 4. Validar PIN de Seguridad (6 dígitos) aceptando el PIN más reciente o históricos válidos
    const validPins = new Set<string>();
    if (metaRespuesta.pin) validPins.add(String(metaRespuesta.pin).replace(/\s+/g, '').trim());
    if (peticion.respuesta_pin_solicitante) validPins.add(String(peticion.respuesta_pin_solicitante).replace(/\s+/g, '').trim());
    allPins.forEach((p) => { if (p) validPins.add(String(p).replace(/\s+/g, '').trim()); });
    if (peticion.pin_acceso) validPins.add(String(peticion.pin_acceso).replace(/\s+/g, '').trim());
    const detPin = getDeterministicPin(peticion.numero_radicado || peticion.id);
    if (detPin) validPins.add(String(detPin).replace(/\s+/g, '').trim());

    if (!validPins.has(rawPin)) {
      return new Response(
        JSON.stringify({
          success: false,
          code: 'INVALID_CREDENTIALS',
          error: 'Las credenciales ingresadas (Correo o Código de 6 dígitos) no coinciden con este radicado.',
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 5. Verificación Matemática Estricta de los 10 Días (Candado Temporal)
    const ahora = Date.now();
    const fechaBaseExpiracion = peticion.respuesta_expira_at
      ? new Date(peticion.respuesta_expira_at).getTime()
      : metaRespuesta.expira
        ? new Date(metaRespuesta.expira).getTime()
        : peticion.respuesta_fecha_envio
          ? new Date(peticion.respuesta_fecha_envio).getTime() + (10 * 24 * 60 * 60 * 1000)
          : metaRespuesta.fecha_envio
            ? new Date(metaRespuesta.fecha_envio).getTime() + (10 * 24 * 60 * 60 * 1000)
            : peticion.updated_at
              ? new Date(peticion.updated_at).getTime() + (10 * 24 * 60 * 60 * 1000)
              : null;

    const estaExpirado = fechaBaseExpiracion !== null && !Number.isNaN(fechaBaseExpiracion) && ahora > fechaBaseExpiracion;
    const diasRestantes = fechaBaseExpiracion
      ? Math.max(0, Math.ceil((fechaBaseExpiracion - ahora) / (1000 * 60 * 60 * 24)))
      : 10;

    const expiraDateObj = fechaBaseExpiracion ? new Date(fechaBaseExpiracion) : new Date(ahora + 10 * 24 * 60 * 60 * 1000);
    const formattedExpira = expiraDateObj.toLocaleDateString('es-CO', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // Si pasaron los 10 días: BLOQUEA POR COMPLETO archivos y textos
    if (estaExpirado) {
      return new Response(
        JSON.stringify({
          success: false,
          code: 'EXPIRED',
          error: `El periodo habilitado de 10 días calendario para consultar y descargar los documentos de este radicado venció el ${formattedExpira}. Por políticas de seguridad documental, el acceso público ha sido cerrado.`,
          expira_at: expiraDateObj.toISOString(),
          formatted_expira: formattedExpira,
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 6. Consultar Subcarpetas, Anexos y Responsables
    let subcarpetas: any[] = [];
    try {
      const { data: dbSubs } = await (supabase
        .from('peticion_subcarpetas' as any)
        .select('*')
        .eq('peticion_id', peticion.id)
        .order('created_at', { ascending: true }) as any);
      if (dbSubs && dbSubs.length > 0) {
        subcarpetas = dbSubs;
      }
    } catch {}

    let anexos: any[] = [];
    try {
      const { data: dbAnexos } = await (supabase
        .from('peticion_anexos' as any)
        .select('*')
        .eq('peticion_id', peticion.id)
        .order('created_at', { ascending: true }) as any);
      if (dbAnexos && dbAnexos.length > 0) {
        anexos = dbAnexos;
      }
    } catch {}

    let responsables: any[] = [];
    try {
      const { data: dbResp } = await (supabase
        .from('peticion_responsables' as any)
        .select(`
          id,
          subcarpeta_id,
          observaciones,
          observaciones_entrega,
          estado_entrega,
          fecha_entrega,
          oficinas (
            id,
            nombre,
            codigo
          )
        `)
        .eq('peticion_id', peticion.id) as any);
      if (dbResp && dbResp.length > 0) {
        responsables = dbResp;
      }
    } catch {}

    // 6b. Identificar documento oficial de Respuesta Final Oficial
    const respMetaFile = metaRespuesta.archivo_respuesta || metaRespuesta.respuesta_archivo || null;
    const respInAnexos = anexos.find((a) => a && a.storage_path && String(a.storage_path).includes('/respuesta_final/')) || null;
    const rawRespFinal = (respMetaFile && (respMetaFile.storage_path || respMetaFile.nombre_archivo)) ? respMetaFile : respInAnexos;

    let respuestaFinalMapped: any = null;
    if (rawRespFinal && rawRespFinal.storage_path) {
      const respCleanPath = String(rawRespFinal.storage_path).replace(/^peticiones\//, '').replace(/^\/+/, '');
      respuestaFinalMapped = {
        id: rawRespFinal.id || 'resp-final',
        nombre_archivo: String(rawRespFinal.nombre_archivo || 'Respuesta_Oficial.pdf').replace(/^\[[^\]]+\]\s*/, ''),
        storage_path: rawRespFinal.storage_path,
        tamano_bytes: rawRespFinal.tamano_bytes ?? null,
        mime_type: rawRespFinal.mime_type || 'application/pdf',
        created_at: rawRespFinal.created_at || peticion.respuesta_fecha_envio || metaRespuesta.fecha_envio || peticion.updated_at,
        download_url: `https://irjjpjtvhxoakiazfswn.supabase.co/storage/v1/object/public/peticiones/${respCleanPath}`,
        es_respuesta_final: true,
      };
    }

    // 6c. Filtrar estrictamente anexos de dependencias según lo marcado con checkbox por el funcionario
    const anexosSinResp = anexos.filter((a) =>
      !(a && a.storage_path && String(a.storage_path).includes('/respuesta_final/')) &&
      !(rawRespFinal && rawRespFinal.id && a.id === rawRespFinal.id)
    );

    const hasExplicitSelection =
      metaRespuesta.has_explicit_selection === true ||
      Array.isArray(peticion.respuesta_archivos_incluidos) ||
      Array.isArray(metaRespuesta.files);

    const filesAprobados: string[] = Array.isArray(peticion.respuesta_archivos_incluidos)
      ? peticion.respuesta_archivos_incluidos.map(String)
      : Array.isArray(metaRespuesta.files)
        ? metaRespuesta.files.map(String)
        : [];

    const allowedIds = new Set(filesAprobados);

    const includedFiles = anexosSinResp.filter((a) => {
      const isOficinaAnexo = Boolean(a.es_anexo_oficina || a.peticion_responsable_id || a.subcarpeta_id);
      if (!isOficinaAnexo) return true; // Documento radicado original del solicitante
      if (!hasExplicitSelection) return true; // Retrocompatibilidad para registros antiguos sin selector
      return allowedIds.has(String(a.id)) || allowedIds.has(String(a.storage_path)) || allowedIds.has(String(a.nombre_archivo));
    });

    subcarpetas = filtrarSubcarpetasValidas(subcarpetas);

    // Inferir subcarpetas virtuales a partir de los nombres de los anexos seleccionados si no hay tabla física
    if (subcarpetas.length === 0) {
      const subsMap: Record<string, any> = {};
      includedFiles.forEach((a) => {
        if (!a.es_anexo_oficina) return;
        const rawName = String(a.nombre_archivo || '');
        const match = rawName.match(/^\[([^\]]+)\]/);
        if (match && match[1]) {
          const subKey = match[1].trim();
          if (esSubcarpetaValida(subKey) && !subsMap[subKey]) {
            subsMap[subKey] = {
              id: `inf-${subKey.replace(/[^A-Za-z0-9_-]/g, '_')}`,
              nombre: subKey,
              descripcion: null,
            };
          }
        }
      });
      subcarpetas = filtrarSubcarpetasValidas(Object.values(subsMap));
    }

    // Asociar cada archivo seleccionado con su URL pública y su dependencia
    const mappedFiles = includedFiles.map((a) => {
      const storagePath = a.storage_path || '';
      const cleanPath = storagePath.replace(/^peticiones\//, '').replace(/^\/+/, '');
      const downloadUrl = `https://irjjpjtvhxoakiazfswn.supabase.co/storage/v1/object/public/peticiones/${cleanPath}`;

      const respMatch = responsables.find((r) =>
        (a.peticion_responsable_id && r.id === a.peticion_responsable_id) ||
        (a.subcarpeta_id && r.subcarpeta_id === a.subcarpeta_id)
      );
      let oficinaNombre = respMatch?.oficinas?.nombre || null;
      if (!oficinaNombre) {
        const depMatch = String(a.nombre_archivo || '').match(/\[Aporte de:\s*([^\]]+)\]/i);
        if (depMatch && depMatch[1]) oficinaNombre = depMatch[1].trim();
      }
      const observacion = respMatch?.observaciones_entrega || respMatch?.observaciones || null;

      return {
        id: a.id,
        nombre_archivo: String(a.nombre_archivo || 'Documento_Anexo.pdf')
          .replace(/^\[[^\]]+\]\s*/g, '')
          .replace(/^\[[^\]]+\]\s*/g, '')
          .trim() || a.nombre_archivo,
        nombre_raw: a.nombre_archivo,
        storage_path: a.storage_path,
        subcarpeta_id: a.subcarpeta_id || null,
        tamano_bytes: a.tamano_bytes ?? null,
        mime_type: a.mime_type ?? 'application/pdf',
        created_at: a.created_at ?? null,
        es_anexo_oficina: Boolean(a.es_anexo_oficina),
        download_url: downloadUrl,
        oficina_nombre: oficinaNombre,
        observacion: observacion,
      };
    });

    // Filtrar subcarpetas para mostrar únicamente aquellas que contienen al menos un archivo autorizado
    const officeMappedFiles = mappedFiles.filter((f) => f.es_anexo_oficina);
    const activeSubcarpetas = subcarpetas.filter((sub) => {
      const cleanSubName = String(sub.nombre || '').replace(/^subcarpeta\s+/i, '').trim().toLowerCase();
      return officeMappedFiles.some((f) => {
        if (f.subcarpeta_id && String(f.subcarpeta_id) === String(sub.id)) return true;
        const raw = String(f.nombre_raw || '').toLowerCase();
        return cleanSubName && (raw.includes(`[${cleanSubName}]`) || raw.includes(`[subcarpeta ${cleanSubName}]`));
      });
    });

    return new Response(
      JSON.stringify({
        success: true,
        peticion: {
          id: peticion.id,
          numero_radicado: peticion.numero_radicado,
          asunto: peticion.asunto,
          descripcion: peticion.descripcion ?? '',
          solicitante_nombre: peticion.solicitante_nombre ?? 'Ciudadano(a)',
          solicitante_email: peticion.solicitante_email ?? '',
          solicitante_tipo: peticion.solicitante_tipo ?? 'Ciudadano',
          categoria: peticion.categoria ?? 'Petición General',
          prioridad: peticion.prioridad ?? 'Media',
          estado: peticion.estado ?? 'Respondida',
          fecha_radicacion: peticion.fecha_radicacion || peticion.created_at,
        },
        respuesta: {
          mensaje: peticion.respuesta_mensaje || metaRespuesta.msg || 'Se ha emitido el pronunciamiento oficial de fondo en relación con este expediente.',
          funcionario: peticion.respuesta_funcionario || metaRespuesta.func || 'Oficina de Correspondencia y Gestión Documental',
          fecha_envio: peticion.respuesta_fecha_envio || metaRespuesta.fecha_envio || peticion.updated_at || peticion.created_at,
          expira_at: expiraDateObj.toISOString(),
          formatted_expira: formattedExpira,
          dias_restantes: diasRestantes,
          drive_url: peticion.respuesta_drive_url || metaRespuesta.drive || null,
          archivo_respuesta: respuestaFinalMapped,
        },
        subcarpetas: activeSubcarpetas,
        anexos: mappedFiles,
        responsables,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[CONSULTAR-RESPUESTA] Error interno:', err);
    return new Response(
      JSON.stringify({ success: false, code: 'SERVER_ERROR', error: 'Ocurrió un error al procesar la autenticación del expediente.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

