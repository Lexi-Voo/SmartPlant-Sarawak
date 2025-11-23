/**
 * ============================================================================
 * AUTHENTICATION ROUTES
 * ============================================================================
 * 
 * PURPOSE:
 * This file defines all authentication-related routes for the SmartPlant application.
 * It handles user registration, login (with MFA for admins), password reset, and profile updates.
 * 
 * MAIN SECTIONS:
 * 1. Dependencies & Controllers - Import required modules and authentication controllers
 * 2. Test Routes - Simple signin for testing (bypasses MFA and account locking)
 * 3. Main Authentication Routes - Production-ready authentication endpoints
 * 4. Profile Management - User profile update endpoint
 * 
 * HOW IT WORKS:
 * - Express Router groups all /auth/* endpoints
 * - Controllers handle the business logic
 * - Middleware (authenticateToken) protects certain routes
 * - Routes are mounted in the main app.js as /auth prefix
 * 
 * USAGE:
 * Import this router in your main app file:
 *   const authRoutes = require('./routes/auth');
 *   app.use('/auth', authRoutes);
 * ============================================================================
 */

// ============================================================================
// SECTION 1: DEPENDENCIES & CONTROLLERS
// ============================================================================

const express = require("express");
const router = express.Router();

// Import authentication controllers
const registerController = require("../controllers/registerController");
const signInController = require("../controllers/signInController");
const resetPasswordController = require('../controllers/resetPasswordController');
const requestResetController = require('../controllers/requestResetController');
const updateProfileController = require('../controllers/updateProfileController');
const { authenticateToken } = require('../middleware/authMiddleware');

// Import utilities for test signin
const DBConn = require("../config/db");
const verifyHash = require("../utils/verifyHashing");
const { signToken } = require("../utils/jwt");

// ============================================================================
// SECTION 2: TEST ROUTES
// ============================================================================

/**
 * POST /auth/test-signin
 * 
 * PURPOSE:
 * Simple signin endpoint for development/testing purposes.
 * This bypasses MFA, account locking, and audit logging.
 * 
 * HOW IT WORKS:
 * 1. Accepts username/email + password
 * 2. Verifies credentials against database
 * 3. Returns JWT token immediately without MFA
 * 
 * USE CASE:
 * - Development testing
 * - Bypassing MFA during development
 * - Quick authentication without security features
 * 
 * ⚠️ WARNING: Do not use in production! No security measures enabled.
 */
router.post("/test-signin", async (req, res) => {
  try {
    const { Identifier, Password } = req.body;
    const pool = await DBConn();
    
    // Find user by username OR email
    const [users] = await pool.query(
      'SELECT * FROM users WHERE username = ? OR email = ?',
      [Identifier, Identifier]
    );
    
    if (users.length === 0) {
      return res.json({ success: false, message: "User not found" });
    }
    
    const user = users[0];
    
    // Verify password hash
    const passwordMatch = await verifyHash(user.password, Password);
    
    if (!passwordMatch) {
      return res.json({ success: false, message: "Incorrect password" });
    }
    
    // Generate JWT token
    const token = signToken({ userId: user.user_id, role: user.user_type });
    
    // Return success with token and user data
    return res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        userId: user.user_id,
        username: user.username,
        emailAddress: user.email,
        role: user.user_type
      }
    });
  } catch (error) {
    console.error('Test signin error:', error);
    return res.json({ success: false, message: error.message });
  }
});

// ============================================================================
// SECTION 3: MAIN AUTHENTICATION ROUTES
// ============================================================================

/**
 * POST /auth/register
 * Creates a new user account
 * - Validates input data
 * - Hashes password
 * - Stores user in database
 */
router.post("/register", registerController);

/**
 * POST /auth/signin
 * Main signin endpoint with full security features
 * 
 * HOW IT WORKS:
 * - Verifies username/email and password
 * - Checks for account lock status
 * - For ADMIN users: Triggers MFA (OTP sent to email)
 * - For Normal/Expert users: Returns JWT token immediately
 * - Logs all login attempts in AuditLog table
 * - Implements account locking after failed attempts
 */
router.post("/signin", signInController);

/**
 * POST /auth/requestReset
 * Initiates password reset process
 * - Validates user email
 * - Generates reset token
 * - Sends reset link to email
 */
router.post('/requestReset', requestResetController);

/**
 * POST /auth/resetPassword
 * Completes password reset with token
 * - Validates reset token
 * - Updates password
 * - Invalidates reset token
 */
router.post('/resetPassword', resetPasswordController);

/**
 * POST /auth/logout
 * Handles user logout
 * 
 * HOW IT WORKS:
 * - Currently stateless (JWT-based auth)
 * - Frontend removes token on logout
 * - Backend logs the event
 * 
 * NOTE: JWT tokens remain valid until expiration (stateless).
 * For immediate invalidation, implement token blacklist.
 */
router.post("/logout", (req, res) => {
    console.log('[BACKEND] User logged out successfully');
    
    return res.status(200).json({
        success: true,
        message: "Logged out successfully"
    });
});

// ============================================================================
// SECTION 4: PROFILE MANAGEMENT
// ============================================================================

/**
 * PUT /auth/update-profile
 * Updates user profile information
 * 
 * SECURITY:
 * - Requires valid JWT token (authenticateToken middleware)
 * - User can only update their own profile
 * 
 * FIELDS THAT CAN BE UPDATED:
 * - First name, Last name
 * - Email address
 * - Password (requires old password verification)
 */
router.put("/update-profile", authenticateToken, updateProfileController);

// ============================================================================
// EXPORT ROUTER
// ============================================================================

module.exports = router;
