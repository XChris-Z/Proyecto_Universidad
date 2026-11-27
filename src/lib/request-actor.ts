// src/lib/request-actor.ts
import type { AstroCookies } from 'astro';
import { SESSION_COOKIE_KEY } from './constants';
import { supabase, supabaseAdmin } from './supabase';

const db: any = supabaseAdmin || supabase;

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

const GENERIC_ACTOR_PATTERN =
  /^(an[oó]nimo|an[oó]nima|usuario|usuario no registrado|desconocido|solicitante|ciudadano|admin|admin general|administrador|administrador general|administrador del sistema|administrador documental|sistema sgd|funcionario|funcionario institucional|funcionario acad[eé]mico|funcionario planeaci[oó]n|funcionario de despacho)$/i;

async function findActorInDbById(userId: string): Promise<ResolvedActor | null> {
  const cleanId = userId.trim();
  if (!cleanId || cleanId === 'anonymous' || cleanId === 'usr-unauthorized') {
    return null;
  }

  try {
    const { data: prof } = await (db
      .from('profiles' as any)
      .select('id, full_name, role, cargo')
      .eq('id', cleanId)
      .maybeSingle() as any);

    if (prof?.full_name) {
      return {
        id: String(prof.id),
        name: String(prof.full_name).trim(),
        role: normalizeInstitutionalRole(prof.role),
      };
    }
  } catch {}

  try {
    const { data: usr } = await (db
      .from('users' as any)
      .select('id, name, role_id, role_title')
      .eq('id', cleanId)
      .maybeSingle() as any);

    if (usr?.name) {
      return {
        id: String(usr.id),
        name: String(usr.name).trim(),
        role: normalizeInstitutionalRole(usr.role_id || usr.role_title),
      };
    }
  } catch {}

  return null;
}

async function findActorInDbByEmail(email: string): Promise<ResolvedActor | null> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) return null;

  try {
    const { data: prof } = await (db
      .from('profiles' as any)
      .select('id, full_name, role')
      .eq('email', cleanEmail)
      .maybeSingle() as any);

    if (prof?.full_name) {
      return {
        id: String(prof.id),
        name: String(prof.full_name).trim(),
        role: normalizeInstitutionalRole(prof.role),
      };
    }
  } catch {}

  try {
    const { data: usr } = await (db
      .from('users' as any)
      .select('id, name, role_id, role_title')
      .eq('email', cleanEmail)
      .maybeSingle() as any);

    if (usr?.name) {
      return {
        id: String(usr.id),
        name: String(usr.name).trim(),
        role: normalizeInstitutionalRole(usr.role_id || usr.role_title),
      };
    }
  } catch {}

  return null;
}

/**
 * Resuelve el actor real autenticado desde la cookie de sesión institucional (sgd_session)
 * y tablas profiles/users. Nunca reasigna acciones a un administrador fijo por defecto.
 */
export async function resolveSessionActor(
  cookies?: AstroCookies | null,
  fallbackActor?: Partial<ResolvedActor> | null
): Promise<ResolvedActor> {
  const sessionId = cookies?.get(SESSION_COOKIE_KEY)?.value?.trim() || '';
  if (sessionId) {
    const bySessionId = await findActorInDbById(sessionId);
    if (bySessionId) return bySessionId;
  }

  let activeEmailCookie = '';
  try {
    const rawCookie =
      cookies?.get('sgd_session_email')?.value ||
      cookies?.get('unitropico_active_user_email')?.value ||
      '';
    activeEmailCookie = rawCookie ? decodeURIComponent(rawCookie).trim().toLowerCase() : '';
  } catch {
    activeEmailCookie = (
      cookies?.get('sgd_session_email')?.value ||
      cookies?.get('unitropico_active_user_email')?.value ||
      ''
    )
      .trim()
      .toLowerCase();
  }

  if (activeEmailCookie) {
    const byEmail = await findActorInDbByEmail(activeEmailCookie);
    if (byEmail) return byEmail;
  }

  const fbId = String(fallbackActor?.id || '').trim();
  if (fbId && fbId !== 'usr-root') {
    const byFallbackId = await findActorInDbById(fbId);
    if (byFallbackId) return byFallbackId;
  }

  const fbName = String(fallbackActor?.name || '').trim();
  const fbRole = normalizeInstitutionalRole(fallbackActor?.role);
  if (fbName && !GENERIC_ACTOR_PATTERN.test(fbName) && fbId !== 'usr-root') {
    return {
      id: fbId,
      name: fbName,
      role: fbRole || 'Funcionario',
    };
  }

  return {
    id: '',
    name: 'Usuario no registrado',
    role: 'Funcionario',
  };
}
