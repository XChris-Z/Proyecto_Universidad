// src/data/users.ts
import type { InstitutionalUser } from '@lib/types';

/**
 * Usuarios institucionales del SGD (datos de demostración — Fase 1).
 * Las contraseñas aquí son SOLO para demo. Se eliminarán con Supabase Auth en Fase 3.
 * @see https://github.com/XChris-Z/sgd-unitropico — README para credenciales de demo
 */
export const INSTITUTIONAL_USERS: InstitutionalUser[] = [
  {
    id: 'usr-root',
    name: 'Dr. Cristian Lemus',
    role: 'Rector Magnífico / Root',
    roleId: 'role-root',
    email: 'root@unitropico.edu.co',
    password: 'rector2026',
    initials: 'CL',
    avatarColor: '#6b21a8',
  },
  {
    id: 'usr-admin',
    name: 'Lic. Andrea Morales',
    role: 'Administradora de Sistema SGD',
    roleId: 'role-admin',
    email: 'admin.sgd@unitropico.edu.co',
    password: 'admin2026',
    initials: 'AM',
    avatarColor: '#00594E',
  },
  {
    id: 'usr-1',
    name: 'Dra. Carmen Rosa Vargas',
    role: 'Vicerrectoría Académica',
    roleId: 'role-funcionario',
    email: 'vicerrectoria@unitropico.edu.co',
    password: 'academica2026',
    initials: 'CR',
    avatarColor: '#0284c7',
  },
  {
    id: 'usr-2',
    name: 'Ing. Carlos Mendoza',
    role: 'Decano Facultad de Ingenierías',
    roleId: 'role-funcionario',
    email: 'ingenieria@unitropico.edu.co',
    password: 'ingenieria2026',
    initials: 'CM',
    avatarColor: '#B5A160',
  },
  {
    id: 'usr-3',
    name: 'Dr. Fernando Ortiz',
    role: 'Secretaría General',
    roleId: 'role-funcionario',
    email: 'secretaria@unitropico.edu.co',
    password: 'secgen2026',
    initials: 'FO',
    avatarColor: '#7d6e38',
  },
  {
    id: 'usr-oaj-1',
    name: 'Dr. Roberto Gómez',
    role: 'Asesor Jurídico',
    roleId: 'role-funcionario',
    email: 'juridica@unitropico.edu.co',
    password: 'juridica2026',
    initials: 'RG',
    avatarColor: '#dc2626',
  },
  {
    id: 'usr-4',
    name: 'C.P. Sandra Milena Peña',
    role: 'Dirección Financiera',
    roleId: 'role-funcionario',
    email: 'financiera@unitropico.edu.co',
    password: 'financiera2026',
    initials: 'SP',
    avatarColor: '#00453c',
  },
];

