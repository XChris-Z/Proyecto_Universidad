// src/pages/api/peticiones/crear.ts
import type { APIRoute } from 'astro';
import { supabase } from '@lib/supabase';
import { sendPeticionAssignmentEmail } from '@lib/email';

export const POST: APIRoute = async ({ request, url }) => {
  try {
    const body = await request.json();
    const {
      asunto,
      descripcion,
      solicitante_nombre,
      solicitante_email,
      solicitante_tipo = 'Ciudadano',
      categoria = 'Petición General',
      prioridad = 'Media',
      fecha_limite_entrega,
      oficina_ids = [],
    } = body;

    if (!asunto || !solicitante_nombre || !fecha_limite_entrega) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Campos obligatorios faltantes: asunto, solicitante_nombre o fecha_limite_entrega.',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!Array.isArray(oficina_ids) || oficina_ids.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Debe seleccionar al menos una oficina responsable del catálogo.',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 1. Insertar Petición en Base de Datos (Disparador calcula Radicado y Margen de 5 Días)
    const { data: peticionData, error: peticionError } = await (supabase
      .from('peticiones' as any)
      .insert({
        asunto,
        descripcion,
        solicitante_nombre,
        solicitante_email,
        solicitante_tipo,
        categoria,
        prioridad,
        fecha_limite_entrega,
        // fecha_limite_responsable y storage_folder_path son calculados automáticamente por trigger PL/pgSQL
      } as any)
      .select()
      .single() as any);

    if (peticionError || !peticionData) {
      console.error('Error insertando petición:', peticionError);
      return new Response(
        JSON.stringify({ success: false, error: peticionError?.message || 'Error guardando petición' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2. Obtener información de las oficinas seleccionadas
    const { data: oficinasData, error: oficinasError } = await (supabase
      .from('oficinas' as any)
      .select('id, nombre, email_institucional')
      .in('id', oficina_ids) as any);

    if (oficinasError || !oficinasData || oficinasData.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No se encontraron las oficinas seleccionadas.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 3. Crear asignaciones en peticion_responsables (Trigger genera código único y subcarpeta)
    const asignacionesToInsert = oficinasData.map((ofi: any) => ({
      peticion_id: peticionData.id,
      oficina_id: ofi.id,
      estado_entrega: 'Pendiente',
    }));

    const { data: responsablesData, error: respError } = await (supabase
      .from('peticion_responsables' as any)
      .insert(asignacionesToInsert as any)
      .select('id, oficina_id, codigo_acceso, fecha_expiracion_codigo, storage_subfolder_path, estado_entrega') as any);

    if (respError || !responsablesData) {
      console.error('Error asignando responsables:', respError);
      return new Response(
        JSON.stringify({ success: false, error: respError?.message || 'Error asignando oficinas responsables' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 4. Enviar correos automáticos institucionales a cada oficina con su código y enlace
    const baseUrl = url.origin;
    const portalUrl = `${baseUrl}/portal-responsable`;

    const emailNotifications = [];
    for (const resp of responsablesData) {
      const oficina = oficinasData.find((o: any) => o.id === resp.oficina_id);
      if (oficina && oficina.email_institucional) {
        const emailPromise = sendPeticionAssignmentEmail({
          toEmail: oficina.email_institucional,
          oficinaNombre: oficina.nombre,
          numeroRadicado: peticionData.numero_radicado,
          asunto: peticionData.asunto,
          descripcion: peticionData.descripcion,
          fechaLimiteEntrega: peticionData.fecha_limite_entrega,
          fechaLimiteResponsable: peticionData.fecha_limite_responsable,
          codigoAcceso: resp.codigo_acceso,
          portalUrl,
        });
        emailNotifications.push(emailPromise);
      }
    }

    await Promise.allSettled(emailNotifications);

    return new Response(
      JSON.stringify({
        success: true,
        peticion: {
          id: peticionData.id,
          numero_radicado: peticionData.numero_radicado,
          asunto: peticionData.asunto,
          fecha_limite_entrega: peticionData.fecha_limite_entrega,
          fecha_limite_responsable: peticionData.fecha_limite_responsable,
          storage_folder_path: peticionData.storage_folder_path,
        },
        responsables: responsablesData.map((r: any) => {
          const ofi = oficinasData.find((o: any) => o.id === r.oficina_id);
          return {
            id: r.id,
            oficina_nombre: ofi?.nombre,
            email_institucional: ofi?.email_institucional,
            codigo_acceso: r.codigo_acceso,
            storage_subfolder_path: r.storage_subfolder_path,
          };
        }),
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('Error procesando creación de petición:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'Error interno del servidor' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
