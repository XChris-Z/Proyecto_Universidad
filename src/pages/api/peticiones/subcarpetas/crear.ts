// src/pages/api/peticiones/subcarpetas/crear.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { supabase } from '@lib/supabase';
import {
  sendPeticionAssignmentEmail,
  resolvePublicBaseUrl,
  limpiarTextoRequerimiento,
} from '@lib/email';
import { separarRespuestaMeta } from '@lib/subcarpetas';
import { logSystemActivity } from '@lib/audit';
import { extractClientIp, resolveSessionActor } from '@lib/request-actor';
import { generatePin6, getDeterministicPin } from '@lib/security';
import {
  isGoogleDriveConfigured,
  inicializarEstructuraExpedienteDrive,
} from '@lib/google-drive';

export const POST: APIRoute = async ({ request, url, cookies, clientAddress }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const { peticion_id, nombre, descripcion, oficina_ids } = body;

    if (!peticion_id || !nombre || !nombre.trim()) {
      return new Response(
        JSON.stringify({ success: false, error: 'El ID de la petición y el nombre de la subcarpeta son obligatorios.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const cleanNombre = nombre.trim();
    const cleanDescripcion = (descripcion || '').trim();
    const cleanOfficeIds: string[] = Array.isArray(oficina_ids) ? oficina_ids.filter(Boolean) : [];

    if (cleanOfficeIds.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Debe seleccionar al menos una dependencia responsable para esta subcarpeta.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 1. Consultar la petición existente
    const { data: peticion, error: petError } = await (supabase
      .from('peticiones' as any)
      .select('*')
      .eq('id', peticion_id)
      .single() as any);

    if (petError || !peticion) {
      return new Response(
        JSON.stringify({ success: false, error: 'No se encontró la petición en la base de datos.' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2. Obtener o generar PIN de 6 dígitos seguro para el radicado
    const pinAcceso = peticion.pin_acceso || getDeterministicPin(peticion.numero_radicado || peticion.id);

    // 3. Validar e insertar en public.peticion_subcarpetas si la tabla física existe
    let isPhysicalTable = false;
    let nuevaSub: any = null;

    try {
      const { data: subData, error: errSub } = await (supabase
        .from('peticion_subcarpetas' as any)
        .insert({
          peticion_id: peticion.id,
          nombre: cleanNombre,
          descripcion: cleanDescripcion || null,
        } as any)
        .select('*')
        .single() as any);

      if (!errSub && subData?.id) {
        nuevaSub = subData;
        isPhysicalTable = true;
      } else {
        console.warn('Aviso: peticion_subcarpetas no disponible en schema cache, utilizando arquitectura virtual resiliente:', errSub?.message);
      }
    } catch (e: any) {
      console.warn('Excepción consultando peticion_subcarpetas:', e?.message);
    }

    // Si la tabla física no existe en Supabase, persistir de forma duradera en peticiones.instrucciones_anexos
    if (!nuevaSub) {
      const safeKey = cleanNombre.replace(/[^A-Za-z0-9_-]/g, '_');
      nuevaSub = {
        id: `sub-inf-${peticion.id}-${safeKey}`,
        peticion_id: peticion.id,
        nombre: cleanNombre,
        descripcion: cleanDescripcion || null,
      };

      const currentInst = peticion.instrucciones_anexos || '';
      const newEntry = `[${cleanNombre}]: ${cleanDescripcion || 'Sin requerimiento específico'}`;
      const updatedInst = currentInst.includes(`[${cleanNombre}]`)
        ? currentInst
        : (currentInst ? `${currentInst}\n${newEntry}` : newEntry);

      await (supabase
        .from('peticiones' as any)
        .update({ instrucciones_anexos: updatedInst } as any)
        .eq('id', peticion.id) as any);
    }

    // 4. Consultar catálogo de oficinas seleccionadas
    const { data: oficinasData, error: ofisErr } = await (supabase
      .from('oficinas' as any)
      .select('id, codigo, nombre, email_institucional')
      .in('id', cleanOfficeIds) as any);

    if (ofisErr || !oficinasData || oficinasData.length === 0) {
      if (isPhysicalTable && nuevaSub?.id) {
        await (supabase.from('peticion_subcarpetas' as any).delete().eq('id', nuevaSub.id) as any);
      }
      return new Response(
        JSON.stringify({ success: false, error: 'No se encontraron las dependencias seleccionadas.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 5. Insertar o actualizar asignaciones en public.peticion_responsables
    let hasSubcarpetaCol = isPhysicalTable;
    if (hasSubcarpetaCol) {
      try {
        const probeRes = await (supabase
          .from('peticion_responsables' as any)
          .select('id, subcarpeta_id')
          .limit(1) as any);
        if (
          probeRes.error &&
          (String(probeRes.error.message || '').includes('subcarpeta_id') ||
           probeRes.error.code === '42703' ||
           probeRes.error.code === 'PGRST204')
        ) {
          hasSubcarpetaCol = false;
        }
      } catch {
        hasSubcarpetaCol = false;
      }
    }

    const filasResponsables = oficinasData.map((ofi: any) => {
      const row: any = {
        peticion_id: peticion.id,
        oficina_id: ofi.id,
        estado_entrega: 'Pendiente',
        observaciones_entrega: `PIN:${pinAcceso} | [${cleanNombre}]`,
      };
      if (hasSubcarpetaCol && nuevaSub.id && !nuevaSub.id.startsWith('sub-inf-')) {
        row.subcarpeta_id = nuevaSub.id;
      }
      return row;
    });

    let respInsertados: any[] = [];
    let errResp: any = null;

    const insertResult = await (supabase
      .from('peticion_responsables' as any)
      .insert(filasResponsables as any)
      .select('id, oficina_id, codigo_acceso, fecha_expiracion_codigo, storage_subfolder_path, estado_entrega, observaciones_entrega') as any);

    respInsertados = insertResult.data || [];
    errResp = insertResult.error;

    // Si falló por subcarpeta_id column inexistente, reintentar sin ella
    if (errResp && (String(errResp.message || '').includes('subcarpeta_id') || errResp.code === '42703')) {
      hasSubcarpetaCol = false;
      const fallbackRows = filasResponsables.map((r: any) => {
        const { subcarpeta_id, ...rest } = r;
        return rest;
      });
      const retryResult = await (supabase
        .from('peticion_responsables' as any)
        .insert(fallbackRows as any)
        .select('id, oficina_id, codigo_acceso, fecha_expiracion_codigo, storage_subfolder_path, estado_entrega, observaciones_entrega') as any);
      respInsertados = retryResult.data || [];
      errResp = retryResult.error;
    }

    // Si falla por restricción unique_peticion_oficina o duplicate key (la dependencia ya estaba vinculada a la petición):
    if (
      errResp &&
      (errResp.code === '23505' ||
       String(errResp.message || '').includes('unique_peticion_oficina') ||
       String(errResp.message || '').includes('duplicate key'))
    ) {
      console.warn('Dependencia ya vinculada a la petición. Actualizando asignación existente con subcarpeta y observaciones...');
      const { data: existingRows, error: errExisting } = await (supabase
        .from('peticion_responsables' as any)
        .select('id, oficina_id, codigo_acceso, fecha_expiracion_codigo, storage_subfolder_path, estado_entrega, observaciones_entrega')
        .eq('peticion_id', peticion.id)
        .in('oficina_id', cleanOfficeIds) as any);

      if (!errExisting && existingRows && existingRows.length > 0) {
        for (const row of existingRows) {
          const prevObs = row.observaciones_entrega || '';
          const updatedObs = prevObs.includes(`[${cleanNombre}]`)
            ? prevObs
            : `${prevObs} | [${cleanNombre}]`;

          const updatePayload: any = {
            observaciones_entrega: updatedObs,
          };
          if (hasSubcarpetaCol && nuevaSub.id && !nuevaSub.id.startsWith('sub-inf-')) {
            updatePayload.subcarpeta_id = nuevaSub.id;
          }

          await (supabase
            .from('peticion_responsables' as any)
            .update(updatePayload as any)
            .eq('id', row.id) as any);

          row.observaciones_entrega = updatedObs;
        }
        respInsertados = existingRows;
        errResp = null;
      }
    }

    if (errResp || !respInsertados || respInsertados.length === 0) {
      console.error('Error estricto guardando responsables de subcarpeta:', errResp);
      if (isPhysicalTable && nuevaSub?.id) {
        await (supabase.from('peticion_subcarpetas' as any).delete().eq('id', nuevaSub.id) as any);
      }
      return new Response(
        JSON.stringify({
          success: false,
          error: `Error asignando dependencias a la subcarpeta: ${errResp?.message || 'No se pudieron registrar las asignaciones en la base de datos.'}`,
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 6. PASO 4 OBLIGATORIO: Enviar notificaciones por correo SOLO tras confirmar persistencia en pasos 1 y 2
    const baseUrl = resolvePublicBaseUrl(request, url);
    const { textoLimpio: fallbackPetInst } = separarRespuestaMeta(peticion.instrucciones_anexos || '');
    const cleanSubDesc = limpiarTextoRequerimiento(cleanDescripcion || fallbackPetInst);
    const emailPromises = [];

    for (const resp of respInsertados) {
      const ofi = oficinasData.find((o: any) => o.id === resp.oficina_id);
      const isTestOffice = ofi?.codigo?.toUpperCase().includes('PRUEBA') || ofi?.nombre?.toLowerCase().includes('prueba');
      const targetEmail = isTestOffice ? (ofi?.email_institucional || null) : null;

      if (ofi && targetEmail) {
        const safeCodigo = resp.codigo_acceso || 'UPQ';
        const portalUrl = `${baseUrl}/portal-responsable?radicado=${encodeURIComponent(peticion.numero_radicado)}&codigo=${encodeURIComponent(safeCodigo)}&email=${encodeURIComponent(targetEmail)}&pin=${encodeURIComponent(pinAcceso)}`;

        const emailPromise = sendPeticionAssignmentEmail({
          toEmail: targetEmail,
          oficinaNombre: ofi.nombre,
          numeroRadicado: peticion.numero_radicado,
          asunto: peticion.asunto,
          categoria: peticion.categoria,
          prioridad: peticion.prioridad,
          fechaRadicacion: peticion.fecha_radicacion || peticion.created_at || null,
          subcarpetas: [
            {
              nombre: cleanNombre,
              descripcion: cleanSubDesc,
            },
          ],
          instruccionesAnexos: cleanSubDesc,
          fechaLimiteEntrega: peticion.fecha_limite_entrega,
          fechaLimiteResponsable: peticion.fecha_limite_responsable,
          codigoAcceso: safeCodigo,
          pinAcceso: pinAcceso,
          portalUrl,
        }).catch((err: any) => {
          console.warn(`[EMAIL ERROR] Falló correo a ${targetEmail}:`, err.message);
          return { success: false, error: err.message };
        });

        emailPromises.push(emailPromise);
      }
    }

    await Promise.allSettled(emailPromises);

    // 7. Registro de Auditoría
    const actor = await resolveSessionActor(cookies);
    await logSystemActivity({
      actor,
      action: `Nueva Subcarpeta "${cleanNombre}" en ${peticion.numero_radicado}`,
      actionType: 'MODIFICACION',
      entity: 'Peticiones Radicadas',
      entityId: peticion.numero_radicado,
      details: `Se registró en base de datos la subcarpeta "${cleanNombre}" con ${oficinasData.length} dependencias asignadas.`,
      severity: 'INFO',
      cookies,
      ip: extractClientIp(request, clientAddress),
    }).catch(() => {});

    // Sincronización incremental de la nueva subcarpeta en Google Drive (no bloqueante)
    let driveSynced = false;
    let driveUrl: string | null = null;
    if (isGoogleDriveConfigured()) {
      try {
        const driveRes = await inicializarEstructuraExpedienteDrive(peticion.id);
        driveSynced = Boolean(driveRes.synced);
        driveUrl = driveRes.webViewLink || null;
      } catch (driveErr: any) {
        console.warn('[SUBCARPETAS CREAR] Aviso sincronizando subcarpeta en Drive (no fatal):', driveErr?.message);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        driveSynced,
        driveUrl,
        subcarpeta: nuevaSub,
        responsables: respInsertados.map((r: any) => {
          const ofi = oficinasData.find((o: any) => o.id === r.oficina_id);
          return {
            id: r.id,
            oficina_id: r.oficina_id,
            oficina_nombre: ofi?.nombre,
            codigo_acceso: r.codigo_acceso || 'UPQ',
            subcarpeta_id: nuevaSub.id,
            estado_entrega: r.estado_entrega || 'Pendiente',
            observaciones_entrega: r.observaciones_entrega,
          };
        }),
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error en /api/peticiones/subcarpetas/crear:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Error interno del servidor.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

