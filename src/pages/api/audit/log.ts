// src/pages/api/audit/log.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { logSystemActivity } from '@lib/audit';

export const POST: APIRoute = async ({ request, clientAddress, cookies }) => {
  try {
    const body = await request.json().catch(() => ({}));
    if (!body?.action || !body?.entity) {
      return new Response(
        JSON.stringify({ success: false, error: 'Datos de auditoría incompletos.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const entry = await logSystemActivity({
      actor: body.actor || { id: 'usr-root', name: 'Administrador del Sistema', role: 'Administrador' },
      action: String(body.action),
      actionType: body.actionType || 'GESTION',
      entity: String(body.entity),
      entityId: String(body.entityId || 'SGD'),
      details: String(body.details || ''),
      before: body.before,
      after: body.after,
      severity: body.severity || 'INFO',
      request,
      clientAddress,
      cookies,
    });

    return new Response(
      JSON.stringify({ success: true, entry }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Error registrando auditoría.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

