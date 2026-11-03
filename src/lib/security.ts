// src/lib/security.ts
// Utilidad Criptográfica y Blindaje de Seguridad — SGD Unitrópico
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';

// Derivar llave estable de 32 bytes para AES-256-GCM
const MASTER_KEY_SEED =
  (typeof process !== 'undefined' ? process.env?.ENCRYPTION_KEY || process.env?.SUPABASE_SERVICE_ROLE_KEY : '') ||
  'unitropico-sgd-enterprise-encryption-salt-2026';

function getDerivedMasterKey(): Buffer {
  return crypto.createHash('sha256').update(MASTER_KEY_SEED).digest();
}

/**
 * Genera un PIN criptográfico aleatorio de 6 dígitos (100000 a 999999).
 * Previene la enumeración de radicados por actores externos.
 */
export function generatePin6(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Encripta texto usando AES-256-GCM.
 * Formato de salida: iv:authTag:encryptedData (hex)
 */
export function encryptData(plainText: string, customKey?: string): string {
  if (!plainText) return '';
  const key = customKey ? crypto.createHash('sha256').update(customKey).digest() : getDerivedMasterKey();
  const iv = crypto.randomBytes(12); // 96 bits IV recomendado para GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Desencripta texto encriptado con AES-256-GCM.
 */
export function decryptData(cipherPackage: string, customKey?: string): string {
  if (!cipherPackage || !cipherPackage.includes(':')) return cipherPackage;
  try {
    const parts = cipherPackage.split(':');
    const ivHex = parts[0];
    const authTagHex = parts[1];
    const encryptedHex = parts[2];

    if (!ivHex || !authTagHex || !encryptedHex) {
      return cipherPackage;
    }

    const key = customKey ? crypto.createHash('sha256').update(customKey).digest() : getDerivedMasterKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    const decrypted1 = decipher.update(encryptedHex, 'hex', 'utf8');
    const decrypted2 = decipher.final('utf8');
    return `${decrypted1}${decrypted2}`;
  } catch (err) {
    console.error('Error al desencriptar dato confidencial:', err);
    return '';
  }
}

/**
 * Genera hash SHA-256 seguro para verificación de integridad documental.
 */
export function hashSHA256(content: string | Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Sanitiza cadenas de entrada contra inyecciones XSS y scripts maliciosos.
 */
export function sanitizeInput(input: string | null | undefined): string {
  if (!input) return '';
  return String(input)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim();
}

/**
 * Extensiones y MIME types permitidos para entrega de anexos y expedientes.
 */
const ALLOWED_EXTENSIONS = new Set(['pdf', 'docx', 'xlsx', 'jpg', 'jpeg', 'png', 'zip']);
const DANGEROUS_EXTENSIONS = new Set([
  'exe', 'bat', 'cmd', 'sh', 'php', 'js', 'vbs', 'ps1', 'msi', 'com', 'scr', 'html', 'htm', 'svg', 'jar'
]);

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  cleanName: string;
}

/**
 * Valida un archivo antes de cargarlo a Supabase Storage.
 */
export function validateUploadedFile(
  fileName: string,
  fileBytes?: number,
  maxBytes = 25 * 1024 * 1024 // 25 MB
): FileValidationResult {
  if (!fileName) {
    return { valid: false, error: 'Nombre de archivo no especificado', cleanName: '' };
  }

  // Sanitizar nombre de archivo
  const cleanName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const ext = (cleanName.split('.').pop() || '').toLowerCase();

  if (DANGEROUS_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      error: `La extensión .${ext} no está permitida por políticas de ciberseguridad institucional.`,
      cleanName,
    };
  }

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      error: `Formato no admitido (.${ext}). Solo se permiten archivos PDF, Word (docx), Excel (xlsx), imágenes (jpg/png) o ZIP.`,
      cleanName,
    };
  }

  if (fileBytes && fileBytes > maxBytes) {
    return {
      valid: false,
      error: `El archivo supera el límite permitido de ${Math.round(maxBytes / 1024 / 1024)} MB.`,
      cleanName,
    };
  }

  return { valid: true, cleanName };
}

