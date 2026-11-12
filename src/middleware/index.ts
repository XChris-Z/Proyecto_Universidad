// src/middleware/index.ts
// Guard de autenticación y autorización RBAC para rutas del SGD Unitrópico + Hardening de Cabeceras HTTP

import { defineMiddleware } from 'astro:middleware';
import { PUBLIC_ROUTES, SESSION_COOKIE_KEY } from '@lib/constants';
import { canAccessModuleRoute, getFirstAllowedPath, isAdminOnlyPath } from '@lib/permissions';
import { resolveUserRbacServer } from '@lib/rbac-server';

function applySecurityHeaders(response: Response, isProtected = false): Response {
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');

  if (isProtected) {
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.headers.set('Pragma', 'no-cache');
  }

  return response;
}

function isStaticAssetPath(pathname: string): boolean {
  return (
    pathname.startsWith('/_astro/') ||
    pathname.startsWith('/_image') ||
    pathname === '/favicon.ico' ||
    /\.(png|jpg|jpeg|svg|webp|gif|ico|css|js|woff2?|ttf|map)$/i.test(pathname)
  );
}

export const onRequest = defineMiddleware(async ({ url, cookies, redirect }, next) => {
  const pathname = url.pathname;

  if (isStaticAssetPath(pathname)) {
    return next();
  }

  // Redirección de la raíz /
  if (pathname === '/' || pathname === '') {
    const hasConsultaParams =
      url.searchParams.has('radicado') || url.searchParams.has('pin') || url.searchParams.has('modo');
    if (hasConsultaParams) {
      return applySecurityHeaders(redirect(`/consulta-respuesta${url.search}`), false);
    }

    const session = cookies.get(SESSION_COOKIE_KEY);
    if (session?.value) {
      const rbac = await resolveUserRbacServer(session.value);
      const landing = rbac.authenticated
        ? getFirstAllowedPath(rbac.effectivePermissions, rbac.isAdmin)
        : '/login';
      return applySecurityHeaders(redirect(landing), rbac.authenticated);
    }
    return applySecurityHeaders(redirect(`/login${url.search}`), false);
  }

  // Si intenta acceder a /login pero ya posee sesión o trae parámetros de consulta de solicitante
  if (pathname === '/login') {
    const hasConsultaParams = url.searchParams.has('radicado') || url.searchParams.has('pin');
    if (hasConsultaParams) {
      return applySecurityHeaders(redirect(`/consulta-respuesta${url.search}`), false);
    }

    const session = cookies.get(SESSION_COOKIE_KEY);
    if (session?.value) {
      const rbac = await resolveUserRbacServer(session.value);
      if (rbac.authenticated) {
        const landing = getFirstAllowedPath(rbac.effectivePermissions, rbac.isAdmin);
        return applySecurityHeaders(redirect(landing), true);
      }
    }
    const response = await next();
    return applySecurityHeaders(response, false);
  }

  // Comprobar si la ruta solicitada es pública
  const isPublic = PUBLIC_ROUTES.some((route) => pathname.startsWith(route));
  if (isPublic) {
    const response = await next();
    return applySecurityHeaders(response, false);
  }

  // Verificar existencia de cookie de sesión institucional
  const session = cookies.get(SESSION_COOKIE_KEY);
  if (!session?.value) {
    if (pathname.startsWith('/api/')) {
      return applySecurityHeaders(
        new Response(JSON.stringify({ success: false, error: 'Sesión requerida' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
        true
      );
    }
    return applySecurityHeaders(redirect('/login'), false);
  }

  // Resolver RBAC SSR para control de acceso estricto en vistas y endpoints admin
  const rbac = await resolveUserRbacServer(session.value);

  if (pathname.startsWith('/api/')) {
    if (pathname.startsWith('/api/admin/') && !rbac.isAdmin) {
      return applySecurityHeaders(
        new Response(JSON.stringify({ success: false, error: 'Acceso exclusivo para Administrador' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }),
        true
      );
    }
    const response = await next();
    return applySecurityHeaders(response, true);
  }

  // Control estricto de rutas de página (/admin/usuarios, /usuarios y los 12 módulos)
  const cleanPath = pathname.replace(/\/+$/, '') || '/';
  if (isAdminOnlyPath(cleanPath) && !rbac.isAdmin) {
    const fallback = getFirstAllowedPath(rbac.effectivePermissions, rbac.isAdmin);
    return applySecurityHeaders(redirect(`${fallback}?denied=1`), true);
  }

  if (!canAccessModuleRoute(cleanPath, rbac.effectivePermissions, rbac.isAdmin)) {
    const fallback = getFirstAllowedPath(rbac.effectivePermissions, rbac.isAdmin);
    if (fallback !== cleanPath) {
      return applySecurityHeaders(redirect(`${fallback}?denied=1`), true);
    }
  }

  const response = await next();
  return applySecurityHeaders(response, true);
});
