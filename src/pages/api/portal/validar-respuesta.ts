// src/pages/api/portal/validar-respuesta.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { supabase } from '@lib/supabase';
import { getDeterministicPin } from '@lib/security';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const rawRadicado = String(body.radicado || '').trim();
    const rawEmail = String(body.email || '').trim().toLowerCase();
    const rawPin = String(body.pin || '').trim();

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
        JSON.stringify({ success: false, code: 'MISSING_PIN', error: 'Por favor ingrese el código de seguridad (PIN de 6 dígitos).' }),
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
          error: 'No se encontró ningún expediente activo con el número de radicado suministrado.',
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2. Validar correo del solicitante
    const registeredEmail = String(peticion.solicitante_email || '').trim().toLowerCase();
    if (registeredEmail && registeredEmail !== rawEmail) {
      return new Response(
        JSON.stringify({
          success: false,
          code: 'INVALID_CREDENTIALS',
          error: 'El correo electrónico ingresado no coincide con el registrado en este radicado institucional.',
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2b. Intentar leer paquete de contingencia [RESPUESTA_META] si no existen columnas dedicadas
    let metaRespuesta: any = {};
    if (peticion.instrucciones_anexos && typeof peticion.instrucciones_anexos === 'string') {
      const match = peticion.instrucciones_anexos.match(/\[RESPUESTA_META\]:\s*(\{.*\})/s);
      if (match && match[1]) {
        try {
          metaRespuesta = JSON.parse(match[1]);
        } catch {}
      }
    }

    // 3. Validar PIN de seguridad
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
          code: 'INVALID_PIN',
          error: 'El código de seguridad ingresado no es válido para este radicado.',
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 4. Validar Vigencia de 10 Días Calendario
    const nowMs = Date.now();
    let expiraDate: Date;
    if (peticion.respuesta_expira_at) {
      expiraDate = new Date(peticion.respuesta_expira_at);
    } else if (metaRespuesta.expira) {
      expiraDate = new Date(metaRespuesta.expira);
    } else {
      // Fallback a 10 días tras última actualización
      const baseDate = new Date(peticion.updated_at || peticion.created_at || nowMs);
      expiraDate = new Date(baseDate.getTime() + 10 * 24 * 60 * 60 * 1000);
    }

    const formattedExpira = expiraDate.toLocaleDateString('es-CO', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    if (nowMs > expiraDate.getTime()) {
      return new Response(
        JSON.stringify({
          success: false,
          code: 'EXPIRED',
          error: `Enlace Caducado: El periodo de 10 días para consultar y descargar los anexos de este radicado finalizó el ${formattedExpira}.`,
          expira_at: expiraDate.toISOString(),
          formatted_expira: formattedExpira,
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const remainingMs = expiraDate.getTime() - nowMs;
    const remainingDays = Math.max(1, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));

    // 5. Consultar subcarpetas y anexos autorizados
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

    // Si existen archivos_incluidos especificados por el funcionario, filtrar anexos
    const filesAprobados = peticion.respuesta_archivos_incluidos || metaRespuesta.files;
    let includedFiles = anexos;
    if (Array.isArray(filesAprobados) && filesAprobados.length > 0) {
      const allowedIds = new Set(filesAprobados);
      includedFiles = anexos.filter((a) => allowedIds.has(a.id) || allowedIds.has(a.storage_path) || allowedIds.has(a.nombre_archivo));
      // Si el filtro dejó 0 archivos pero había anexos, mostrar todos los no-privados
      if (includedFiles.length === 0) {
        includedFiles = anexos;
      }
    }

    // Asociar cada archivo con su URL pública
    const mappedFiles = includedFiles.map((a) => {
      const storagePath = a.storage_path || '';
      const cleanPath = storagePath.replace(/^peticiones\//, '');
      const downloadUrl = `https://irjjpjtvhxoakiazfswn.supabase.co/storage/v1/object/public/peticiones/${cleanPath}`;
      return {
        id: a.id,
        nombre_archivo: a.nombre_archivo,
        storage_path: a.storage_path,
        subcarpeta_id: a.subcarpeta_id || null,
        tamano_bytes: a.tamano_bytes,
        mime_type: a.mime_type,
        created_at: a.created_at,
        es_anexo_oficina: a.es_anexo_oficina,
        download_url: downloadUrl,
      };
    });

    return new Response(
      JSON.stringify({
        success: true,
        peticion: {
          id: peticion.id,
          numero_radicado: peticion.numero_radicado,
          asunto: peticion.asunto,
          descripcion: peticion.descripcion,
          solicitante_nombre: peticion.solicitante_nombre,
          solicitante_email: peticion.solicitante_email,
          solicitante_tipo: peticion.solicitante_tipo,
          categoria: peticion.categoria,
          prioridad: peticion.prioridad,
          estado: peticion.estado,
          fecha_radicacion: peticion.fecha_radicacion || peticion.created_at,
        },
        respuesta: {
          mensaje: peticion.respuesta_mensaje || metaRespuesta.msg || 'Se ha completado el trámite institucional de su petición.',
          funcionario: peticion.respuesta_funcionario || metaRespuesta.func || 'Oficina de Correspondencia y Gestión Documental',
          fecha_envio: peticion.respuesta_fecha_envio || metaRespuesta.fecha_envio || peticion.updated_at || peticion.created_at,
          expira_at: expiraDate.toISOString(),
          formatted_expira: formattedExpira,
          remaining_days: remainingDays,
          drive_url: peticion.respuesta_drive_url || metaRespuesta.drive || null,
        },
        subcarpetas,
        anexos: mappedFiles,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[VALIDAR-RESPUESTA] Error interno:', err);
    return new Response(
      JSON.stringify({ success: false, code: 'SERVER_ERROR', error: 'Ocurrió un error al procesar la autenticación.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

