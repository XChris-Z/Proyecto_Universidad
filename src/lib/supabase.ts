// src/lib/supabase.ts
// Cliente Supabase institucional — inicializado con variables de entorno o credenciales del proyecto
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const rawUrl = (
  (typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.PUBLIC_SUPABASE_URL : undefined) ||
  (typeof process !== 'undefined' ? process.env?.PUBLIC_SUPABASE_URL || process.env?.SUPABASE_URL : undefined) ||
  'https://irjjpjtvhxoakiazfswn.supabase.co'
) as string;

const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');

const supabaseAnonKey = (
  (typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.PUBLIC_SUPABASE_ANON_KEY : undefined) ||
  (typeof process !== 'undefined' ? process.env?.PUBLIC_SUPABASE_ANON_KEY || process.env?.SUPABASE_ANON_KEY : undefined) ||
  'sb_publishable_VtX3eTstrrmNydF5Xdg24g_qFIOf-2V'
) as string;

export const supabase = createClient<Database>(
  supabaseUrl,
  supabaseAnonKey
);

const serviceRoleKey = (
  (typeof process !== 'undefined' ? process.env?.SUPABASE_SERVICE_ROLE_KEY || process.env?.SUPABASE_SERVICE_KEY : undefined) ||
  (typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.SUPABASE_SERVICE_ROLE_KEY : undefined) ||
  supabaseAnonKey
) as string;

// Sanitizar serviceRoleKey: si es placeholder de ejemplo o muy corto, usar anonKey
const cleanServiceRoleKey = (
  serviceRoleKey &&
  !serviceRoleKey.includes('your-supabase') &&
  serviceRoleKey.length > 20
) ? serviceRoleKey : supabaseAnonKey;

export const supabaseAdmin = createClient<Database>(
  supabaseUrl,
  cleanServiceRoleKey
);
