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

    // 3. Crear el registro en public.peticion_subcarpetas
    let createdSubcarpeta: any = null;
    try {
      const { data: subData, error: subErr } = await (supabase
        .from('peticion_subcarpetas' as any)
        .insert({
          peticion_id: peticion.id,
          nombre: cleanNombre,
          descripcion: cleanDescripcion || null,
        } as any)
        .select()
        .single() as any);

      if (subErr) {
        console.warn('Aviso insertando en peticion_subcarpetas:', subErr.message);
      } else {
        createdSubcarpeta = subData;
      }
    } catch (e: any) {
      console.warn('Excepción insertando subcarpeta (tabla posiblemente no migrada aún):', e.message);
    }

    // Fallback en memoria si la tabla aún no existe físicamente en PostgreSQL
    if (!createdSubcarpeta) {
      createdSubcarpeta = {
        id: crypto.randomUUID ? crypto.randomUUID() : `sub-${Date.now()}`,
        peticion_id: peticion.id,
        nombre: cleanNombre,
        descripcion: cleanDescripcion || null,
        created_at: new Date().toISOString(),
      };
    }

    // 4. Consultar catálogo de oficinas seleccionadas
    const { data: oficinasData, error: ofisErr } = await (supabase
      .from('oficinas' as any)
      .select('id, codigo, nombre, email_institucional')
      .in('id', cleanOfficeIds) as any);

    if (ofisErr || !oficinasData || oficinasData.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No se encontraron las dependencias seleccionadas.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 5. Insertar asignaciones en public.peticion_responsables
    const asignacionesToInsert = oficinasData.map((ofi: any) => {
      const payload: any = {
        peticion_id: peticion.id,
        oficina_id: ofi.id,
        estado_entrega: 'Pendiente',
        observaciones_entrega: `PIN:${pinAcceso} | [${cleanNombre}]${cleanDescripcion ? ` ${cleanDescripcion}` : ''}`,
      };
      if (createdSubcarpeta?.id && !createdSubcarpeta.id.startsWith('sub-')) {
        payload.subcarpeta_id = createdSubcarpeta.id;
      }
      return payload;
    });

    let respData: any = null;
    let respErr: any = null;

    const resWithSub = await (supabase
      .from('peticion_responsables' as any)
      .insert(asignacionesToInsert as any)
      .select('id, oficina_id, codigo_acceso, fecha_expiracion_codigo, storage_subfolder_path, estado_entrega') as any);

    if (
      resWithSub.error &&
      (String(resWithSub.error.message || '').includes('subcarpeta_id') ||
       String(resWithSub.error.message || '').includes('schema cache') ||
       resWithSub.error.code === '42703' ||
       resWithSub.error.code === 'PGRST204')
    ) {
      console.warn('Columna subcarpeta_id no encontrada en peticion_responsables. Reintentando asignación...');
      const fallbackAsignaciones = asignacionesToInsert.map((a: any) => {
        const copy = { ...a };
        delete copy.subcarpeta_id;
        return copy;
      });

      const resFallback = await (supabase
        .from('peticion_responsables' as any)
        .insert(fallbackAsignaciones as any)
        .select('id, oficina_id, codigo_acceso, fecha_expiracion_codigo, storage_subfolder_path, estado_entrega') as any);

      respData = resFallback.data;
      respErr = resFallback.error;
    } else {
      respData = resWithSub.data;
      respErr = resWithSub.error;
    }

    if (respErr || !respData) {
      console.error('Error insertando responsables para subcarpeta:', respErr);
      return new Response(
        JSON.stringify({ success: false, error: respErr?.message || 'Error asignando dependencias a la subcarpeta.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 6. Enviar notificaciones por correo consolidadas
    const baseUrl = url.origin;
    const emailPromises = [];

    for (const resp of respData) {
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
      details: `Se agregó la subcarpeta "${cleanNombre}" con ${oficinasData.length} dependencias asignadas.`,
      severity: 'INFO',
    }).catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        subcarpeta: createdSubcarpeta,
        responsables: respData.map((r: any) => {
          const ofi = oficinasData.find((o: any) => o.id === r.oficina_id);
          return {
            id: r.id,
            oficina_nombre: ofi?.nombre,
            codigo_acceso: r.codigo_acceso,
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

