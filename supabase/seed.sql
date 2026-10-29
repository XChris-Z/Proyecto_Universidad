-- supabase/seed.sql
-- ==========================================================================
-- SGD Unitrópico - Semilla de Datos Institucionales Iniciales
-- Ejecuta este script en el SQL Editor de Supabase después de las migraciones
-- ==========================================================================

-- 1. Permisos del Catálogo Institucional
INSERT INTO public.permissions (id, label, description, category) VALUES
('view_dashboard', 'Ver Dashboard y Métricas', 'Acceso al centro de mando, KPIs y semáforo', 'Consulta'),
('view_files', 'Consultar Archivos y TRD', 'Lectura de expedientes y Tablas de Retención Documental', 'Consulta'),
('upload_files', 'Radicar Nuevos Documentos', 'Subida y radicación oficial de expedientes (PDF, DOCX)', 'Operación'),
('edit_metadata', 'Editar Metadatos de Archivo', 'Modificación de descriptores y fechas límite', 'Operación'),
('delete_files', 'Anular / Eliminar Archivos', 'Baja de expedientes con justificación obligatoria en auditoría', 'Gestión'),
('download_files', 'Descargar Documentos Originales', 'Descarga de archivos institucionales digitalizados', 'Consulta'),
('manage_users', 'Administrar Usuarios y Funcionarios', 'Creación, edición y vinculación de funcionarios a dependencias', 'Configuración'),
('manage_roles', 'Gestionar Roles y Permisos', 'Configuración de matriz RBAC institucional', 'Seguridad'),
('view_audit_log', 'Auditoría y Trazabilidad SHA-256', 'Acceso a la bitácora inmutable y verificación de integridad', 'Seguridad'),
('export_audit', 'Exportar Bitácora Certificada', 'Descarga de logs en JSON/CSV para entes de control', 'Seguridad')
ON CONFLICT (id) DO NOTHING;

-- 2. Roles del Sistema
INSERT INTO public.roles (id, code, name, level, level_name, description, color, is_protected) VALUES
('role-root', 'ROOT_ADMIN', 'Superusuario Root', 1, 'Nivel 1 (Total)', 'Control absoluto del SGD, auditoría forense y configuración de seguridad.', '#6b21a8', true),
('role-rector', 'RECTOR', 'Despacho de Rectoría', 1, 'Nivel 1 (Total)', 'Máxima autoridad ejecutiva. Visualización ejecutiva, semáforo y control.', '#00594E', true),
('role-directivo', 'DIRECTIVO', 'Jefe de Dependencia / Director', 2, 'Nivel 2 (Directivo)', 'Titulares de despachos con potestad de reparto y suscripción de oficios.', '#0284c7', false),
('role-operativo', 'SUSTANCIADOR', 'Abogado / Profesional Sustanciador', 3, 'Nivel 3 (Operativo)', 'Gestión técnica y sustanciación de respuestas para revisión del titular.', '#059669', false),
('role-ventanilla', 'VENTANILLA', 'Auxiliar de Archivo y Correspondencia', 4, 'Nivel 4 (Ventanilla)', 'Recepción, radicación y digitalización de documentos de entrada.', '#d97706', false),
('role-control', 'AUDITOR', 'Control Interno / Auditor', 2, 'Nivel 2 (Directivo)', 'Inspección de tiempos de respuesta, bitácora y trazabilidad.', '#dc2626', false)
ON CONFLICT (id) DO NOTHING;

-- 3. Asignación Rol-Permisos
INSERT INTO public.role_permissions (role_id, permission_id) VALUES
('role-root', 'view_dashboard'), ('role-root', 'view_files'), ('role-root', 'upload_files'), ('role-root', 'edit_metadata'), ('role-root', 'delete_files'), ('role-root', 'download_files'), ('role-root', 'manage_users'), ('role-root', 'manage_roles'), ('role-root', 'view_audit_log'), ('role-root', 'export_audit'),
('role-rector', 'view_dashboard'), ('role-rector', 'view_files'), ('role-rector', 'upload_files'), ('role-rector', 'download_files'), ('role-rector', 'view_audit_log'), ('role-rector', 'export_audit'),
('role-directivo', 'view_dashboard'), ('role-directivo', 'view_files'), ('role-directivo', 'upload_files'), ('role-directivo', 'edit_metadata'), ('role-directivo', 'download_files'),
('role-operativo', 'view_dashboard'), ('role-operativo', 'view_files'), ('role-operativo', 'upload_files'), ('role-operativo', 'download_files'),
('role-ventanilla', 'view_dashboard'), ('role-ventanilla', 'view_files'), ('role-ventanilla', 'upload_files'),
('role-control', 'view_dashboard'), ('role-control', 'view_files'), ('role-control', 'download_files'), ('role-control', 'view_audit_log'), ('role-control', 'export_audit')
ON CONFLICT DO NOTHING;

