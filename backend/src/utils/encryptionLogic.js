/**
 * ============================================================================
 * ENCRYPTION LOGIC UTILITY (Advanced)
 * ============================================================================
 * 
 * PURPOSE:
 * Advanced encryption system with key rotation support.
 * Encrypts sensitive data with versioned keys for security management.
 * 
 * KEY FEATURES:
 * - Multi-version key management (V1, V2, V3)
 * - Key rotation without data loss
 * - PBKDF2 key derivation (brute-force resistant)
 * - AES-256-CBC encryption
 * - Random salt and IV for each encryption
 * 
 * ALGORITHM DETAILS:
 * - Encryption: AES-256-CBC
 * - Key Derivation: PBKDF2 with 1000 iterations
 * - Salt: 16 bytes random
 * - IV: 16 bytes random
 * - Hash: SHA-256
 * 
 * KEY ROTATION:
 * 1. Add new key version to .env (e.g., SECRET_KEY_V3)
 * 2. Update SECRET_KEY_CURRENT to new version
 * 3. New encryptions use new key
 * 4. Old data can still be decrypted with old keys
 * 5. Use reEncrypt() to migrate data to new key
 * 
 * CONFIGURATION (via .env):
 * - SECRET_KEY_V1: First generation key
 * - SECRET_KEY_V2: Second generation key
 * - SECRET_KEY_V3: Third generation key
 * - SECRET_KEY_CURRENT: Active key version (V1, V2, or V3)
 * 
 * ENCRYPTED DATA FORMAT:
 * {
 *   ciphertext: "encrypted data in hex",
 *   iv: "initialization vector in hex",
 *   salt: "salt in hex",
 *   keyVersion: "V1" or "V2" or "V3"
 * }
 * 
 * USAGE:
 * const { encryptData, decryptData, reEncrypt } = require('./utils/encryptionLogic');
 * 
 * // Encrypt
 * const encrypted = encryptData({ lat: 1.5, lng: 110.3 });
 * 
 * // Decrypt (automatically uses correct key version)
 * const decrypted = decryptData(encrypted);
 * 
 * // Re-encrypt with new key version
 * const reEncrypted = reEncrypt(encrypted);
 * ============================================================================
 */

// ============================================================================
// DEPENDENCIES
// ============================================================================

const crypto = require('crypto');  // Node.js cryptography module

// ============================================================================
// KEY CONFIGURATION
// ============================================================================

// Versioned secret keys for encryption (allows key rotation)
const secretKeys = {
  V1: process.env.SECRET_KEY_V1,  // First generation key
  V2: process.env.SECRET_KEY_V2,  // Second generation key
  V3: process.env.SECRET_KEY_V3,  // Third generation key
} 

// Current key version used for NEW encryptions
const currentSecretKey = process.env.SECRET_KEY_CURRENT;

// ============================================================================
// KEY DERIVATION
// ============================================================================

/**
 * Derive encryption key from secret key and salt using PBKDF2
 * @param {string} secret - Base secret key
 * @param {Buffer} salt - Random salt
 * @returns {Buffer} Derived 256-bit encryption key
 */
function deriveKey(secret, salt) {
  // PBKDF2: Password-Based Key Derivation Function 2
  // 1000 iterations for brute-force resistance
  // 32 bytes = 256 bits (AES-256)
  return crypto.pbkdf2Sync(secret, salt, 1000, 32, 'sha256');
}

// ============================================================================
// ENCRYPT DATA
// ============================================================================

/**
 * Encrypt data using AES-256-CBC with current key version
 * @param {string|object} data - Data to encrypt (string or JSON)
 * @returns {string} JSON string with ciphertext, IV, salt, and key version
 */
function encryptData(data) {
  const stringData = typeof data === 'string' ? data : JSON.stringify(data);

  // Generates random initialization vector (IV) and salt
  const salt = crypto.randomBytes(16); 
  const iv = crypto.randomBytes(16);

  // Defines a derived key from the current secret key and salt
  const key = deriveKey(secretKeys[currentSecretKey], salt);

  // Creates cipher with AES-256-CBC
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

  // Encrypt the data
  let encrypted = cipher.update(stringData, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // Return encrypted data as JSON string
  return JSON.stringify({
    ciphertext: encrypted,
    iv: iv.toString('hex'),
    salt: salt.toString('hex'),
    keyVersion: currentSecretKey,
  });
}


// Decryption function that decrypts JSON or string data
function decryptData(encryptedData) {
    // Accepts JSON string of encrypted data and parses the ciphertext, iv and salt out
    const { ciphertext, iv, salt, keyVersion } = typeof encryptedData === 'string' ? JSON.parse(encryptedData) : encryptedData;

    // Derives the same key used in encryption
    const key = deriveKey(secretKeys[keyVersion], Buffer.from(salt, 'hex'));
    
    // Create decipher
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      key,
      Buffer.from(iv, 'hex')
    );

    // Decrypt the data
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    // Returns decrypted data
    try {
      return JSON.parse(decrypted); // Parses decrypted string as JSON
    } catch {
      return decrypted; // Returns raw strings
    }
  }


// Re-encryption function for when the secret key version is rotated
function reEncrypt(oldEncryptedData) {
  // Decrypt using old keyVersion
  const decrypted = decryptData(oldEncryptedData);

  if (!decrypted) {
    throw new Error('Failed to decrypt old data');
  }

  // Encrypt again with current secret key
  return encryptData(decrypted);
}

module.exports = { encryptData, decryptData, reEncrypt };
