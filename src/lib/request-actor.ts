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
  const activeEmailCookie = decodeURIComponent(
    cookies?.get('unitropico_active_user_email')?.value ||
    cookies?.get('sgd_session_email')?.value ||
    ''
  ).trim().toLowerCase();

  if (activeEmailCookie) {
    if (activeEmailCookie === 'christianlemus.es@unitropico.edu.co') {
      return {
        id: 'usr-root',
        name: 'ING. Christian Lemus',
        role: 'Administrador',
      };
    }
    try {
      const { data: emailProf } = await (supabase
        .from('profiles' as any)
        .select('id, full_name, role')
        .eq('email', activeEmailCookie)
        .maybeSingle() as any);
      if (emailProf?.full_name) {
        let name = String(emailProf.full_name).trim();
        if (/oscar\s*g/i.test(name)) name = 'ING. Christian Lemus';
        return {
          id: emailProf.id || 'usr-root',
          name,
          role: normalizeInstitutionalRole(emailProf.role),
        };
      }
    } catch {}
  }

  const sessionId = cookies?.get(SESSION_COOKIE_KEY)?.value?.trim() || fallbackActor?.id || '';

  if (sessionId && sessionId !== 'usr-root' && sessionId !== 'anonymous') {
    try {
      const { data: prof } = await (supabase
        .from('profiles' as any)
        .select('id, full_name, role, cargo')
        .eq('id', sessionId)
        .maybeSingle() as any);

      if (prof?.full_name) {
        let name = String(prof.full_name).trim();
        if (/oscar\s*g/i.test(name)) name = 'ING. Christian Lemus';
        return {
          id: prof.id,
          name,
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
        let name = String(usr.name).trim();
        if (/oscar\s*g/i.test(name)) name = 'ING. Christian Lemus';
        return {
          id: usr.id,
          name,
          role: normalizeInstitutionalRole(usr.role_id || usr.role_title),
        };
      }
    } catch {}
  }

  if (sessionId === 'usr-root' || !sessionId) {
    try {
      const { data: rootProf } = await (supabase
        .from('profiles' as any)
        .select('id, full_name, role')
        .or('id.eq.usr-root,email.eq.christianlemus.es@unitropico.edu.co')
        .limit(1)
        .maybeSingle() as any);
      if (rootProf?.full_name) {
        let name = String(rootProf.full_name).trim();
        if (/oscar\s*g/i.test(name)) name = 'ING. Christian Lemus';
        return {
          id: rootProf.id || 'usr-root',
          name,
          role: normalizeInstitutionalRole(rootProf.role || 'Administrador'),
        };
      }
    } catch {}
  }

  let fbName = String(fallbackActor?.name || '').trim();
  if (/oscar\s*g/i.test(fbName)) fbName = 'ING. Christian Lemus';
  const fbRole = normalizeInstitutionalRole(fallbackActor?.role);
  const isGenericFb = /^(admin|admin general|administrador|administrador general|administrador del sistema|administrador documental|sistema sgd)$/i.test(fbName);

  return {
    id: sessionId || 'usr-root',
    name: fbName && !isGenericFb ? fbName : 'ING. Christian Lemus',
    role: fbRole || 'Administrador',
  };
}

