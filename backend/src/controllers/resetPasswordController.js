/**
 * ============================================================================
 * RESET PASSWORD CONTROLLER
 * ============================================================================
 * 
 * PURPOSE:
 * Handles password reset functionality after OTP verification.
 * Validates new password against security policy and updates user account.
 * 
 * FEATURES:
 * - Password strength validation (8-22 chars, uppercase, lowercase, number, special)
 * - User existence verification
 * - Secure password hashing before storage
 * - Input sanitization
 * 
 * ROUTE:
 * POST /auth/reset-password
 * 
 * WORKFLOW:
 * 1. User requests password reset via email
 * 2. User verifies OTP code (handled by requestResetController)
 * 3. User submits new password (THIS CONTROLLER)
 * 4. Password validated and updated in database
 * 
 * SECURITY:
 * - Passwords hashed with bcrypt before storage
 * - Password complexity requirements enforced
 * - No plaintext password logging
 * ============================================================================
 */

// ============================================================================
// DEPENDENCIES
// ============================================================================

const DBConn = require('../config/db');  // Database connection pool
const hashPassword = require('../utils/passwordHashing');  // bcrypt password hashing

// ============================================================================
// PASSWORD POLICY REGEX
// ============================================================================

// Password must meet the following requirements:
// - Length: 8-22 characters
// - At least one lowercase letter (a-z)
// - At least one uppercase letter (A-Z)
// - At least one digit (0-9)
// - At least one special character (@$!%*?&#)
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]{8,22}$/;

// ============================================================================
// RESET PASSWORD CONTROLLER
// ============================================================================

/**
 * Reset user password after successful OTP verification
 * @route POST /auth/reset-password
 * @param {Object} req.body.email - User's email address
 * @param {Object} req.body.newPassword - New password to set
 * @returns {Object} Success/error response
 */
const resetPasswordController = async (req, res) => {
    // Extract email and new password from request body
    const { email, newPassword } = req.body; 

    // ========================================================================
    // INPUT VALIDATION
    // ========================================================================

    // Check if required fields are provided
    if (!email || !newPassword) {
        return res.status(400).json({ 
            success: false, 
            message: 'Missing required fields.' 
        });
    }

    try {
        // Get database connection pool
        const pool = await DBConn();

        // ====================================================================
        // STEP 1: Verify User Exists
        // ====================================================================

        // Check if user exists with provided email
        const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        
        if (users.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found.' 
            });
        }

        const user = users[0];

        // ====================================================================
        // STEP 2: Validate Password Strength
        // ====================================================================

        // Check if new password meets security requirements
        if (!passwordRegex.test(newPassword)) {
            return res.status(400).json({
                success: false,
                message: 'Password must be 8–22 characters long, include at least one uppercase letter, one number, and one special character.',
            });
        }

        // ====================================================================
        // STEP 3: Hash Password
        // ====================================================================

        // Hash password using bcrypt before storing in database
        // NEVER store plaintext passwords!
        const hashedPassword = await hashPassword(newPassword);

        // ====================================================================
        // STEP 4: Update Password in Database
        // ====================================================================

        await pool.query('UPDATE users SET password = ? WHERE email = ?', [hashedPassword, email]);

        // Log success (do not log password!)
        console.log(`Password reset successful for ${email}`);

        // ====================================================================
        // STEP 5: Return Success Response
        // ====================================================================

        return res.status(200).json({ 
            success: true, 
            message: 'Password has been reset successfully.' 
        });

    } catch (err) {
        // ====================================================================
        // ERROR HANDLING
        // ====================================================================

        console.error('Error resetting password:', err);
        return res.status(500).json({ 
            success: false, 
            message: 'Internal Server Error' 
        });
    }
};

// ============================================================================
// EXPORT
// ============================================================================

module.exports = resetPasswordController;
