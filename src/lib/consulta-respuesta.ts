// src/lib/consulta-respuesta.ts
import { supabase } from '@lib/supabase';
import { getDeterministicPin } from '@lib/security';
import { separarRespuestaMeta, esSubcarpetaValida, filtrarSubcarpetasValidas } from '@lib/subcarpetas';

const INVALID_CREDENTIALS_MSG =
  'Las credenciales ingresadas (Correo o Código de 6 dígitos) no coinciden con este radicado.';

export interface ConsultaRespuestaParams {
  radicado?: string | null;
  correo?: string | null;
  email?: string | null;
  pin?: string | null;
  codigo?: string | null;
}

export type ConsultaRespuestaResult =
  | {
      ok: true;
      status: 200;
      data: {
        success: true;
        resolved_email: string;
        peticion: Record<string, any>;
        respuesta: Record<string, any>;
        subcarpetas: any[];
        anexos: any[];
        responsables: any[];
      };
    }
  | {
      ok: false;
      status: number;
      code: string;
      error: string;
      expira_at?: string;
      formatted_expira?: string;
    };

/**
 * Valida credenciales (radicado + PIN y/o correo institucional/solicitante) y retorna
 * el expediente completo desbloqueado o el código de estado correspondiente.
 * Reutilizado tanto por `/api/consultar-respuesta` como por SSR en `/consulta-respuesta`.
 */
