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
    const session = cookies.get(SESSION_COOKIE_KEY);
    if (session?.value) {
      return applySecurityHeaders(redirect('/dashboard'), true);
    }
    return applySecurityHeaders(redirect('/login'), false);
  }

  // Si ya tiene sesión activa e intenta acceder a /login, redirigir al dashboard
  if (pathname === '/login') {
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

