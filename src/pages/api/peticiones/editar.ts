// src/pages/api/peticiones/editar.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { supabase, supabaseAdmin } from '@lib/supabase';
import { logSystemActivity, computeHumanDiff } from '@lib/audit';
import { resolveSessionActor } from '@lib/request-actor';
import { tienePermiso } from '@lib/permisos';
import { renombrarCarpetaRadicadoEnDrive } from '@lib/google-drive';

const db: any = supabaseAdmin || supabase;

export const POST: APIRoute = async ({ request, clientAddress, cookies }) => {
  try {
    // 1. Validar sesión y permisos RBAC
    const actor = await resolveSessionActor(cookies);
    const canEdit =
      tienePermiso(actor, 'archivos', 'editar') ||
      tienePermiso(actor, 'peticiones', 'editar');

    if (!canEdit) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Acceso no autorizado: No cuenta con permisos para editar expedientes o carpetas.',
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body = await request.json();
    const {
      id,
      numero_radicado,
      asunto,
      solicitante_nombre,
      solicitante_email,
      solicitante_tipo,
      categoria,
      clasificacion_peticion,
      prioridad,
      estado,
      fecha_limite_entrega,
      fecha_limite_responsable,
      descripcion,
      instrucciones_anexos,
    } = body;

    if (!id) {
      return new Response(
        JSON.stringify({ success: false, error: 'El identificador (ID) de la petición es obligatorio.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2. Consultar registro existente completo antes de actualizar
    const { data: previousData, error: fetchErr } = await (db
      .from('peticiones' as any)
      .select('*')
      .eq('id', id)
      .single() as any);

    if (fetchErr || !previousData) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `No se encontró el expediente solicitado: ${fetchErr?.message || 'Registro inexistente'}`,
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 3. Manejo de número de radicado y validación anti-duplicados
    let cleanRadicado: string | undefined = undefined;
    let radicadoChanged = false;

    if (numero_radicado !== undefined) {
      cleanRadicado = String(numero_radicado)
        .replace(/[/\\?%*:|"<>]/g, '-')
        .replace(/\s+/g, ' ')
        .trim();

      if (!cleanRadicado) {
        return new Response(
          JSON.stringify({ success: false, error: 'El número de radicado no puede estar vacío.' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (cleanRadicado.toLowerCase() !== String(previousData.numero_radicado || '').toLowerCase()) {
        radicadoChanged = true;

        // Validar que no exista otro expediente con ese mismo radicado
        const { data: existingConflict } = await (db
          .from('peticiones' as any)
          .select('id, numero_radicado')
          .ilike('numero_radicado', cleanRadicado)
          .neq('id', id)
          .maybeSingle() as any);

        if (existingConflict) {
          return new Response(
            JSON.stringify({
              success: false,
              code: 'DUPLICATE_RADICADO',
              error: `Ya existe otro expediente registrado con el radicado '${cleanRadicado}'. Ingrese un valor diferente o un sufijo identificador.`,
            }),
            { status: 409, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    // 4. Preparar payload de actualización seguro contra columnas existentes
    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (cleanRadicado !== undefined) updatePayload.numero_radicado = cleanRadicado;
    if (asunto !== undefined) updatePayload.asunto = String(asunto).trim();
    if (solicitante_nombre !== undefined) updatePayload.solicitante_nombre = String(solicitante_nombre).trim();
    if (solicitante_email !== undefined) updatePayload.solicitante_email = String(solicitante_email).trim();
    if (solicitante_tipo !== undefined) updatePayload.solicitante_tipo = String(solicitante_tipo).trim();
    if (categoria !== undefined) updatePayload.categoria = String(categoria).trim();
    if (clasificacion_peticion !== undefined) updatePayload.clasificacion_peticion = String(clasificacion_peticion).trim();
    if (prioridad !== undefined) updatePayload.prioridad = String(prioridad).trim();
    if (estado !== undefined) updatePayload.estado = String(estado).trim();
    if (descripcion !== undefined) updatePayload.descripcion = String(descripcion).trim();
    if (instrucciones_anexos !== undefined) updatePayload.instrucciones_anexos = String(instrucciones_anexos).trim();

    if (fecha_limite_entrega) {
      updatePayload.fecha_limite_entrega = String(fecha_limite_entrega).trim().slice(0, 10);
    }
    if (fecha_limite_responsable) {
      updatePayload.fecha_limite_responsable = String(fecha_limite_responsable).trim().slice(0, 10);
    }

    // 5. Normalización de estado para compatibilidad con restricciones check de base de datos
    const normalizeEstadoCandidates = (raw?: string): string[] => {
      if (!raw) return [];
      const lower = String(raw).toLowerCase().trim();
      const map: Record<string, string[]> = {
        respondida: ['Respondida', 'respondida', 'resuelta', 'finalizada', 'cerrada'],
        en_tramite: ['En Trámite', 'en_tramite', 'pendiente'],
        'en trámite': ['En Trámite', 'en_tramite', 'pendiente'],
        pendiente: ['En Trámite', 'pendiente', 'en_tramite'],
        revision: ['Revisión', 'revision'],
        revisión: ['Revisión', 'revision'],
        vencida: ['Vencida', 'vencida'],
        archivada: ['Archivada', 'archivada', 'cerrada'],
        cerrada: ['Cerrada', 'cerrada', 'archivada'],
      };
      return Array.from(new Set([raw, ...(map[lower] || [])]));
    };

    let updated: any = null;
    let error: any = null;

    if (updatePayload.estado !== undefined) {
      const candidates = normalizeEstadoCandidates(String(updatePayload.estado));
      for (const candidate of candidates) {
        const res = await (db
          .from('peticiones' as any)
          .update({ ...updatePayload, estado: candidate })
          .eq('id', id)
          .select()
          .single() as any);
        updated = res.data;
        error = res.error;
        if (!error) break;
        if (error.code !== '23514' && !/check constraint/i.test(error.message || '')) break;
      }

      // Si aún falla por restricción de estado, reintentar preservando el estado previo
      if (error && (error.code === '23514' || /check constraint/i.test(error.message || ''))) {
        const { estado: _omitted, ...safePayload } = updatePayload;
        const retryRes = await (db
          .from('peticiones' as any)
          .update(safePayload)
          .eq('id', id)
          .select()
          .single() as any);
        updated = retryRes.data;
        error = retryRes.error;
      }
    } else {
      const res = await (db
        .from('peticiones' as any)
        .update(updatePayload)
        .eq('id', id)
        .select()
        .single() as any);
      updated = res.data;
      error = res.error;
    }

    if (error || !updated) {
      return new Response(
        JSON.stringify({ success: false, error: error?.message || 'Error al actualizar expediente en la base de datos.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 6. Renombrado en Google Drive si el radicado cambió y tiene carpeta vinculada
    let driveRenamed = false;
    if (radicadoChanged && cleanRadicado) {
      const folderRef = previousData.drive_folder_id || previousData.drive_folder_url;
      if (folderRef) {
        const renameRes = await renombrarCarpetaRadicadoEnDrive(folderRef, cleanRadicado);
        driveRenamed = renameRes.success;
      }
    }

    // 7. Auditoría con cálculo de Diff Humano (antes vs después)
    const fieldLabels: Record<string, string> = {
      numero_radicado: 'Número de Radicado / Carpeta Raíz',
      asunto: 'Asunto del Expediente',
      solicitante_nombre: 'Solicitante',
      solicitante_email: 'Correo del Solicitante',
      solicitante_tipo: 'Tipo de Solicitante',
      categoria: 'Clasificación de Petición',
      clasificacion_peticion: 'Clasificación de Petición',
      prioridad: 'Prioridad',
      estado: 'Estado',
      fecha_limite_entrega: 'Fecha Límite General',
      fecha_limite_responsable: 'Plazo Oficinas Responsables',
      descripcion: 'Descripción / Instrucciones',
      instrucciones_anexos: 'Instrucciones de Anexos',
    };

    const { diffText, changedFieldsCount } = computeHumanDiff(previousData, updatePayload, fieldLabels);

    const radicadoFinal = updated.numero_radicado || previousData.numero_radicado || id;

    if (changedFieldsCount > 0) {
      const driveNotice = driveRenamed ? ' (Carpeta renombrada en Google Drive)' : '';
      await logSystemActivity({
        actor,
        action: `Edición de Expediente (${radicadoFinal})`,
        actionType: 'MODIFICACION',
        entity: 'Peticiones Radicadas',
        entityId: radicadoFinal,
        details: `Cambios realizados en ${radicadoFinal}${driveNotice}: ${diffText}`,
        before: previousData,
        after: updated,
        severity: 'INFO',
        request,
        clientAddress,
        cookies,
      }).catch((err) => console.error('[AUDITORIA ERROR] Error registrando auditoría editar expediente:', err));
    }

    return new Response(
      JSON.stringify({
        success: true,
        peticion: updated,
        driveRenamed,
        diff: diffText,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[API Editar Petición Error]:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'Error interno al actualizar expediente.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
