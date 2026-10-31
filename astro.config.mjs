// astro.config.mjs
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

export default defineConfig({
  // SSR completo: el middleware de autenticación necesita server-side rendering
  // para leer y escribir cookies de sesión de forma segura.
  output: 'server',

  security: {
    checkOrigin: false,
  },

  adapter: vercel(),
});

