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

  if (!sessionId || sessionId === 'usr-root') {
    const cookieEmail = decodeURIComponent(
      cookies?.get('sgd_session_email')?.value || ''
    )
      .trim()
      .toLowerCase();

    if (cookieEmail) {
      try {
        const { data: emailProf } = await (supabase
          .from('profiles' as any)
          .select('id, full_name, role')
          .eq('email', cookieEmail)
          .maybeSingle() as any);
        if (emailProf?.full_name) {
          return {
            id: emailProf.id || sessionId || 'usr-root',
            name: String(emailProf.full_name).trim(),
            role: normalizeInstitutionalRole(emailProf.role),
          };
        }
      } catch {}
    }

    if (sessionId === 'usr-root') {
      try {
        const { data: rootProf } = await (supabase
          .from('profiles' as any)
          .select('id, full_name, role')
          .or('id.eq.usr-root,email.eq.christianlemus.es@unitropico.edu.co')
          .limit(1)
          .maybeSingle() as any);
        if (rootProf?.full_name) {
          return {
            id: rootProf.id || 'usr-root',
            name: String(rootProf.full_name).trim(),
            role: normalizeInstitutionalRole(rootProf.role || 'Administrador'),
          };
        }
      } catch {}
    }
  }

  const fbName = String(fallbackActor?.name || '').trim();
  const fbRole = normalizeInstitutionalRole(fallbackActor?.role);
  const isGenericFb = /^(admin|admin general|administrador|administrador general|administrador del sistema|administrador documental|sistema sgd)$/i.test(fbName);

  return {
    id: sessionId || 'usr-root',
    name: fbName && !isGenericFb ? fbName : 'ING. Christian Lemus',
    role: fbRole || 'Administrador',
  };
}

