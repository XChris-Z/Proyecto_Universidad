-- 0006_audit_multiuser_and_drive_columns.sql
-- Columnas de Google Drive en peticiones e índices de alto rendimiento para auditoría multi-usuario

ALTER TABLE peticiones
  ADD COLUMN IF NOT EXISTS drive_folder_id TEXT,
  ADD COLUMN IF NOT EXISTS drive_folder_url TEXT;

-- Índices de consulta rápida para bitácora oficial y filtrado por usuario
CREATE INDEX IF NOT EXISTS idx_audit_logs_raw_timestamp ON audit_logs (raw_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_name ON audit_logs (actor_name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs (actor_id);
