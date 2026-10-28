# SGD Unitrópico - Sistema de Gestión Documental y Archivo Institucional

![Licencia](https://img.shields.io/badge/licencia-MIT-green.svg)
![Tecnología](https://img.shields.io/badge/Stack-HTML5%20%7C%20CSS3%20%7C%20JS%20Vanilla%20%7C%20Node.js-blue)
![Estado](https://img.shields.io/badge/estado-funcional-brightgreen)

Plataforma web integral para la administración, radicación, control archivístico, trazabilidad jurídica y seguimiento de expedientes de la **Universidad Internacional del Trópico Americano (Unitrópico)**.

---

## 📋 Tabla de Contenidos

1. [Descripción General](#-descripción-general)
2. [Características y Módulos](#-características-y-módulos)
3. [Tecnologías Utilizadas](#-tecnologías-utilizadas)
4. [Estructura del Proyecto](#-estructura-del-proyecto)
5. [Cuentas de Acceso (Demostración)](#-cuentas-de-acceso-demostración)
6. [Instalación y Uso Local](#-instalación-y-uso-local)
7. [Subir este proyecto a GitHub](#-subir-este-proyecto-a-github)
8. [Licencia](#-licencia)

---

## 📌 Descripción General

El **SGD Unitrópico** es una solución diseñada para optimizar los flujos documentales institucionales, dando cumplimiento a los estándares de gestión documental (Tablas de Retención Documental - TRD), normatividad legal de derechos de petición y tutelas en Colombia, control de actas y resoluciones del Consejo Superior Universitario (CSU), convenios institucionales y seguimiento a procesos disciplinarios y de planeación.

---

## 🚀 Características y Módulos

- 📊 **Dashboard Ejecutivo**: Vista analítica centralizada con métricas en tiempo real, radicación diaria, documentos en trámite, vencimientos perentorios y distribución por dependencia.
- 📁 **Módulo de Archivos & TRD**: Gestión de expedientes físicos y electrónicos, clasificación documental, series, subseries y control de tiempos de retención/conservación.
- 🏛️ **Estructura Orgánica y Dependencias**: Directorio y mapa de dependencias de la universidad (Rectoría, Secretarías, Vicerrectorías, Decanaturas y Direcciones).
- ⚖️ **Peticiones y PQRS**: Registro y semáforo de términos de ley (10, 15 y 30 días hábiles) con cálculo automático de días hábiles restantes y alertas de vencimiento.
- 📜 **Normatividad Institucional**: Acuerdos del Consejo Superior Universitario (CSU), Resoluciones Rectorales, Circulares y Actas con visor y descarga.
- 📑 **Asuntos Jurídicos y Tutelas**: Seguimiento de acciones de tutela, conceptos jurídicos institucionales y términos perentorios judiciales.
- ⚖️ **Control Disciplinario y Juzgamiento**: Gestión de expedientes e investigaciones disciplinarias internas con reserva y estados procesales.
- 📈 **Planeación y Gestión CSU**: Rendición de informes financieros, ejecución presupuestal y seguimiento a metas del plan de desarrollo.
- 📅 **Calendario Institucional**: Agenda y cronograma dinámico con sincronización automática de vencimientos de documentos y peticiones.
- 🎓 **Programas Académicos**: Registro de información de facultades, programas académicos y su respectivo archivo histórico.
- 🤝 **Relacionamiento y Convenios**: Control de convenios de cooperación interinstitucional, vigencias, pólizas y supervisión.
- 🛡️ **Auditoría y Trazabilidad**: Registro inmutable de eventos del sistema (login, radicación, modificaciones, descargas).
- 🖨️ **Visor e Impresión Membretada**: Generación y visualización de oficios, providencias y certificados oficiales listos para imprimir o exportar a PDF.

---

## 💻 Tecnologías Utilizadas

- **Frontend**:
  - HTML5 semántico
  - CSS3 puro (Variables CSS, Flexbox, CSS Grid, diseño responsivo y adaptativo)
  - JavaScript (ES6+ Vanilla, sin dependencias externas pesadas)
  - Tipografía oficial: *Montserrat* vía Google Fonts
- **Backend / Servidor**:
  - Node.js (Servidor HTTP nativo sin dependencias de terceros para servir archivos estáticos con tipos MIME y manejo seguro de rutas)

---

## 📂 Estructura del Proyecto

```text
Proyecto_universidad/
│
├── index.html          # Interfaz de usuario completa y estructura de vistas
├── server.js           # Servidor local HTTP en Node.js nativo (puerto 8080)
├── package.json        # Configuración del proyecto y scripts de ejecución
├── .gitignore          # Reglas de exclusión para Git
├── LICENSE             # Licencia de código abierto MIT
├── README.md           # Documentación del proyecto
│
├── css/
│   └── styles.css      # Estilos globales, temas, componentes y responsividad
│
├── js/
│   └── app.js          # Lógica de negocio, módulos, simulación y datos del SGD
│
└── Documentos/         # Carpeta para almacenamiento de archivos y anexos locales
```

---

## 🔑 Cuentas de Acceso (Demostración)

El sistema incluye perfiles preconfigurados para simular los roles institucionales:

| Rol Institucional | Funcionario | Correo Electrónico | Contraseña |
|---|---|---|---|
| **Rector Magnífico / Root** | Dr. Cristian Lemus | `root@unitropico.edu.co` | `rector2026` |
| **Administradora de Sistema SGD** | Lic. Andrea Morales | `admin.sgd@unitropico.edu.co` | `admin2026` |
| **Vicerrectoría Académica** | Dra. Carmen Rosa Vargas | `vicerrectoria@unitropico.edu.co` | `academica2026` |
| **Decano Facultad de Ingenierías** | Ing. Carlos Mendoza | `ingenieria@unitropico.edu.co` | `ingenieria2026` |
| **Secretaría General** | Dr. Fernando Ortiz | `secretaria@unitropico.edu.co` | `secgen2026` |
| **Asesor Jurídico** | Dr. Roberto Gómez | `juridica@unitropico.edu.co` | `juridica2026` |
| **Dirección Financiera** | C.P. Sandra Milena Peña | `financiera@unitropico.edu.co` | `financiera2026` |

---

## ⚙️ Instalación y Uso Local

### Opción 1: Con Node.js (Recomendada)

1. Abre una terminal en la carpeta del proyecto.
2. Ejecuta el servidor:
   ```bash
   npm start
   ```
   *(O directamente con: `node server.js`)*
3. Abre tu navegador web en:
   ```
   http://localhost:8080
   ```

### Opción 2: Sin Node.js (Directo en el navegador)

Simplemente haz doble clic en el archivo `index.html` o ábrelo desde cualquier navegador web moderno (Chrome, Edge, Firefox, Safari).

### Opción 3: Con la extensión Live Server de VS Code

1. Abre la carpeta del proyecto en Visual Studio Code.
2. Haz clic derecho sobre `index.html`.
3. Selecciona **"Open with Live Server"**.

---

## 📤 Subir este proyecto a GitHub

Sigue estos sencillos pasos para publicar tu repositorio:

### 1. Crear el repositorio en GitHub
1. Ve a [GitHub](https://github.com/) e inicia sesión en tu cuenta.
2. En la esquina superior derecha, haz clic en **+** y selecciona **New repository**.
3. Nombra tu repositorio (por ejemplo: `sgd-unitropico` o `Proyecto_universidad`).
4. Déjalo como **Público** o **Privado** según prefieras.
5. **No** selecciones "Add a README file", ni ".gitignore", ni "license" (ya los tenemos creados localmente).
6. Haz clic en **Create repository**.

### 2. Vincular y enviar el código
En tu terminal (PowerShell, CMD o Git Bash dentro de la carpeta del proyecto), ejecuta:

```bash
# 1. Vincular el repositorio remoto (reemplaza TU_USUARIO y TU_REPOSITORIO por los tuyos)
git remote add origin https://github.com/TU_USUARIO/TU_REPOSITORIO.git

# 2. Asegurarte de estar en la rama main
git branch -M main

# 3. Subir todos los archivos y commits
git push -u origin main
```

---

## 📄 Licencia

Este proyecto se distribuye bajo la licencia [MIT](LICENSE).
