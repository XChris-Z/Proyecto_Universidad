// src/pages/api/peticiones/crear.ts
import type { APIRoute } from 'astro';
import { supabase } from '@lib/supabase';
import { sendPeticionAssignmentEmail } from '@lib/email';

export const POST: APIRoute = async ({ request, url }) => {
  try {
    const contentType = request.headers.get('content-type') || '';
    
    let asunto = '';
    let descripcion = '';
    let instrucciones_anexos = '';
    let solicitante_nombre = '';
    let solicitante_email = '';
    let solicitante_tipo = 'Ciudadano';
    let categoria = 'Petición General';
    let prioridad = 'Media';
    let fecha_limite_entrega = '';
    let oficina_ids: string[] = [];
    let primaryFile: File | null = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      asunto = (formData.get('asunto') as string) || '';
      descripcion = (formData.get('descripcion') as string) || '';
      instrucciones_anexos = (formData.get('instrucciones_anexos') as string) || '';
      solicitante_nombre = (formData.get('solicitante_nombre') as string) || '';
      solicitante_email = (formData.get('solicitante_email') as string) || '';
      solicitante_tipo = (formData.get('solicitante_tipo') as string) || 'Ciudadano';
      categoria = (formData.get('categoria') as string) || 'Petición General';
      prioridad = (formData.get('prioridad') as string) || 'Media';
      fecha_limite_entrega = (formData.get('fecha_limite_entrega') as string) || '';
      
      const rawOficinas = formData.getAll('oficina_ids');
      if (rawOficinas.length > 0) {
        oficina_ids = rawOficinas.map(o => String(o));
      } else {
        const rawJsonOficinas = formData.get('oficinas_json') as string;
        if (rawJsonOficinas) {
          try { oficina_ids = JSON.parse(rawJsonOficinas); } catch (e) {}
        }
      }

      primaryFile = formData.get('archivo_peticion') as File | null;
      if (primaryFile && (typeof primaryFile === 'string' || !primaryFile.size || primaryFile.size === 0)) {
        primaryFile = null;
      }
    } else {
      const body = await request.json();
      asunto = body.asunto;
      descripcion = body.descripcion || '';
      instrucciones_anexos = body.instrucciones_anexos || body.descripcion || '';
      solicitante_nombre = body.solicitante_nombre;
      solicitante_email = body.solicitante_email;
      solicitante_tipo = body.solicitante_tipo || 'Ciudadano';
      categoria = body.categoria || 'Petición General';
      prioridad = body.prioridad || 'Media';
      fecha_limite_entrega = body.fecha_limite_entrega;
      oficina_ids = body.oficina_ids || [];
    }

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

    // 1. Insertar Petición en Base de Datos (Disparador PL/pgSQL calcula Radicado y Margen de 5 Días)
    const finalInstrucciones = instrucciones_anexos || descripcion || null;
    const { data: peticionData, error: peticionError } = await (supabase
      .from('peticiones' as any)
      .insert({
        asunto,
        descripcion: finalInstrucciones,
        instrucciones_anexos: finalInstrucciones,
        solicitante_nombre,
        solicitante_email,
        solicitante_tipo,
        categoria,
        prioridad,
        fecha_limite_entrega,
        // fecha_limite_responsable y storage_folder_path son calculados automáticamente por trigger
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

    // 2. Subir Archivo Principal de la Petición al Storage si fue proporcionado
    let savedPrimaryFile = null;
    if (primaryFile && typeof primaryFile !== 'string' && typeof primaryFile.arrayBuffer === 'function' && primaryFile.size > 0) {
      const cleanFileName = (primaryFile.name || 'documento.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
      const storageRelativePath = `${peticionData.numero_radicado}/documento_principal_${Date.now()}_${cleanFileName}`;
      const fullStoragePath = `peticiones/${storageRelativePath}`;

      try {
        const arrayBuf = await primaryFile.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);

        const { error: uploadErr } = await supabase.storage
          .from('peticiones')
          .upload(storageRelativePath, buffer, {
            contentType: primaryFile.type || 'application/pdf',
            upsert: true,
          });

        if (uploadErr) {
          console.warn('Error subiendo archivo principal al storage:', uploadErr.message);
        }

        // Registrar en peticion_anexos como documento raíz de entrada
        const { data: anexoPrincipal } = await (supabase
          .from('peticion_anexos' as any)
          .insert({
            peticion_id: peticionData.id,
            nombre_archivo: primaryFile.name,
            storage_path: fullStoragePath,
            tamano_bytes: primaryFile.size,
            mime_type: primaryFile.type,
            subido_por_email: solicitante_email || 'radicacion@unitropico.edu.co',
            es_anexo_oficina: false, // Archivo original de radicación
          } as any)
          .select()
          .single() as any);

        savedPrimaryFile = anexoPrincipal || {
          nombre_archivo: primaryFile.name,
          storage_path: fullStoragePath,
        };
      } catch (uploadException) {
        console.error('Excepción al subir archivo principal:', uploadException);
      }
    }

    // 3. Obtener información de las oficinas seleccionadas
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

    // 4. Crear asignaciones en peticion_responsables (Trigger genera código único y subcarpeta)
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

    // 5. Enviar correos automáticos institucionales a cada oficina con su código y enlace
    const baseUrl = url.origin;

    const emailNotifications = [];
    for (const resp of responsablesData) {
      const oficina = oficinasData.find((o: any) => o.id === resp.oficina_id);
      if (oficina && oficina.email_institucional) {
        const portalUrl = `${baseUrl}/portal-responsable?codigo=${encodeURIComponent(resp.codigo_acceso)}&email=${encodeURIComponent(oficina.email_institucional)}`;
        
        const emailPromise = sendPeticionAssignmentEmail({
          toEmail: oficina.email_institucional,
          oficinaNombre: oficina.nombre,
          numeroRadicado: peticionData.numero_radicado,
          asunto: peticionData.asunto,
          categoria: peticionData.categoria,
          prioridad: peticionData.prioridad,
          instruccionesAnexos: peticionData.instrucciones_anexos || peticionData.descripcion,
          fechaLimiteEntrega: peticionData.fecha_limite_entrega,
          fechaLimiteResponsable: peticionData.fecha_limite_responsable,
          codigoAcceso: resp.codigo_acceso,
          portalUrl,
        }).catch((err: any) => {
          console.warn(`[EMAIL ERROR NO FATAL] Fallo correo a ${oficina.email_institucional}:`, err.message);
          return { success: false, error: err.message };
        });
        emailNotifications.push(emailPromise);
      }
    }

    const emailResults = await Promise.allSettled(emailNotifications);
    console.log(`[PETICIÓN CREADA] Radicado: ${peticionData.numero_radicado} - ${emailResults.length} correos disparados.`);

    return new Response(
      JSON.stringify({
        success: true,
        peticion: {
          id: peticionData.id,
          numero_radicado: peticionData.numero_radicado,
          asunto: peticionData.asunto,
          instrucciones_anexos: peticionData.instrucciones_anexos,
          fecha_limite_entrega: peticionData.fecha_limite_entrega,
          fecha_limite_responsable: peticionData.fecha_limite_responsable,
          storage_folder_path: peticionData.storage_folder_path,
          archivo_principal: savedPrimaryFile,
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
