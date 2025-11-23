/**
 * ============================================================================
 * OTP GENERATION UTILITY
 * ============================================================================
 * 
 * PURPOSE:
 * Generates random numeric One-Time Password (OTP) codes for:
 * - Admin Multi-Factor Authentication (MFA)
 * - Password reset verification
 * 
 * FEATURES:
 * - Generates random 6-digit codes (default)
 * - Configurable length (pass length parameter)
 * - Uses Math.random() for randomness
 * 
 * SECURITY CONSIDERATIONS:
 * - Used with 90-second expiration
 * - One-time use only
 * - Stored in database with expiration timestamp
 * - Failed attempts tracked and counted
 * 
 * OTP FORMAT:
 * - Default: 6 digits (e.g., "123456")
 * - Range: 000000 to 999999
 * - All numeric characters
 * 
 * USAGE:
 * const generateOTP = require('./utils/otpgeneration');
 * const code = generateOTP();  // Returns "482917" (example)
 * const longerCode = generateOTP(8);  // Returns 8-digit code
 * ============================================================================
 */

// ============================================================================
// GENERATE OTP FUNCTION
// ============================================================================

/**
 * Generate random numeric OTP code
 * @param {number} length - Length of OTP code (default: 6)
 * @returns {string} Random numeric OTP code
 */
function generateOTP(length = 6) {
    let otp = '';  // Initialize empty OTP string
    const digits = '0123456789';  // Available digit characters
    
    // Generate random digits
    for (let i = 0; i < length; i++) {
        // Append random digit (0-9)
        otp += digits[Math.floor(Math.random() * 10)];
    }
    
    return otp;  // Return complete OTP code
}

// ============================================================================
// EXPORT
// ============================================================================

module.exports = generateOTP;
