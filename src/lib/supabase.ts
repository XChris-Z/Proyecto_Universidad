// src/lib/supabase.ts
// Cliente Supabase — inicializado con variables de entorno
// En Fase 1 este cliente está preparado pero no se usa activamente.
// En Fase 2+ reemplazará los datos mock de src/data/*.ts

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  // En Fase 1 esto es esperado si no se han configurado las vars de entorno.
  // En Fase 2 lanzar un error aquí para detectar problemas de configuración.
  console.warn(
    '[SGD Supabase] Variables PUBLIC_SUPABASE_URL y/o PUBLIC_SUPABASE_ANON_KEY no configuradas. ' +
    'El cliente de Supabase no está disponible. Revisa tu archivo .env.local.'
  );
}

// El cliente se exporta siempre; si las vars no están disponibles lanzará
// errores solo cuando se intente hacer una petición real.
export const supabase = createClient(
  supabaseUrl ?? '',
  supabaseAnonKey ?? ''
);

