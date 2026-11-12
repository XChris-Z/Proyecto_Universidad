// src/lib/request-actor.ts
import type { AstroCookies } from 'astro';
import { SESSION_COOKIE_KEY } from './constants';
import { supabase } from './supabase';

export interface ResolvedActor {
  id: string;
  name: string;
  role: string;
}

/**
 * Extrae la IP real del cliente desde cabeceras de proxy/CDN (Vercel / Cloudflare / Reverse Proxy).
 */
export function extractClientIp(request?: Request | null, clientAddress?: string | null): string {
  const candidates: string[] = [];

  if (request?.headers) {
    const h = request.headers;
    const xVercel = h.get('x-vercel-forwarded-for');
    const firstVercel = xVercel?.split(',')[0]?.trim();
    if (firstVercel) candidates.push(firstVercel);

    const xForwarded = h.get('x-forwarded-for');
    const firstForwarded = xForwarded?.split(',')[0]?.trim();
    if (firstForwarded) candidates.push(firstForwarded);

    const cfIp = h.get('cf-connecting-ip');
    if (cfIp) candidates.push(cfIp.trim());

    const realIp = h.get('x-real-ip');
    if (realIp) candidates.push(realIp.trim());
  }

  if (clientAddress) {
    candidates.push(String(clientAddress).trim());
  }

  for (const raw of candidates) {
    if (!raw) continue;
    const clean = raw.replace(/^::ffff:/i, '').trim();
    if (!clean) continue;
    if (clean === '::1' || clean === '127.0.0.1' || clean.toLowerCase() === 'localhost') {
      continue;
    }
    return clean;
  }

  return 'Red Local / Institucional';
}

/**
 * Normaliza etiquetas de rol eliminando valores técnicos legados o contradictorios.
 */
export function normalizeInstitutionalRole(rawRole?: string | null): string {
  const r = String(rawRole || '').trim();
  const lower = r.toLowerCase();
  if (!r || lower === 'admin' || lower === 'superadmin' || lower === 'superadministrador' || lower === 'administrador general') {
    return 'Administrador';
  }
  if (lower === 'funcionario' || lower === 'secretaria' || lower === 'operador') {
    return 'Funcionario';
  }
  if (lower.includes('dependencia') || lower.includes('responsable') || lower.includes('oficina')) {
    return 'Dependencia Asignada';
  }
  if (lower.includes('automatiz') || lower.includes('sistema')) {
    return 'Sistema Automático SGD';
  }
  return r;
}

/**
 * Resuelve el actor real autenticado desde la cookie de sesión institucional y tablas profiles/users.
 */
export async function resolveSessionActor(
  cookies?: AstroCookies | null,
  fallbackActor?: Partial<ResolvedActor> | null
): Promise<ResolvedActor> {
  const sessionId = cookies?.get(SESSION_COOKIE_KEY)?.value?.trim() || fallbackActor?.id || '';

  if (sessionId && sessionId !== 'usr-root' && sessionId !== 'anonymous') {
    try {
      const { data: prof } = await (supabase
        .from('profiles' as any)
        .select('id, full_name, role, cargo')
        .eq('id', sessionId)
        .maybeSingle() as any);

      if (prof?.full_name) {
        return {
          id: prof.id,
          name: String(prof.full_name).trim(),
          role: normalizeInstitutionalRole(prof.role),
        };
      }
    } catch {}

    try {
      const { data: usr } = await (supabase
        .from('users' as any)
        .select('id, name, role_id, role_title')
        .eq('id', sessionId)
        .maybeSingle() as any);

      if (usr?.name) {
        return {
          id: usr.id,
          name: String(usr.name).trim(),
          role: normalizeInstitutionalRole(usr.role_id || usr.role_title),
        };
      }
    } catch {}
  }

  if (sessionId === 'usr-root') {
    try {
      const { data: adminProf } = await (supabase
        .from('profiles' as any)
        .select('id, full_name, role')
        .in('role', ['admin', 'Administrador', 'administrador'])
        .limit(1)
        .maybeSingle() as any);
      if (adminProf?.full_name) {
        return {
          id: adminProf.id || 'usr-root',
          name: String(adminProf.full_name).trim(),
          role: 'Administrador',
        };
      }
    } catch {}
  }

  const fbName = String(fallbackActor?.name || '').trim();
  const fbRole = normalizeInstitutionalRole(fallbackActor?.role);

  return {
    id: sessionId || 'usr-root',
    name: fbName && !/^administrador general$/i.test(fbName) ? fbName : 'ING. Christian Lemus',
    role: fbRole || 'Administrador',
  };
}