-- 4. Dependencias Universitarias
INSERT INTO public.dependencias (id, codigo, nombre, nivel, jefe, jefe_cargo, correo, ext, color, competencias, archivos_activos) VALUES
('dep-rectoria', 'REC', 'Despacho de Rectoría', 'Directivo Superior', 'Dr. Oriol Jiménez Silva', 'Rector General', 'rectoria@unitropico.edu.co', 'Ext. 101', '#00594E', 'Dirección general, gobierno universitario y representación legal.', 12),
('dep-secretaria', 'SG', 'Secretaría General', 'Directivo Superior', 'Dr. Cristian Lemus Flórez', 'Secretario General', 'secretariageneral@unitropico.edu.co', 'Ext. 102', '#B5A160', 'Custodia de actas, acuerdos de CSU y archivo central institucional.', 8),
('dep-juridica', 'OAJ', 'Oficina Asesora Jurídica', 'Asesor', 'Dr. Wilson Barreto Rincón', 'Jefe Oficina Jurídica', 'juridica@unitropico.edu.co', 'Ext. 104', '#0284c7', 'Defensa judicial, conceptos, tutelas y contratación estatal.', 14),
('dep-planeacion', 'DPLAN', 'Dirección de Planeación Institucional', 'Asesor', 'Ing. Sonia Astrid Romero', 'Directora de Planeación', 'planeacion@unitropico.edu.co', 'Ext. 106', '#059669', 'Plan de Desarrollo Institucional (PDI), estadísticas SNIES y proyectos FTI.', 6),
('dep-disciplinario', 'OCD', 'Oficina de Control Interno Disciplinario', 'Control', 'Dr. Fabio Leonardo Pérez', 'Jefe de Control Disciplinario', 'disciplinario@unitropico.edu.co', 'Ext. 108', '#dc2626', 'Investigación y juzgamiento disciplinario bajo la Ley 1952 de 2019.', 4)
ON CONFLICT (id) DO NOTHING;

-- 5. Usuarios Institucionales
INSERT INTO public.users (id, name, role_title, role_id, dependencia_id, email, initials, avatar_color, is_active) VALUES
('usr-root', 'Dr. Cristian Lemus', 'Superusuario Root / Sec. General', 'role-root', 'dep-secretaria', 'cristian.lemus@unitropico.edu.co', 'CL', '#6b21a8', true),
('usr-001', 'Dr. Oriol Jiménez Silva', 'Rector General', 'role-rector', 'dep-rectoria', 'rectoria@unitropico.edu.co', 'OJ', '#00594E', true),
('usr-002', 'Dr. Wilson Barreto Rincón', 'Jefe Oficina Asesora Jurídica', 'role-directivo', 'dep-juridica', 'juridica@unitropico.edu.co', 'WB', '#0284c7', true),
('usr-003', 'Dra. Natalia Ramírez Celis', 'Abogada Sustanciadora Jurídica', 'role-operativo', 'dep-juridica', 'nramirez@unitropico.edu.co', 'NR', '#059669', true),
('usr-004', 'Lic. Gloria Esperanza Vargas', 'Auxiliar de Archivo y Correspondencia', 'role-ventanilla', 'dep-secretaria', 'correspondencia@unitropico.edu.co', 'GV', '#d97706', true)
ON CONFLICT (id) DO NOTHING;

