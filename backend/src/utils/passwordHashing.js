/**
 * ============================================================================
 * PASSWORD HASHING UTILITY
 * ============================================================================
 * 
 * PURPOSE:
 * Provides secure password hashing using Argon2id algorithm.
 * Used for storing user passwords securely in the database.
 * 
 * ALGORITHM: Argon2id
 * - Winner of Password Hashing Competition (2015)
 * - Resistant to GPU/ASIC attacks
 * - Memory-hard function (prevents brute force)
 * - Hybrid of Argon2i and Argon2d (best of both)
 * 
 * CONFIGURATION (via .env):
 * - ARGON2_TIME_COST: CPU cost (default: 3) - Higher = slower but more secure
 * - ARGON2_MEMORY_COST: Memory in KB (default: 64) - Higher = more RAM required
 * - ARGON2_PARALLELISM: Threads (default: 4) - Parallel processing factor
 * 
 * SECURITY:
 * - Each hash is unique (salt automatically generated)
 * - Hash includes algorithm parameters (future-proof)
 * - Computational cost adjustable for hardware
 * 
 * USAGE:
 * const hashPassword = require('./utils/passwordHashing');
 * const hashed = await hashPassword('userPassword123');
 * 
 * OUTPUT FORMAT:
 * $argon2id$v=19$m=64,t=3,p=4$<salt>$<hash>
 * ============================================================================
 */

// ============================================================================
// DEPENDENCIES
// ============================================================================

const argon2 = require('argon2');  // Argon2 password hashing library

// ============================================================================
// ARGON2 CONFIGURATION
// ============================================================================

// Argon2id parameters (tunable via environment variables)
// Adjust based on hardware capabilities and security requirements
const argon2option = {
    type: argon2.argon2id,  // Argon2id variant (hybrid, best security)
    timeCost: parseInt(process.env.ARGON2_TIME_COST) || 3,  // Number of iterations (CPU cost)
    memoryCost: parseInt(process.env.ARGON2_MEMORY_COST) || 64,  // Memory in KB (64KB default)
    parallelism: parseInt(process.env.ARGON2_PAPARALLELISM) || 4,  // Number of parallel threads
};

// ============================================================================
// HASH PASSWORD FUNCTION
// ============================================================================

/**
 * Hash a password using Argon2id
 * @param {string} password - Plaintext password to hash
 * @returns {Promise<string>} Hashed password string
 * @throws {Error} If hashing fails
 */
async function hashPassword(password){
    try {
        // Hash password with Argon2id (automatically generates unique salt)
        const hash = await argon2.hash(password, argon2option);
        
        // Log success (never log the password itself!)
        console.log('Password hashing succesful.');
        return hash;
    } catch (err){
        // Log error and re-throw
        console.error('Error hashing password.', err);
        throw err;
    }
}

// ============================================================================
// TESTING (Commented Out)
// ============================================================================

// For testing purposes - uncomment to test hashing
// hashPassword('mySecretPass');

// ============================================================================
// EXPORT
// ============================================================================

module.exports = hashPassword;

