// src/lib/supabase.ts
// Cliente Supabase institucional — inicializado con variables de entorno o credenciales del proyecto
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const rawUrl = (
  import.meta.env.PUBLIC_SUPABASE_URL ||
  (typeof process !== 'undefined' ? process.env?.PUBLIC_SUPABASE_URL || process.env?.SUPABASE_URL : undefined) ||
  'https://irjjpjtvhxoakiazfswn.supabase.co'
) as string;

const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');

const supabaseAnonKey = (
  import.meta.env.PUBLIC_SUPABASE_ANON_KEY ||
  (typeof process !== 'undefined' ? process.env?.PUBLIC_SUPABASE_ANON_KEY || process.env?.SUPABASE_ANON_KEY : undefined) ||
  'sb_publishable_VtX3eTstrrmNydF5Xdg24g_qFIOf-2V'
) as string;

export const supabase = createClient<Database>(
  supabaseUrl,
  supabaseAnonKey
);
