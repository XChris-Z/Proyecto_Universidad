// src/pages/api/portal/validar.ts
import type { APIRoute } from 'astro';
import { supabase } from '@lib/supabase';

export const POST: APIRoute = async ({ request }) => {
  try {
    const { email, codigo } = await request.json();

    if (!email || !codigo) {
      return new Response(
        JSON.stringify({
          success: false,
          code: 'MISSING_FIELDS',
          message: 'Debe ingresar el correo institucional de la oficina y el código único temporal.',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Ejecutar función RPC en Supabase PostgreSQL
    const { data, error } = await (supabase.rpc as any)('fn_validar_acceso_portal', {
      p_email: email.trim().toLowerCase(),
      p_codigo: codigo.trim().toUpperCase(),
    });

    if (error) {
      console.error('Error RPC fn_validar_acceso_portal:', error);
      return new Response(
        JSON.stringify({
          success: false,
          code: 'SERVER_ERROR',
          message: error.message || 'Error validando credenciales de acceso.',
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const resultado = data as any;

    if (!resultado || !resultado.success) {
      return new Response(
        JSON.stringify(resultado || { success: false, message: 'Acceso no autorizado.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Consultar anexos ya subidos por esta oficina para esta petición
    const { data: anexosData } = await (supabase
      .from('peticion_anexos' as any)
      .select('id, nombre_archivo, storage_path, tamano_bytes, created_at')
      .eq('peticion_responsable_id', resultado.responsable_id)
      .order('created_at', { ascending: false }) as any);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          ...resultado,
          anexos: anexosData || [],
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('Error en /api/portal/validar:', err);
    return new Response(
      JSON.stringify({ success: false, message: err.message || 'Error interno del servidor.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