export async function validarYConsultarRespuesta(
  params: ConsultaRespuestaParams
): Promise<ConsultaRespuestaResult> {
  try {
    const rawRadicado = String(params.radicado || '').trim().toUpperCase();
    const rawEmail = String(params.correo || params.email || '').trim().toLowerCase();
    const rawPin = String(params.pin || params.codigo || '').replace(/\s+/g, '').trim();

    if (!rawRadicado) {
      return {
        ok: false,
        status: 400,
        code: 'MISSING_RADICADO',
        error: 'Por favor ingrese el número de radicado.',
      };
    }

    if (!rawPin || rawPin.length < 4) {
      return {
        ok: false,
        status: 400,
        code: 'MISSING_PIN',
        error: 'Por favor ingrese el código de seguridad de 6 dígitos.',
      };
    }

    if (rawEmail && !rawEmail.includes('@')) {
      return {
        ok: false,
        status: 400,
        code: 'MISSING_EMAIL',
        error: 'Por favor ingrese un correo electrónico válido.',
      };
    }

    // 1. Consultar petición en base de datos (UUID o numero_radicado)
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawRadicado);
    let petQuery = supabase.from('peticiones' as any).select('*');
    if (isUuid) {
      petQuery = petQuery.eq('id', rawRadicado);
    } else {
      petQuery = petQuery.ilike('numero_radicado', rawRadicado);
    }
    const { data: peticion, error: petErr } = await (petQuery.maybeSingle() as any);

    if (petErr || !peticion) {
      return {
        ok: false,
        status: 404,
        code: 'NOT_FOUND',
        error: INVALID_CREDENTIALS_MSG,
      };
    }

    // 2. Parsear TODOS los bloques [RESPUESTA_META] en instrucciones_anexos y descripcion
    const parsedInst = separarRespuestaMeta(peticion.instrucciones_anexos || '');
    const parsedDesc = separarRespuestaMeta(peticion.descripcion || '');
    const allMetas = [...parsedDesc.allMetas, ...parsedInst.allMetas];
    const metaRespuesta =
      parsedInst.respuestaMeta ||
      parsedDesc.respuestaMeta ||
      (allMetas.length > 0 ? allMetas[allMetas.length - 1] : {}) ||
      {};

    // 3. Consultar responsables y logs de envío de este radicado antes de validar PIN/correo
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
      if (Array.isArray(dbResp)) responsables = dbResp;
    } catch {}

    let auditLogsForRadicado: any[] = [];
    try {
      const { data: dbAudit } = await (supabase
        .from('audit_logs' as any)
        .select('action, action_type, entity_id, details')
        .eq('action_type', 'RESPUESTA')
        .limit(300) as any);
      if (Array.isArray(dbAudit)) {
        const petIdStr = String(peticion.id || '');
        const radStr = String(peticion.numero_radicado || '').toUpperCase();
        auditLogsForRadicado = dbAudit.filter((log: any) => {
          const eid = String(log.entity_id || '').toUpperCase();
          const det = String(log.details || '').toUpperCase();
          return (petIdStr && eid === petIdStr.toUpperCase()) || (radStr && (eid === radStr || det.includes(radStr)));
        });
      }
    } catch {}

    // 4. Construir conjunto unificado de PINs válidos del expediente
    const validPins = new Set<string>();
    const addPin = (val: any) => {
      const clean = String(val || '').replace(/\s+/g, '').trim();
      if (clean && clean.length >= 4) validPins.add(clean);
    };

    addPin(peticion.pin_acceso);
    addPin(peticion.pin);
    addPin(peticion.respuesta_pin_solicitante);
    parsedInst.allPins.forEach(addPin);
    parsedDesc.allPins.forEach(addPin);
    responsables.forEach((r: any) => {
      const m = String(r?.observaciones_entrega || '').match(/PIN:\s*([0-9A-Z]{4,8})/i);
      if (m?.[1]) addPin(m[1]);
    });
    auditLogsForRadicado.forEach((log: any) => {
      const det = String(log.details || '');
      for (const m of det.matchAll(/PIN(?:\s+de\s+acceso)?\s*[:=]\s*([0-9A-Z]{4,8})/gi)) {
        if (m[1]) addPin(m[1]);
      }
    });
    addPin(getDeterministicPin(peticion.numero_radicado || peticion.id));

    if (!validPins.has(rawPin)) {
      return {
        ok: false,
        status: 401,
        code: 'INVALID_CREDENTIALS',
        error: INVALID_CREDENTIALS_MSG,
      };
    }

    // 5. Validación flexible de Correo Electrónico (original + email_destino modal + históricos + audit_logs)
    const allowedEmails = new Set<string>();
    const addEmail = (val: any) => {
      const clean = String(val || '').trim().toLowerCase();
      if (clean && clean.includes('@')) allowedEmails.add(clean);
    };

    [
      peticion.correo,
      peticion.email,
      peticion.solicitante_correo,
      peticion.solicitante_email,
      peticion.correo_solicitante,
      metaRespuesta?.email_destino,
      metaRespuesta?.correo,
      metaRespuesta?.to,
      metaRespuesta?.original_email,
      ...parsedInst.allEmails,
      ...parsedDesc.allEmails,
    ].forEach(addEmail);

    allMetas.forEach((m: any) => {
      addEmail(m?.email_destino);
      addEmail(m?.correo);
      addEmail(m?.to);
      addEmail(m?.original_email);
      if (Array.isArray(m?.emails_autorizados)) {
        m.emails_autorizados.forEach(addEmail);
      }
    });

    auditLogsForRadicado.forEach((log: any) => {
      const det = String(log.details || '');
      for (const m of det.matchAll(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g)) {
        addEmail(m[0]);
      }
    });

    const resolvedEmail =
      rawEmail ||
      String(
        metaRespuesta?.email_destino ||
          metaRespuesta?.correo ||
          metaRespuesta?.to ||
          peticion.solicitante_email ||
          peticion.solicitante_correo ||
          Array.from(allowedEmails)[0] ||
          ''
      )
        .trim()
        .toLowerCase();

    // Si viene correo ingresado que no estaba registrado aún pero el PIN coincide exactamente con
    // el del radicado o [RESPUESTA_META], se concede el acceso y se actualiza el correo autorizado.
    if (rawEmail && allowedEmails.size > 0 && !allowedEmails.has(rawEmail)) {
      allowedEmails.add(rawEmail);
      try {
        const cleanInst = parsedInst.textoLimpio;
        const prevAuthList = Array.isArray(metaRespuesta?.emails_autorizados)
          ? metaRespuesta.emails_autorizados
          : [];
        const updatedMeta = {
          ...(metaRespuesta && typeof metaRespuesta === 'object' ? metaRespuesta : {}),
          email_destino: metaRespuesta?.email_destino || rawEmail,
          correo: metaRespuesta?.correo || rawEmail,
          emails_autorizados: Array.from(new Set([...Array.from(allowedEmails), ...prevAuthList, rawEmail])),
        };
        const updatedInst = cleanInst
          ? `${cleanInst}\n\n[RESPUESTA_META]: ${JSON.stringify(updatedMeta)}`
          : `[RESPUESTA_META]: ${JSON.stringify(updatedMeta)}`;
        await (supabase
          .from('peticiones' as any)
          .update({ instrucciones_anexos: updatedInst } as any)
          .eq('id', peticion.id) as any);
      } catch {}
    }

    // 6. Verificación Matemática Estricta de los 10 Días (Candado Temporal)
    const ahora = Date.now();
    const fechaBaseExpiracion = peticion.respuesta_expira_at
      ? new Date(peticion.respuesta_expira_at).getTime()
      : metaRespuesta.expira
        ? new Date(metaRespuesta.expira).getTime()
        : peticion.respuesta_fecha_envio
          ? new Date(peticion.respuesta_fecha_envio).getTime() + 10 * 24 * 60 * 60 * 1000
          : metaRespuesta.fecha_envio
            ? new Date(metaRespuesta.fecha_envio).getTime() + 10 * 24 * 60 * 60 * 1000
            : peticion.updated_at
              ? new Date(peticion.updated_at).getTime() + 10 * 24 * 60 * 60 * 1000
              : null;

    const estaExpirado =
      fechaBaseExpiracion !== null && !Number.isNaN(fechaBaseExpiracion) && ahora > fechaBaseExpiracion;
    const diasRestantes = fechaBaseExpiracion
      ? Math.max(0, Math.ceil((fechaBaseExpiracion - ahora) / (1000 * 60 * 60 * 24)))
      : 10;

    const expiraDateObj = fechaBaseExpiracion
      ? new Date(fechaBaseExpiracion)
      : new Date(ahora + 10 * 24 * 60 * 60 * 1000);
    const formattedExpira = expiraDateObj.toLocaleDateString('es-CO', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    if (estaExpirado) {
      return {
        ok: false,
        status: 403,
        code: 'EXPIRED',
        error: `El periodo habilitado de 10 días calendario para consultar y descargar los documentos de este radicado venció el ${formattedExpira}. Por políticas de seguridad documental, el acceso público ha sido cerrado.`,
        expira_at: expiraDateObj.toISOString(),
        formatted_expira: formattedExpira,
      };
    }

    // 7. Consultar Subcarpetas y Anexos reales
    let subcarpetas: any[] = [];
    try {
      const { data: dbSubs } = await (supabase
        .from('peticion_subcarpetas' as any)
        .select('*')
        .eq('peticion_id', peticion.id)
        .order('created_at', { ascending: true }) as any);
      if (dbSubs && dbSubs.length > 0) subcarpetas = dbSubs;
    } catch {}

    let anexos: any[] = [];
    try {
      const { data: dbAnexos } = await (supabase
        .from('peticion_anexos' as any)
        .select('*')
        .eq('peticion_id', peticion.id)
        .order('created_at', { ascending: true }) as any);
      if (dbAnexos && dbAnexos.length > 0) anexos = dbAnexos;
    } catch {}

    // 7b. Respuesta Final Oficial
    const respMetaFile = metaRespuesta.archivo_respuesta || metaRespuesta.respuesta_archivo || null;
    const respInAnexos =
      anexos.find((a) => a && a.storage_path && String(a.storage_path).includes('/respuesta_final/')) || null;
    const rawRespFinal =
      respMetaFile && (respMetaFile.storage_path || respMetaFile.nombre_archivo) ? respMetaFile : respInAnexos;

    let respuestaFinalMapped: any = null;
    if (rawRespFinal && rawRespFinal.storage_path) {
      const respCleanPath = String(rawRespFinal.storage_path).replace(/^peticiones\//, '').replace(/^\/+/, '');
      respuestaFinalMapped = {
        id: rawRespFinal.id || 'resp-final',
        nombre_archivo: String(rawRespFinal.nombre_archivo || 'Respuesta_Oficial.pdf').replace(/^\[[^\]]+\]\s*/, ''),
        storage_path: rawRespFinal.storage_path,
        tamano_bytes: rawRespFinal.tamano_bytes ?? null,
        mime_type: rawRespFinal.mime_type || 'application/pdf',
        created_at:
          rawRespFinal.created_at ||
          peticion.respuesta_fecha_envio ||
          metaRespuesta.fecha_envio ||
          peticion.updated_at,
        download_url: `https://irjjpjtvhxoakiazfswn.supabase.co/storage/v1/object/public/peticiones/${respCleanPath}`,
        es_respuesta_final: true,
      };
    }

    // 7c. Anexos incluidos
    const anexosSinResp = anexos.filter(
      (a) =>
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
      if (!isOficinaAnexo) return true;
      if (!hasExplicitSelection) return true;
      return (
        allowedIds.has(String(a.id)) ||
        allowedIds.has(String(a.storage_path)) ||
        allowedIds.has(String(a.nombre_archivo))
      );
    });

    subcarpetas = filtrarSubcarpetasValidas(subcarpetas);

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

    const mappedFiles = includedFiles.map((a) => {
      const storagePath = a.storage_path || '';
      const cleanPath = storagePath.replace(/^peticiones\//, '').replace(/^\/+/, '');
      const downloadUrl = `https://irjjpjtvhxoakiazfswn.supabase.co/storage/v1/object/public/peticiones/${cleanPath}`;

      const respMatch = responsables.find(
        (r) =>
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
        nombre_archivo:
          String(a.nombre_archivo || 'Documento_Anexo.pdf')
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
        observacion,
      };
    });

    const officeMappedFiles = mappedFiles.filter((f) => f.es_anexo_oficina);
    const activeSubcarpetas = subcarpetas.filter((sub) => {
      const cleanSubName = String(sub.nombre || '').replace(/^subcarpeta\s+/i, '').trim().toLowerCase();
      return officeMappedFiles.some((f) => {
        if (f.subcarpeta_id && String(f.subcarpeta_id) === String(sub.id)) return true;
        const raw = String(f.nombre_raw || '').toLowerCase();
        return cleanSubName && (raw.includes(`[${cleanSubName}]`) || raw.includes(`[subcarpeta ${cleanSubName}]`));
      });
    });

    return {
      ok: true,
      status: 200,
      data: {
        success: true,
        resolved_email: resolvedEmail,
        peticion: {
          id: peticion.id,
          numero_radicado: peticion.numero_radicado,
          asunto: peticion.asunto,
          descripcion: parsedDesc.textoLimpio ?? '',
          solicitante_nombre: peticion.solicitante_nombre ?? 'Ciudadano(a)',
          solicitante_email: peticion.solicitante_email || metaRespuesta.email_destino || metaRespuesta.correo || '',
          solicitante_tipo: peticion.solicitante_tipo ?? 'Ciudadano',
          categoria: peticion.categoria ?? 'Petición General',
          prioridad: peticion.prioridad ?? 'Media',
          estado: peticion.estado ?? 'Respondida',
          fecha_radicacion: peticion.fecha_radicacion || peticion.created_at,
        },
        respuesta: {
          mensaje:
            peticion.respuesta_mensaje ||
            metaRespuesta.msg ||
            'Se ha emitido el pronunciamiento oficial de fondo en relación con este expediente.',
          funcionario:
            peticion.respuesta_funcionario ||
            metaRespuesta.func ||
            'Oficina de Correspondencia y Gestión Documental',
          fecha_envio:
            peticion.respuesta_fecha_envio || metaRespuesta.fecha_envio || peticion.updated_at || peticion.created_at,
          expira_at: expiraDateObj.toISOString(),
          formatted_expira: formattedExpira,
          dias_restantes: diasRestantes,
          drive_url: peticion.respuesta_drive_url || metaRespuesta.drive || null,
          archivo_respuesta: respuestaFinalMapped,
        },
        subcarpetas: activeSubcarpetas,
        anexos: mappedFiles,
        responsables,
      },
    };
  } catch (err: any) {
    console.error('[CONSULTAR-RESPUESTA] Error interno:', err);
    return {
      ok: false,
      status: 500,
      code: 'SERVER_ERROR',
      error: 'Ocurrió un error al procesar la autenticación del expediente.',
    };
  }
}

