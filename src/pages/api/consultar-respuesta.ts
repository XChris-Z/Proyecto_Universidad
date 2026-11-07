// src/pages/api/consultar-respuesta.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { supabase } from '@lib/supabase';
import { getDeterministicPin } from '@lib/security';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const rawRadicado = String(body.radicado || '').trim().toUpperCase();
    const rawEmail = String(body.correo || body.email || '').trim().toLowerCase();
    const rawPin = String(body.pin || body.codigo || '').trim();

    if (!rawRadicado) {
      return new Response(
        JSON.stringify({ success: false, code: 'MISSING_RADICADO', error: 'Por favor ingrese el número de radicado.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!rawEmail || !rawEmail.includes('@')) {
      return new Response(
        JSON.stringify({ success: false, code: 'MISSING_EMAIL', error: 'Por favor ingrese un correo electrónico válido.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!rawPin || rawPin.length < 4) {
      return new Response(
        JSON.stringify({ success: false, code: 'MISSING_PIN', error: 'Por favor ingrese el código de seguridad de 6 dígitos.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 1. Consultar la petición en la base de datos
    const { data: peticion, error: petErr } = await (supabase
      .from('peticiones' as any)
      .select('*')
      .or(`numero_radicado.ilike.${rawRadicado},id.eq.${rawRadicado}`)
      .maybeSingle() as any);

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

    // 2. Extraer paquete de contingencia si no existen columnas dedicadas en BD
    let metaRespuesta: any = {};
    if (peticion.instrucciones_anexos && typeof peticion.instrucciones_anexos === 'string') {
      const match = peticion.instrucciones_anexos.match(/\[RESPUESTA_META\]:\s*(\{.*\})/s);
      if (match && match[1]) {
        try {
          metaRespuesta = JSON.parse(match[1]);
        } catch {}
      }
    }

    // 3. Validar Correo Electrónico del Solicitante
    const registeredEmail = String(peticion.solicitante_email || '').trim().toLowerCase();
    if (registeredEmail && registeredEmail !== rawEmail) {
      return new Response(
        JSON.stringify({
          success: false,
          code: 'INVALID_CREDENTIALS',
          error: 'Las credenciales ingresadas (Correo o Código de 6 dígitos) no coinciden con este radicado.',
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 4. Validar PIN de Seguridad (6 dígitos)
    const expectedPin = String(
      peticion.respuesta_pin_solicitante ||
      metaRespuesta.pin ||
      peticion.pin_acceso ||
      getDeterministicPin(peticion.numero_radicado || peticion.id)
    ).trim();

    if (expectedPin && expectedPin !== rawPin) {
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

    // Filtrar anexos incluidos por el funcionario si se especificaron
    const filesAprobados = peticion.respuesta_archivos_incluidos || metaRespuesta.files;
    let includedFiles = anexos;
    if (Array.isArray(filesAprobados) && filesAprobados.length > 0) {
      const allowedIds = new Set(filesAprobados);
      includedFiles = anexos.filter((a) => allowedIds.has(a.id) || allowedIds.has(a.storage_path) || allowedIds.has(a.nombre_archivo));
      if (includedFiles.length === 0) {
        includedFiles = anexos;
      }
    }

    // Inferir subcarpetas virtuales a partir de los nombres de los anexos [Subcarpeta] si la tabla física no tiene registros
    if (subcarpetas.length === 0) {
      const subsMap: Record<string, any> = {};
      includedFiles.forEach((a) => {
        const rawName = String(a.nombre_archivo || '');
        const match = rawName.match(/^\[([^\]]+)\]/);
        if (match && match[1]) {
          const subKey = match[1].trim();
          if (!subsMap[subKey]) {
            subsMap[subKey] = {
              id: `inf-${subKey.replace(/[^A-Za-z0-9_-]/g, '_')}`,
              nombre: subKey,
              descripcion: null,
            };
          }
        }
      });
      subcarpetas = Object.values(subsMap);
    }

    // Asociar cada archivo con su URL pública
    const mappedFiles = includedFiles.map((a) => {
      const storagePath = a.storage_path || '';
      const cleanPath = storagePath.replace(/^peticiones\//, '');
      const downloadUrl = `https://irjjpjtvhxoakiazfswn.supabase.co/storage/v1/object/public/peticiones/${cleanPath}`;
      
      // Asociar información del responsable / dependencia si existe
      const respMatch = responsables.find((r) => r.id === a.peticion_responsable_id || r.subcarpeta_id === a.subcarpeta_id);
      const oficinaNombre = respMatch?.oficinas?.nombre || null;
      const observacion = respMatch?.observaciones_entrega || respMatch?.observaciones || null;

      return {
        id: a.id,
        nombre_archivo: a.nombre_archivo,
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
        },
        subcarpetas,
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
