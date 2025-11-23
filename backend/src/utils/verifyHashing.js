/**
 * ============================================================================
 * PASSWORD VERIFICATION UTILITY
 * ============================================================================
 * 
 * PURPOSE:
 * Verifies user-entered passwords against stored Argon2 hashes.
 * Used during login to authenticate users.
 * 
 * HOW IT WORKS:
 * - Takes stored hash and plaintext password
 * - Argon2 extracts salt and parameters from hash
 * - Hashes input password with same salt/parameters
 * - Compares resulting hash with stored hash
 * - Returns true if match, false otherwise
 * 
 * SECURITY:
 * - Constant-time comparison (prevents timing attacks)
 * - Uses same algorithm as passwordHashing.js
 * - Safe against brute force (memory-hard)
 * 
 * USAGE:
 * const verifyHash = require('./utils/verifyHashing');
 * const isValid = await verifyHash(storedHash, userPassword);
 * if (isValid) { // Login successful }
 * ============================================================================
 */

// ============================================================================
// DEPENDENCIES
// ============================================================================

const argon2 = require('argon2');  // Argon2 password hashing library

// ============================================================================
// VERIFY PASSWORD FUNCTION
// ============================================================================

/**
 * Verify a password against an Argon2 hash
 * @param {string} storedHash - Argon2 hash from database
 * @param {string} inputPassword - Plaintext password entered by user
 * @returns {Promise<boolean>} True if password matches, false otherwise
 */
async function verifyHash(storedHash, inputPassword) {
    try {
        // Verify password against stored hash
        // Argon2 automatically extracts salt and parameters from hash
        const match = await argon2.verify(storedHash, inputPassword);
        return match;  // Returns true if match, false otherwise
    } catch (err){
        // Log error and return false (treat as invalid password)
        console.error('Error during password verification', err);
        return false;
    }
}

// ============================================================================
// TESTING (Commented Out)
// ============================================================================

// For testing purposes - uncomment to test verification
// const storedHash = '$argon2id$v=19$m=32,t=3,p=1$5q+eIdkyzZfj+D+wz9L40Q$8Mop+qil04n+2yzJPiBkw/aII7xzJWeJlIb8Gb32M5A';
// const inputPassword = 'mySecretPass'
//
// verifyHash(storedHash, inputPassword).then(isMatch => {
//     console.log(isMatch ? 'Password correct' : 'Password incorrect');
// });

// ============================================================================
// EXPORT
// ============================================================================

module.exports = verifyHash;
