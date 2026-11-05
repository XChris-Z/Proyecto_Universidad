// src/pages/api/peticiones/subcarpetas/crear.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { supabase } from '@lib/supabase';
import { sendPeticionAssignmentEmail } from '@lib/email';
import { logSystemActivity } from '@lib/audit';
import { generatePin6, getDeterministicPin } from '@lib/security';

export const POST: APIRoute = async ({ request, url }) => {
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

    // 3. PASO 1 OBLIGATORIO: Validar datos e insertar primero en public.peticion_subcarpetas
    const { data: nuevaSub, error: errSub } = await (supabase
      .from('peticion_subcarpetas' as any)
      .insert({
        peticion_id: peticion.id,
        nombre: cleanNombre,
        descripcion: cleanDescripcion || null,
      } as any)
      .select('*')
      .single() as any);

    if (errSub || !nuevaSub) {
      console.error('Error estricto guardando subcarpeta en base de datos:', errSub);
      return new Response(
        JSON.stringify({
          success: false,
          error: `No se pudo registrar la subcarpeta en la base de datos: ${errSub?.message || 'Error en tabla peticion_subcarpetas'}. Verifique la ejecución del script supabase_subcarpetas.sql en Supabase.`,
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 4. Consultar catálogo de oficinas seleccionadas
    const { data: oficinasData, error: ofisErr } = await (supabase
      .from('oficinas' as any)
      .select('id, codigo, nombre, email_institucional')
      .in('id', cleanOfficeIds) as any);

    if (ofisErr || !oficinasData || oficinasData.length === 0) {
      // Revertir inserción de subcarpeta por consistencia
      await (supabase.from('peticion_subcarpetas' as any).delete().eq('id', nuevaSub.id) as any);
      return new Response(
        JSON.stringify({ success: false, error: 'No se encontraron las dependencias seleccionadas.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 5. PASO 2 OBLIGATORIO: Insertar las dependencias asignadas en public.peticion_responsables con subcarpeta_id real
    const filasResponsables = oficinasData.map((ofi: any) => ({
      peticion_id: peticion.id,
      subcarpeta_id: nuevaSub.id,
      oficina_id: ofi.id,
      estado_entrega: 'Pendiente',
      observaciones_entrega: `PIN:${pinAcceso} | [${cleanNombre}]${cleanDescripcion ? ` ${cleanDescripcion}` : ''}`,
    }));

    let { data: respInsertados, error: errResp } = await (supabase
      .from('peticion_responsables' as any)
      .insert(filasResponsables as any)
      .select('id, oficina_id, codigo_acceso, fecha_expiracion_codigo, storage_subfolder_path, estado_entrega, observaciones_entrega') as any);

    // Si falla por restricción unique_peticion_oficina (la dependencia ya estaba vinculada a la petición):
    if (
      errResp &&
      (errResp.code === '23505' ||
       String(errResp.message || '').includes('unique_peticion_oficina') ||
       String(errResp.message || '').includes('duplicate key'))
    ) {
      console.warn('Dependencia ya vinculada a la petición. Actualizando asignación existente con subcarpeta_id y observaciones...');
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
            : `${prevObs} | [${cleanNombre}]${cleanDescripcion ? ` ${cleanDescripcion}` : ''}`;

          await (supabase
            .from('peticion_responsables' as any)
            .update({
              subcarpeta_id: nuevaSub.id,
              observaciones_entrega: updatedObs,
            } as any)
            .eq('id', row.id) as any);
        }
        respInsertados = existingRows;
        errResp = null;
      }
    }

    if (errResp || !respInsertados || respInsertados.length === 0) {
      console.error('Error estricto guardando responsables de subcarpeta:', errResp);
      // Revertir inserción de subcarpeta para mantener atomicidad
      await (supabase.from('peticion_subcarpetas' as any).delete().eq('id', nuevaSub.id) as any);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Error asignando dependencias a la subcarpeta: ${errResp?.message || 'No se pudieron registrar las asignaciones en la base de datos.'}`,
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 6. PASO 4 OBLIGATORIO: Enviar notificaciones por correo SOLO tras confirmar persistencia en pasos 1 y 2
    const baseUrl = url.origin;
    const emailPromises = [];

    for (const resp of respInsertados) {
      const ofi = oficinasData.find((o: any) => o.id === resp.oficina_id);
      const isTestOffice = ofi?.codigo?.toUpperCase().includes('PRUEBA') || ofi?.nombre?.toLowerCase().includes('prueba');
      const targetEmail = isTestOffice ? (ofi?.email_institucional || null) : null;

      if (ofi && targetEmail) {
        const portalUrl = `${baseUrl}/portal-responsable?codigo=${encodeURIComponent(resp.codigo_acceso)}&email=${encodeURIComponent(targetEmail)}&pin=${encodeURIComponent(pinAcceso)}`;

        const emailPromise = sendPeticionAssignmentEmail({
          toEmail: targetEmail,
          oficinaNombre: ofi.nombre,
          numeroRadicado: peticion.numero_radicado,
          asunto: peticion.asunto,
          categoria: peticion.categoria,
          prioridad: peticion.prioridad,
          subcarpetas: [
            {
              nombre: cleanNombre,
              descripcion: cleanDescripcion || 'Subcarpeta y requerimiento asignado al expediente.',
            },
          ],
          instruccionesAnexos: cleanDescripcion || peticion.instrucciones_anexos,
          fechaLimiteEntrega: peticion.fecha_limite_entrega,
          fechaLimiteResponsable: peticion.fecha_limite_responsable,
          codigoAcceso: resp.codigo_acceso,
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
    await logSystemActivity({
      actor: { id: 'usr-root', name: 'Administrador Documental', role: 'funcionario' },
      action: `Nueva Subcarpeta "${cleanNombre}" en ${peticion.numero_radicado}`,
      actionType: 'MODIFICACION',
      entity: 'Peticiones Radicadas',
      entityId: peticion.numero_radicado,
      details: `Se registró en base de datos la subcarpeta "${cleanNombre}" con ${oficinasData.length} dependencias asignadas.`,
      severity: 'INFO',
    }).catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        subcarpeta: nuevaSub,
        responsables: respInsertados.map((r: any) => {
          const ofi = oficinasData.find((o: any) => o.id === r.oficina_id);
          return {
            id: r.id,
            oficina_id: r.oficina_id,
            oficina_nombre: ofi?.nombre,
            codigo_acceso: r.codigo_acceso,
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

