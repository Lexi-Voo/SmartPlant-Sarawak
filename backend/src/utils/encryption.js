/**
 * ============================================================================
 * DATA ENCRYPTION MODULE
 * ============================================================================
 *
 * PURPOSE:
 * Encrypts sensitive data using AES-256-GCM encryption algorithm, from the Node.js crypto module
 *
 * USE CASES:
 * - GPS coordinates (latitude, longitude) associated with sensitive plant location data
 * - Personally Identifiable Information (full name, address, etc.)
 *
 * FEATURES:
 * - AES-256-GCM (Advanced Encryption Standard, Galois/Counter Mode)
 * - Random salt + IV (Initialization Vector) for each encryption
 * - PBKDF2 key derivation
 * - Authentication tag for integrity verification
 * - Key rotation (manual for now, no KMS implementation)
 * - Specialized encrypt/decrypt helpers for:
 *   - GPS coordinates
 *   - Personal information
 *   - Generic object field encryption
 *
 * ALGORITHM:
 * - Encryption: AES-256-GCM
 * - Key Derivation: PBKDF2 with 1000 iterations
 * - Salt: 16 bytes random
 * - IV: 12 bytes random
 * - Hash: SHA-256
 * ============================================================================
 */

const crypto = require('crypto');
require('dotenv').config();

// ============================================================================
// CONSTANTS
// ============================================================================

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256-bit key
const IV_LENGTH = 12;  // 96-bit IV 
const SALT_LENGTH = 16; // 128-bit salt
const PBKDF2_ITERATIONS = 1000; // Low for prototype, increase for production
const AUTH_TAG_LENGTH = 16;

// ============================================================================
// KEY CONFIGURATION
// ============================================================================

// Dynamically load all SECRET_KEY_* variables except SECRET_KEY_CURRENT for key rotation
const secretKeys = Object.fromEntries(
  Object.entries(process.env)
    .filter(([key]) => key.startsWith('SECRET_KEY_') && key !== 'SECRET_KEY_CURRENT')
    .map(([key, value]) => [key.replace('SECRET_KEY_', ''), value])
);

// Current active key version
const currentSecretKey = process.env.SECRET_KEY_CURRENT;

// ============================================================================
// KEY DERIVATION
// ============================================================================

/**
 * Derive a 256-bit key from secret and salt using PBKDF2
 * @param {string} secret The base secret key
 * @param {Buffer} salt Random 16 byte salt
 * @returns {Buffer} A derived 256-bit encryption key
 */
function deriveKey(secret, salt) {
  return crypto.pbkdf2Sync(secret, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
}

// ============================================================================
// CORE ENCRYPTION/DECRYPTION FUNCTIONS
// ============================================================================

/**
 * Encrypt data using AES-256-GCM with a derived key, salt, and IV
 * @param {string|object} data The string/object data to be encrypted
 * @returns {string} A JSON string with ciphertext, IV, salt, authTag, and key version
 */
function encryptData(data) {
  const stringData = typeof data === 'string' ? data : JSON.stringify(data);

  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);

  const key = deriveKey(secretKeys[currentSecretKey], salt);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let ciphertext = cipher.update(stringData, 'utf8', 'hex');
  ciphertext += cipher.final('hex');

  const authTagBuffer = cipher.getAuthTag();
  if (authTagBuffer.length !== AUTH_TAG_LENGTH) {
    throw new Error(`Unexpected auth tag length: ${authTagBuffer.length}`);
  }

  return JSON.stringify({
    ciphertext,
    iv: iv.toString('hex'),
    salt: salt.toString('hex'),
    authTag: authTagBuffer.toString('hex'),
    keyVersion: currentSecretKey,
  });
}

/**
 * Decrypt AES-256-GCM encrypted data using the correct key version
 * @param {string|object} encryptedData The encrypted data (JSON string or object)
 * @returns {string|object} Decrypted data, parsed to object if JSON
 */
function decryptData(encryptedData) {
  const { ciphertext, iv, salt, authTag, keyVersion } =
    typeof encryptedData === 'string' ? JSON.parse(encryptedData) : encryptedData;

  const key = deriveKey(secretKeys[keyVersion], Buffer.from(salt, 'hex'));

  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'));
  const authTagBuffer = Buffer.from(authTag, 'hex');
  if (authTagBuffer.length !== AUTH_TAG_LENGTH) {
        throw new Error(`Invalid authTag length: expected ${AUTH_TAG_LENGTH}, got ${authTagBuffer.length}`);
  }
  decipher.setAuthTag(authTagBuffer);

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  try {
    return JSON.parse(decrypted);
  } catch {
    return decrypted;
  }
}

/**
 * Re-encrypt a single encrypted record to the current active key version
 */
function reEncryptRecord(oldEncryptedData) {
  try {
    const decrypted = decryptData(oldEncryptedData);
    if (!decrypted) throw new Error('Failed to decrypt old data');
    return encryptData(decrypted);
  } catch (error) {
    console.error('Re-encryption failed:', error);
    throw error;
  }
}

/**
 * Batch re-encrypt multiple records
 */
function reEncryptBatch(records) {
  return records.map(record => reEncryptRecord(record));
}

// ============================================================================
// SPECIALIZED ENCRYPTION FUNCTIONS
// ============================================================================

function encryptGPS(latitude, longitude) {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    throw new Error('Latitude and longitude must be numbers');
  }
  const gpsData = {
    lat: latitude,
    lng: longitude,
    timestamp: new Date().toISOString(),
  };
  return encryptData(gpsData);
}

function decryptGPS(encryptedGPS) {
  const decrypted = decryptData(encryptedGPS);
  if (!decrypted.lat || !decrypted.lng) throw new Error('Invalid GPS data');
  return decrypted;
}

function encryptPersonalInfo(info) {
  if (typeof info !== 'object') throw new Error('Personal info must be an object');
  return encryptData(info);
}

function decryptPersonalInfo(encryptedInfo) {
  return decryptData(encryptedInfo);
}

function encryptFields(obj, fields) {
  const clone = { ...obj };
  for (const f of fields) {
    if (clone[f] !== undefined && clone[f] !== null) {
      clone[f] = encryptData(clone[f]);
    }
  }
  return clone;
}

function decryptFields(obj, fields) {
  const clone = { ...obj };
  for (const f of fields) {
    if (clone[f] !== undefined && clone[f] !== null) {
      try {
        clone[f] = decryptData(clone[f]);
      } catch {
        console.warn(`Failed to decrypt field: ${f}`);
      }
    }
  }
  return clone;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  encryptData,
  decryptData,
  reEncryptRecord,
  reEncryptBatch,
  encryptGPS,
  decryptGPS,
  encryptPersonalInfo,
  decryptPersonalInfo,
  encryptFields,
  decryptFields,
};
