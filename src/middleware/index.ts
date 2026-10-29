// src/middleware/index.ts
// Guard de autenticación y autorización para rutas del SGD Unitrópico

import { defineMiddleware } from 'astro:middleware';
import { PUBLIC_ROUTES, SESSION_COOKIE_KEY } from '@lib/constants';

export const onRequest = defineMiddleware(({ url, cookies, redirect }, next) => {
  const pathname = url.pathname;

  // Redirección de la raíz /
  if (pathname === '/' || pathname === '') {
    const session = cookies.get(SESSION_COOKIE_KEY);
    if (session?.value) {
      return redirect('/dashboard');
    }
    return redirect('/login');
  }

  // Comprobar si la ruta solicitada es pública
  const isPublic = PUBLIC_ROUTES.some((route) => pathname.startsWith(route));
  if (isPublic) {
    return next();
  }

  // Verificar existencia de cookie de sesión institucional
  const session = cookies.get(SESSION_COOKIE_KEY);
  if (!session?.value) {
    return redirect('/login');
  }

  return next();
});

