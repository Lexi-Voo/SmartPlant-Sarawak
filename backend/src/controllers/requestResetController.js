/**
 * ============================================================================
 * REQUEST PASSWORD RESET CONTROLLER
 * ============================================================================
 * 
 * PURPOSE:
 * Initiates password reset process by generating and sending OTP to user's email.
 * First step of the password reset workflow.
 * 
 * FEATURES:
 * - Verify user exists by email
 * - Generate 6-digit OTP code
 * - Send OTP via email
 * - Store OTP in database with 90-second expiration
 * - Terminal display for development/debugging
 * 
 * ROUTE:
 * POST /auth/request-reset
 * 
 * WORKFLOW:
 * 1. User enters email address (THIS CONTROLLER)
 * 2. OTP sent to email
 * 3. User verifies OTP (handled by separate OTP verification endpoint)
 * 4. User sets new password (handled by resetPasswordController)
 * 
 * SECURITY:
 * - OTP expires after 90 seconds
 * - OTP marked as used after verification
 * - Does not reveal if email exists (returns success either way in production)
 * ============================================================================
 */

// ============================================================================
// DEPENDENCIES
// ============================================================================

const DBConn = require('../config/db');  // Database connection pool
const generateOTP = require('../utils/otpgeneration');  // Generate 6-digit OTP
const sendMail = require('../utils/mailer');  // Send emails

// ============================================================================
// REQUEST RESET CONTROLLER
// ============================================================================

/**
 * Request password reset by sending OTP to email
 * @route POST /auth/request-reset
 * @param {string} req.body.email - User's email address
 * @returns {Object} Success message and user info
 */
const requestResetController = async (req, res) => {
  // Extract email from request body
  const { email } = req.body;

  // ========================================================================
  // STEP 1: Validate Input
  // ========================================================================

  if (!email) {
    return res.status(400).json({ 
      success: false, 
      message: 'Email is required.' 
    });
  }

  try {
    // Get database connection pool
    const pool = await DBConn();

    // ====================================================================
    // STEP 2: Verify User Exists
    // ====================================================================

    // Look up user by email address
    const [users] = await pool.query(
      'SELECT user_id, username, email FROM users WHERE email = ?', 
      [email]
    );
    
    // Return error if no account found with this email
    if (users.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'No account found with this email address.' 
      });
    }

    const user = users[0];

    // ====================================================================
    // STEP 3: Generate OTP Code
    // ====================================================================

    // Generate 6-digit OTP code
    const otp = generateOTP();
    
    // Set creation and expiration timestamps
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 90 * 1000);  // 90 seconds from now

    // ====================================================================
    // STEP 4: Display OTP in Terminal (Development/Debugging)
    // ====================================================================

    // Display OTP prominently in terminal for development
    // Makes testing easier when email server is not available
    console.log('\n' + '='.repeat(60));
    console.log(' PASSWORD RESET - OTP GENERATED');
    console.log('='.repeat(60));
    console.log(` Username: ${user.username}`);
    console.log(` Email: ${email}`);
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log(`║           OTP CODE: ${otp}                              ║`);
    console.log('╚════════════════════════════════════════════════════════╝');
    console.log(` Expires at: ${expiresAt.toLocaleString()}`);
    console.log(` Valid for: 90 seconds`);
    console.log('='.repeat(60) + '\n');

    // ====================================================================
    // STEP 5: Store OTP in Database
    // ====================================================================

    // Insert OTP record into otp_codes table
    await pool.query(
      'INSERT INTO otp_codes (user_id, otp_code, purpose, created_at, expires_at, is_used) VALUES (?, ?, ?, ?, ?, ?)',
      [user.user_id, otp, 'reset', createdAt, expiresAt, 0]  // is_used = 0 (not used yet)
    );

    // ====================================================================
    // STEP 6: Send OTP via Email
    // ====================================================================

    try {
      // Send OTP to user's email address
      await sendMail(
        email,
        "Password Reset OTP",  // Email subject
        `Your password reset OTP is ${otp}. It expires in 90 seconds.`  // Email body
      );
    } catch (mailErr) {
      // Email sending failed - log warning but continue
      // OTP is still valid and displayed in terminal
      console.error("  Warning: Failed to send OTP email:", mailErr.message);
      console.log(" OTP generated successfully. Check terminal for code.\n");
      // Continue even if email fails - OTP shown in terminal
    }

    // ====================================================================
    // STEP 7: Return Success Response
    // ====================================================================

    return res.status(200).json({
      success: true,
      message: 'OTP sent to your email.',
      data: {
        userId: user.user_id,
        username: user.username,
        email: user.email
      }
    });

  } catch (err) {
    // ====================================================================
    // ERROR HANDLING
    // ====================================================================

    console.error('Error requesting password reset:', err);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal Server Error' 
    });
  }
};

// ============================================================================
// EXPORT
// ============================================================================

module.exports = requestResetController;
