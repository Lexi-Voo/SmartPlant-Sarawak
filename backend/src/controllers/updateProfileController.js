/**
 * ============================================================================
 * UPDATE PROFILE CONTROLLER
 * ============================================================================
 * 
 * PURPOSE:
 * Allows authenticated users to update their profile information.
 * Validates input and checks for uniqueness constraints.
 * 
 * FEATURES:
 * - Update username and email
 * - Username format validation (3-30 chars, alphanumeric + underscore)
 * - Email format validation
 * - Uniqueness checks (username and email must be unique)
 * - Returns updated user data
 * 
 * ROUTE:
 * PUT /auth/update-profile
 * 
 * AUTHENTICATION:
 * Requires valid JWT token (userId extracted from token)
 * 
 * WORKFLOW:
 * 1. Verify user is authenticated
 * 2. Validate input format (username and email)
 * 3. Check username/email not taken by other users
 * 4. Update user record in database
 * 5. Return updated user information
 * ============================================================================
 */

// ============================================================================
// DEPENDENCIES
// ============================================================================

const DBConn = require('../config/db');  // Database connection pool

// ============================================================================
// UPDATE PROFILE CONTROLLER
// ============================================================================

/**
 * Update user profile information
 * @route PUT /auth/update-profile
 * @param {string} req.body.username - New username
 * @param {string} req.body.emailAddress - New email address
 * @param {number} req.user.userId - User ID from JWT token (set by auth middleware)
 * @returns {Object} Updated user data
 */
const updateProfile = async (req, res) => {
  try {
    // Debug logging
    console.log('=== UPDATE PROFILE REQUEST ===');
    console.log('Request body:', req.body);
    console.log('Request user:', req.user);
    
    // Extract new username and email from request body
    const { username, emailAddress } = req.body;
    
    // Get userId from JWT token (set by authenticateJWT middleware)
    const userId = req.user?.userId;
    
    console.log('Extracted data:', { username, emailAddress, userId });

    // ====================================================================
    // STEP 1: Verify User is Authenticated
    // ====================================================================

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized - please login again'
      });
    }

    // ====================================================================
    // STEP 2: Validate Required Fields
    // ====================================================================

    if (!username || !emailAddress) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: username, emailAddress'
      });
    }

    // ====================================================================
    // STEP 3: Validate Username Format
    // ====================================================================

    // Username must be 3-30 characters long
    if (username.length < 3 || username.length > 30) {
      return res.status(400).json({
        success: false,
        error: 'Username must be between 3 and 30 characters'
      });
    }

    // Username can only contain letters, numbers, and underscores
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return res.status(400).json({
        success: false,
        error: 'Username can only contain letters, numbers, and underscores'
      });
    }

    // ====================================================================
    // STEP 4: Validate Email Format
    // ====================================================================

    // Basic email format validation with regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailAddress)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }

    // ====================================================================
    // STEP 5: Get Database Connection Pool
    // ====================================================================

    const pool = await DBConn();

    // ====================================================================
    // STEP 6: Check Username Uniqueness
    // ====================================================================

    // Check if username is already taken by ANOTHER user
    // Exclude current user from check (user_id != userId)
    const [existingUsername] = await pool.execute(
      'SELECT user_id FROM users WHERE username = ? AND user_id != ?',
      [username, userId]
    );

    if (existingUsername.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Username is already taken'
      });
    }

    // ====================================================================
    // STEP 7: Check Email Uniqueness
    // ====================================================================

    // Check if email is already registered to ANOTHER account
    const [existingEmail] = await pool.execute(
      'SELECT user_id FROM users WHERE email = ? AND user_id != ?',
      [emailAddress, userId]
    );

    if (existingEmail.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Email is already registered to another account'
      });
    }

    // ====================================================================
    // STEP 8: Update User Profile
    // ====================================================================

    // Update username, email, and updated_at timestamp
    const updateQuery = `
      UPDATE users 
      SET username = ?, email = ?, updated_at = NOW()
      WHERE user_id = ?
    `;

    await pool.execute(updateQuery, [username, emailAddress, userId]);

    // ====================================================================
    // STEP 9: Fetch Updated User Data
    // ====================================================================

    // Retrieve updated user information to return to client
    const [updatedUser] = await pool.execute(
      `SELECT 
        user_id as userId,       -- Rename to camelCase for frontend
        username,
        email as emailAddress,   -- Rename to camelCase
        user_type as role,       -- Rename to camelCase
        created_at as createdAt  -- Rename to camelCase
      FROM users 
      WHERE user_id = ?`,
      [userId]
    );

    // Verify user still exists (safety check)
    if (updatedUser.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // ====================================================================
    // STEP 10: Return Success Response
    // ====================================================================

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: updatedUser[0]  // Return updated user object
    });

  } catch (error) {
    // ====================================================================
    // ERROR HANDLING
    // ====================================================================

    console.error('Error updating profile:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      sqlMessage: error.sqlMessage,
      sqlState: error.sqlState
    });
    
    // Return more detailed error message in development
    const errorMessage = process.env.NODE_ENV === 'production' 
      ? 'Failed to update profile'
      : error.message || 'Failed to update profile';
    
    res.status(500).json({
      success: false,
      error: errorMessage,
      ...(process.env.NODE_ENV !== 'production' && { details: error.message })
    });
  }
};

// ============================================================================
// EXPORT
// ============================================================================

module.exports = updateProfile;