-- 6. Documentos y Peticiones Iniciales
INSERT INTO public.documents (id, radicado, title, category, origin_right, applicant, applicant_type, sla_days, file_name, format, size, upload_date, due_date, responsible_id, priority, notes, status, response_status) VALUES
('doc-001', 'PQRS-2026-0841', 'Solicitud Certificado de Notas y Registro Curricular', 'Académica', 'Petición de Interés Particular (Ley 1755)', 'Laura Camila Pérez Soto', 'Estudiante Activo', 15, 'solicitud_notas_0841.pdf', 'pdf', '1.4 MB', '2026-10-14', '2026-10-23', 'usr-003', 'Alta', 'Solicitante requiere certificado de notas autenticado para homologación externa.', 'En Plazo', 'pendiente'),
('doc-002', 'TUT-2026-0042', 'Acción de Tutela - Debido Proceso Disciplinario', 'Jurídica', 'Acción de Tutela (Art. 86 CP)', 'Carlos Andrés Mendivelso', 'Egresado', 2, 'tutela_exp_0042.pdf', 'pdf', '4.2 MB', '2026-10-18', '2026-10-21', 'usr-002', 'Alta', 'Juzgado Segundo Administrativo de Yopal ordena remitir informe en 48 horas.', 'Crítico', 'pendiente'),
('doc-003', 'CONV-2026-0118', 'Propuesta de Convenio Marco Gobernación de Casanare', 'Convenio', 'Petición de Información Institucional', 'Secretaría de Educación Departamental', 'Ente Gubernamental', 30, 'convenio_gobernacion_2026.docx', 'docx', '3.1 MB', '2026-10-08', '2026-11-12', 'usr-001', 'Media', 'Convenio para pasantías y prácticas de medicina veterinaria.', 'En Plazo', 'pendiente'),
('doc-004', 'INF-2026-0095', 'Requerimiento Informe Financiero - Contraloría General', 'Financiera', 'Requerimiento de Ente de Control (Ley 1437)', 'Contraloría General del Departamento', 'Ente de Control', 10, 'requerimiento_cgr_0095.xlsx', 'xlsx', '2.8 MB', '2026-10-15', '2026-10-27', 'usr-002', 'Alta', 'Solicitud de ejecución presupuestal del Fondo de Ciencia, Tecnología e Innovación.', 'En Plazo', 'pendiente')
ON CONFLICT (id) DO NOTHING;

-- 7. Normas de Cuerpos Colegiados
INSERT INTO public.colegiados_normas (id, organo, organo_code, tipo, numero, year, fecha, titulo, descriptor, vigencia, resumen, signatarios, file_download) VALUES
('norma-001', 'Consejo Superior Universitario', 'csu', 'Acuerdo', 'Acuerdo 014', '2026', '2026-09-15', 'Por el cual se expide el Reglamento de Propiedad Intelectual y Patentes de Unitrópico', 'Propiedad Intelectual', 'vigente', 'Regula los derechos morales y patrimoniales de las invenciones, patentes y modelos de utilidad generados en la Universidad.', 'Presidente CSU & Secretario General', 'acuerdo_014_2026.pdf'),
('norma-002', 'Consejo Académico', 'ca', 'Acuerdo', 'Acuerdo 028', '2026', '2026-08-20', 'Modificación de las condiciones de permanencia y promedio ponderado para grado', 'Régimen Estudiantil', 'vigente', 'Ajusta el promedio mínimo para postulación a grados ordinarios a 3.5 en programas de pregrado.', 'Rector & Vicerrector Académico', 'acuerdo_028_2026.pdf'),
('norma-003', 'Rectoría', 'rectoria', 'Resolución', 'Resolución 412', '2026', '2026-09-02', 'Adopción del Calendario Institucional para el primer período de 2027', 'Calendario Académico', 'vigente', 'Fija las fechas de matrículas ordinarias, extraordinarias, cancelación de cursos y ceremonias de graduación.', 'Dr. Oriol Jiménez Silva', 'resolucion_412_2026.pdf')
ON CONFLICT (id) DO NOTHING;

-- 8. Convenios
INSERT INTO public.convenios (id, tipo, tipo_label, numero, entidad, objeto, inicio, fin, cuantia, supervisor, estado, archivo_minuta) VALUES
('conv-001', 'gubernamental', 'Ente Gubernamental', 'CONV-GOB-2026-004', 'Gobernación de Casanare', 'Aunar esfuerzos técnicos y financieros para el fortalecimiento de la infraestructura de investigación agroforestal.', '2026-02-01', '2027-01-31', '$2.400.000.000 COP', 'Vicerrectoría de Investigación', 'Activo / En Ejecución', 'minuta_conv_gob_004.pdf'),
('conv-002', 'internacional', 'Cooperación Internacional', 'CONV-INT-2025-019', 'Universidad Nacional Autónoma de México (UNAM)', 'Movilidad docente, estudiantil y proyectos conjuntos de investigación en biodiversidad de la Orinoquía.', '2025-06-15', '2028-06-14', 'Sin cuantía pecuniaria', 'Oficina de Relaciones Internacionales', 'Activo / En Ejecución', 'minuta_conv_unam.pdf')
ON CONFLICT (id) DO NOTHING;

