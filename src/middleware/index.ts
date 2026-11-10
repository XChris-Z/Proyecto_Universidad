// src/middleware/index.ts
// Guard de autenticación y autorización para rutas del SGD Unitrópico + Hardening de Cabeceras HTTP

import { defineMiddleware } from 'astro:middleware';
import { PUBLIC_ROUTES, SESSION_COOKIE_KEY } from '@lib/constants';

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

export const onRequest = defineMiddleware(async ({ url, cookies, redirect }, next) => {
  const pathname = url.pathname;

  // Redirección de la raíz /
  if (pathname === '/' || pathname === '') {
    // Si la URL contiene parámetros de consulta de radicado o pin, redirigir directo al portal de consulta
    const hasConsultaParams = url.searchParams.has('radicado') || url.searchParams.has('pin') || url.searchParams.has('modo');
    if (hasConsultaParams) {
      return applySecurityHeaders(redirect(`/consulta-respuesta${url.search}`), false);
    }

    const session = cookies.get(SESSION_COOKIE_KEY);
    if (session?.value) {
      return applySecurityHeaders(redirect('/dashboard'), true);
    }
    return applySecurityHeaders(redirect(`/login${url.search}`), false);
  }

  // Si intenta acceder a /login pero trae parámetros de consulta de solicitante
  if (pathname === '/login') {
    const hasConsultaParams = url.searchParams.has('radicado') || url.searchParams.has('pin');
    if (hasConsultaParams) {
      return applySecurityHeaders(redirect(`/consulta-respuesta${url.search}`), false);
    }

    const session = cookies.get(SESSION_COOKIE_KEY);
    if (session?.value) {
      return applySecurityHeaders(redirect('/dashboard'), true);
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
    return applySecurityHeaders(redirect('/login'), false);
  }

  const response = await next();
  return applySecurityHeaders(response, true);
});

