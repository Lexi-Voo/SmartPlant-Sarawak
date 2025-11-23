/**
 * ============================================================================
 * JWT (JSON Web Token) UTILITY
 * ============================================================================
 * 
 * PURPOSE:
 * Provides token-based authentication for SmartPlant Sarawak.
 * Generates and verifies JWT tokens for user sessions.
 * 
 * FUNCTIONS:
 * 1. signToken() - Create JWT token after successful login
 * 2. verifyToken() - Validate JWT token and extract payload
 * 
 * TOKEN PAYLOAD:
 * {
 *   userId: number,     // User's database ID
 *   role: string,       // User role: 'Member', 'Expert', or 'Admin'
 *   iat: timestamp,     // Issued at (automatic)
 *   exp: timestamp      // Expiration time (automatic)
 * }
 * 
 * CONFIGURATION (via .env):
 * - JWT_SECRET: Secret key for signing tokens (REQUIRED in production!)
 * - JWT_EXPIRES_IN: Token lifespan in seconds (default: 3600 = 1 hour)
 * 
 * SECURITY:
 * - Tokens signed with HMAC SHA256
 * - Secret key required (stored in .env, never committed)
 * - Tokens expire automatically
 * - Stateless authentication (no server-side session storage)
 * 
 * USAGE:
 * const { signToken, verifyToken } = require('./utils/jwt');
 * 
 * // Login: Generate token
 * const token = signToken({ userId: 123, role: 'Member' });
 * 
 * // Request: Verify token
 * try {
 *   const payload = verifyToken(token);
 *   console.log(payload.userId, payload.role);
 * } catch (err) {
 *   // Token invalid or expired
 * }
 * ============================================================================
 */

// ============================================================================
// DEPENDENCIES
// ============================================================================

const jwt = require('jsonwebtoken');  // JWT library for token operations
require('dotenv').config();  // Load environment variables

// ============================================================================
// CONFIGURATION
// ============================================================================

// JWT secret key - MUST be set in .env for production!
// Development fallback prevents crashes but warns about security
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

// Token expiration time in seconds (default: 3600 = 1 hour)
const JWT_EXPIRES_IN = Number(process.env.JWT_EXPIRES_IN) || 3600;

// ============================================================================
// SIGN TOKEN FUNCTION
// ============================================================================

/**
 * Create a signed JWT token
 * @param {Object} payload - Data to encode in token (userId, role, etc.)
 * @returns {string} Signed JWT token
 * @throws {Error} If signing fails
 */
const signToken = (payload) => {
    try {
        // Warn if using development fallback secret
        if (!process.env.JWT_SECRET) {
            console.warn('[JWT] Using fallback development secret. Set JWT_SECRET in your .env for production.');
        }
        
        // Sign token with payload and expiration
        // Automatically adds 'iat' (issued at) and 'exp' (expiration) claims
        return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    } catch (err) {
        console.error('Failed to sign JWT:', err);
        throw err;
    }
};

// ============================================================================
// VERIFY TOKEN FUNCTION
// ============================================================================

/**
 * Verify and decode a JWT token
 * @param {string} token - JWT token to verify
 * @returns {Object} Decoded payload if valid
 * @throws {Error} If token is invalid, expired, or malformed
 */
const verifyToken = (token) => {
    // Verify token signature and expiration
    // Throws error if invalid or expired
    return jwt.verify(token, JWT_SECRET);
};

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {signToken, verifyToken};