# SGD Unitrópico — Sistema de Gestión Documental y Gobierno Institucional

> **Versión 2.0 (Arquitectura Astro + TypeScript + Supabase + Vercel)**  
> Plataforma de gestión documental, archivo oficial, seguimiento de peticiones (PQRS / Tutelas), sistematización de normativa colegiada, control disciplinario, planeación financiera CSU y trazabilidad inmutable de la Universidad Internacional del Trópico Americano.

---

## 🏛️ Stack Tecnológico

| Capa | Tecnología | Propósito |
| :--- | :--- | :--- |
| **Framework Web** | [Astro v5](https://astro.build/) | Arquitectura multipágina (MPA) con Server-Side Rendering (SSR) |
| **Adaptador Hosting** | `@astrojs/vercel` | Despliegue optimizado en la infraestructura Serverless/Edge de Vercel |
| **Lenguaje** | [TypeScript](https://www.typescriptlang.org/) (Estricto) | Tipado integral de entidades, APIs, componentes y manipulación DOM |
| **BaaS & Base de Datos** | [Supabase](https://supabase.com/) (PostgreSQL 15+) | Almacenamiento relacional, Auth institucional, Storage y RPCs |
| **Lógica de BD** | **PL/pgSQL** | Procedimientos almacenados, triggers de auditoría y políticas RLS |
| **Estilos** | CSS Moderno Nativo | Hojas globales con variables institucionales y CSS con scope por componente |

---

## 📁 Estructura del Proyecto

```text
sgd-unitropico/
├── .env.example                # Variables de entorno requeridas (Supabase URL, Anon Key, Service Role)
├── .gitignore                  # Exclusiones estándar de node_modules, build y dist
├── astro.config.mjs            # Configuración Astro con adaptador Vercel (SSR)
├── package.json                # Dependencias y scripts de ejecución
├── tsconfig.json               # Configuración estricta de TypeScript con path aliases
│
├── supabase/
│   └── migrations/             # Scripts SQL y funciones PL/pgSQL
│       ├── 0001_initial_schema.sql      # Tablas, claves foráneas, índices y checks
│       ├── 0002_plpgsql_functions.sql   # Funciones RPC, triggers y estadísticas en PL/pgSQL
│       └── 0003_rls_policies.sql        # Políticas de seguridad a nivel de fila (RLS)
│
├── src/
│   ├── layouts/                # Envoltorios de página
│   │   ├── Layout.astro        # Base HTML5 con metadatos y fuentes Montserrat
│   │   ├── AuthLayout.astro    # Shell con degradado institucional para Login
│   │   └── AppLayout.astro     # Shell de la aplicación con Sidebar, Topbar y Modales globales
│   │
│   ├── components/layout/      # Componentes estructurales
│   │   ├── Sidebar.astro       # Navegación lateral con badges y perfil
│   │   └── Topbar.astro        # Barra superior con buscador, alertas del rector y selector de rol
│   │
│   ├── pages/                  # Rutas multipágina (SSR)
│   │   ├── index.astro         # Redirección automática según sesión activa
│   │   ├── login.astro         # Pantalla de autenticación con botones demo de 1 clic
│   │   ├── dashboard.astro     # Panel de control ejecutivo y KPIs
│   │   ├── archivos.astro      # Repositorio TRD, radicación y respuestas formales
│   │   ├── peticiones.astro    # Derechos de petición, tutelas y términos constitucionales
│   │   ├── normas.astro        # Acuerdos CSU, CA, resoluciones rectorales y actos electorales
│   │   ├── juridicos.astro     # Asuntos jurídicos, matriz de brechas y litigios
│   │   ├── juzgamiento.astro   # Procesos disciplinarios (Ley 1952 de 2019)
│   │   ├── planeacion.astro    # Informes financieros CSU, reportes al MEN y metas PDI
│   │   ├── calendario.astro    # Calendario institucional tipo Google Calendar y semáforo
│   │   ├── programas.astro     # Programas académicos, SACES y acreditación CNA
│   │   ├── relacionamiento.astro # Convenios con entes gubernamentales y cooperación
│   │   ├── dependencias.astro  # Estructura orgánica, despachos y funcionarios
│   │   ├── auditoria.astro     # Bitácora inmutable con verificación SHA-256
│   │   └── 404.astro           # Vista institucional de página no encontrada
│   │
│   ├── scripts/                # Lógica de cliente desacoplada y tipada (1 script por página)
│   │   ├── appLayout.ts        # Control global del shell, cajón móvil, alertas y conmutador de usuario
│   │   ├── dashboard.ts
│   │   ├── archivos.ts
│   │   ├── peticiones.ts
│   │   ├── normas.ts
│   │   ├── juridicos.ts
│   │   ├── juzgamiento.ts
│   │   ├── planeacion.ts
│   │   ├── calendario.ts
│   │   ├── programas.ts
│   │   ├── relacionamiento.ts
│   │   ├── dependencias.ts
│   │   └── auditoria.ts
│   │
│   ├── data/                   # Datos institucionales tipados y estructuras mock
│   │   ├── audit.ts
│   │   ├── calendar.ts
│   │   ├── convenios.ts
│   │   ├── dependencias.ts
│   │   ├── documents.ts
│   │   ├── juridicos.ts
│   │   ├── juzgamiento.ts
│   │   ├── normas.ts
│   │   ├── planeacion.ts
│   │   ├── programas.ts
│   │   ├── roles.ts
│   │   └── users.ts
│   │
│   ├── lib/                    # Utilidades de negocio, seguridad y clientes BaaS
│   │   ├── audit.ts            # Encadenamiento criptográfico (hash chaining)
│   │   ├── auth.ts             # Control de sesiones y autenticación institucional
│   │   ├── constants.ts        # Códigos, nombres y rutas del sistema
│   │   ├── permissions.ts      # Matriz de permisos RBAC por nivel jerárquico
│   │   ├── supabase.ts         # Inicialización del cliente Supabase
│   │   ├── types.ts            # Interfaces y modelos de dominio en TypeScript
│   │   └── utils.ts            # Helpers de fechas, días hábiles y cálculos SLA
│   │
│   ├── middleware/             # Guardián de rutas server-side
│   │   └── index.ts            # Validación de cookies `sgd_session` y redirección a `/login`
│   │
│   └── styles/
│       └── global.css          # Variables CSS, colores corporativos (#00594E, #B5A160) y resets
```

---

## 🚀 Puesta en Marcha en Local

### 1. Prerrequisitos
- **Node.js**: v18.17.0 o superior (recomendado v20+).
- **npm** o gestor compatible.

### 2. Instalación de Dependencias
```bash
npm install
```

### 3. Configuración de Variables de Entorno
Copia el archivo base y ajusta las credenciales de tu proyecto en Supabase:
```bash
cp .env.example .env
```
Contenido de `.env`:
```ini
PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
PUBLIC_SUPABASE_ANON_KEY=tu-anon-key-aqui
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key-aqui
```

### 4. Servidor de Desarrollo
```bash
npm run dev
```
Abre en tu navegador: [http://localhost:4321](http://localhost:4321)

---

## 🔒 Usuarios de Demostración (Acceso de 1 Clic)

En la pantalla `/login`, dispones de accesos directos para probar los diferentes roles y niveles jerárquicos:

| Usuario | Cargo / Despacho | Nivel RBAC | Permisos Clave |
| :--- | :--- | :--- | :--- |
| **Dr. Cristian Lemus** | Superusuario Root / Sec. General | Nivel 1 (Total) | Acceso irrestricto, auditoría, configuración |
| **Dr. Wilson Barreto** | Jefe de Oficina Jurídica | Nivel 2 (Directivo) | Matriz de brechas, litigios, conceptos, reparto |
| **Dra. Natalia Ramírez** | Abogada Sustanciadora | Nivel 3 (Operativo) | Proyectar respuestas, consultar TRD asignada |
| **Lic. Gloria Vargas** | Auxiliar de Archivo y Correspondencia | Nivel 4 (Ventanilla) | Radicación, digitalización, registro físico |

---

## ☁️ Despliegue en Vercel

El proyecto está configurado con `@astrojs/vercel` en modo `server` (SSR):

1. Conecta tu repositorio de GitHub a tu cuenta de **Vercel**.
2. Vercel detectará automáticamente el framework **Astro**.
3. En la sección **Environment Variables** de Vercel, agrega:
   - `PUBLIC_SUPABASE_URL`
   - `PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Haz clic en **Deploy**.

---

## 📜 Fundamentación Jurídica y Normativa Aplicada
- **Constitución Política de Colombia (Art. 23):** Derecho fundamental de petición.
- **Ley Estatutaria 1755 de 2015:** Términos de resolución de peticiones (10, 15 y 30 días hábiles).
- **Ley 1437 de 2011 (CPACA):** Código de Procedimiento Administrativo y de lo Contencioso Administrativo.
- **Ley 594 de 2000 (Ley General de Archivos):** Principios de integridad, autenticidad y Tablas de Retención Documental (TRD).
- **Ley 1952 de 2019 / Ley 2094 de 2021:** Código General Disciplinario (fases de instrucción y juzgamiento).
- **Ley 1712 de 2014:** Transparencia y del Derecho de Acceso a la Información Pública Nacional.

