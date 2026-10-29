// src/lib/auth.ts
// Funciones de autenticación — Fase 1: mock con localStorage/sessionStorage
// Fase 3: se reemplazará completamente con Supabase Auth + cookies httpOnly

import type { InstitutionalUser, SessionPayload } from './types';
import { INSTITUTIONAL_USERS } from '@data/users';
import { SESSION_STORAGE_KEY } from './constants';

/**
 * Busca un usuario por email y contraseña en los datos mock.
 * Retorna el usuario si las credenciales son correctas, null si no.
 */
export function authenticateUser(
  email: string,
  password: string
): InstitutionalUser | null {
  const user = INSTITUTIONAL_USERS.find(
    (u) => u.email.toLowerCase() === email.toLowerCase()
  );
  if (!user || user.password !== password) return null;
  return user;
}

/**
 * Obtiene el usuario de sesión activa desde localStorage o sessionStorage.
 * Retorna null si no hay sesión.
 */
export function getSessionUser(): InstitutionalUser | null {
  if (typeof window === 'undefined') return null;

  const raw =
    localStorage.getItem(SESSION_STORAGE_KEY) ??
    sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;

  try {
    const payload = JSON.parse(raw) as SessionPayload;
    return (
      INSTITUTIONAL_USERS.find((u) => u.id === payload.userId) ?? null
    );
  } catch {
    return null;
  }
}

/**
 * Persiste la sesión del usuario en storage.
 */
export function saveSession(
  user: InstitutionalUser,
  remember: boolean
): void {
  if (typeof window === 'undefined') return;

  const payload: SessionPayload = {
    userId: user.id,
    email: user.email,
    loggedAt: new Date().toISOString(),
  };
  const storage = remember ? localStorage : sessionStorage;
  storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
}

/**
 * Elimina la sesión del usuario de ambos storages.
 */
export function clearSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(SESSION_STORAGE_KEY);
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
}

/**
 * Obtiene un usuario por id.
 */
export function getUserById(id: string): InstitutionalUser | null {
  return INSTITUTIONAL_USERS.find((u) => u.id === id) ?? null;
}

