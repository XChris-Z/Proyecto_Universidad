// src/pages/api/consultar-respuesta.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { validarYConsultarRespuesta } from '@lib/consulta-respuesta';

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => ({}));
  const result = await validarYConsultarRespuesta({
    radicado: body.radicado,
    correo: body.correo,
    email: body.email,
    pin: body.pin,
    codigo: body.codigo,
  });

  if (!result.ok) {
    return new Response(
      JSON.stringify({
        success: false,
        code: result.code,
        error: result.error,
        expira_at: result.expira_at,
        formatted_expira: result.formatted_expira,
      }),
      { status: result.status, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(JSON.stringify(result.data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
