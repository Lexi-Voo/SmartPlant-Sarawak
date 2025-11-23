/**
 * ============================================================================
 * USER REGISTRATION CONTROLLER
 * ============================================================================
 * 
 * PURPOSE:
 * Handles new user account creation with email verification and security measures.
 * Creates user account with unverified email status and sends verification OTP.
 * 
 * FEATURES:
 * - Username and email uniqueness validation
 * - Password strength enforcement
 * - Secure password hashing
 * - Email verification via OTP
 * - Audit logging
 * - Account remains inactive until email verified
 * 
 * ROUTE:
 * POST /auth/register
 * 
 * WORKFLOW:
 * 1. Validate input fields (username, email, password)
 * 2. Check username/email availability
 * 3. Validate password strength
 * 4. Hash password with bcrypt
 * 5. Create user account with 'Member' role and email_verified = FALSE
 * 6. Generate 6-digit OTP for email verification
 * 7. Send verification email with OTP
 * 8. Log account creation event
 * 9. Return success message (NO JWT token - must verify email first)
 * 
 * DEFAULT ROLE:
 * All new users are created as 'Member' (not Admin)
 * Admin privileges must be granted separately
 * 
 * SECURITY:
 * - User cannot login until email is verified
 * - OTP expires in 15 minutes
 * - Account created but inactive until verification
 * ============================================================================
 */

// ============================================================================
// DEPENDENCIES
// ============================================================================

const DBConn = require('../config/db');  // Database connection pool
const hashPassword = require('../utils/passwordHashing');  // argon2 password hashing
const generateOTP = require('../utils/otpgeneration');  // OTP generation
const sendMail = require('../utils/mailer');  // Email sending utility
const logEvent = require('../utils/logEvent');  // Audit logging utility

// ============================================================================
// PASSWORD POLICY REGEX
// ============================================================================

// Password requirements (same as reset password):
// - 8-22 characters
// - Uppercase, lowercase, digit, special character (@$!%*?&#)
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]{8,22}$/;

// ============================================================================
// REGISTRATION CONTROLLER
// ============================================================================

/**
 * Register new user account
 * @route POST /auth/register
 * @param {string} req.body.Username - Desired username
 * @param {string} req.body.EmailAddress - Email address
 * @param {string} req.body.Password - Password (will be hashed)
 * @returns {Object} JWT token and user information
 */
const registerController = async (req, res) => {
  // Extract registration details from request body
  //const { Username, EmailAddress, Password } = req.body;
  const Username = req.body.Username || req.body.username;
  const EmailAddress = req.body.EmailAddress || req.body.email;
  const Password = req.body.Password || req.body.password;


  // ========================================================================
  // STEP 1: Validate Required Fields
  // ========================================================================

  // Check if all required fields are provided
  if (!Username || !EmailAddress || !Password) {
    return res.status(400).json({ 
      success: false, 
      message: "Input required in all fields." 
    });
  }

  try {
    // Get database connection pool
    const pool = await DBConn();

    // ====================================================================
    // STEP 2: Check Username Availability
    // ====================================================================

    // Ensure username is unique (case-sensitive)
    const [checkUsername] = await pool.query(
      `SELECT COUNT(*) AS count FROM users WHERE username = ?`, 
      [Username]
    );
    
    if (checkUsername[0].count > 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Username already exists." 
      });
    }

    // ====================================================================
    // STEP 3: Check Email Availability
    // ====================================================================

    // Ensure email is not already registered
    const [checkEmail] = await pool.query(
      `SELECT COUNT(*) AS count FROM users WHERE email = ?`, 
      [EmailAddress]
    );
    
    if (checkEmail[0].count > 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Email already registered." 
      });
    }

    // ====================================================================
    // STEP 4: Validate Password Strength
    // ====================================================================

    // Check if password meets security requirements
    if (!passwordRegex.test(Password)) {
      return res.status(400).json({
        success: false,
        message: 'Password must be 8–22 characters long, include at least one uppercase letter, one number, and one special character.',
      });
    }

    // ====================================================================
    // STEP 5: Hash Password
    // ====================================================================

    // Hash password using bcrypt before storing
    // NEVER store plaintext passwords in database!
    const hashedPassword = await hashPassword(Password);

    // ====================================================================
    // STEP 6: Create User Account (Email Unverified)
    // ====================================================================

    // Insert new user with default role 'Member' and email_verified = FALSE
    // User cannot login until email is verified
    const [insertUser] = await pool.query(
      `INSERT INTO users (username, email, password, user_type, email_verified) VALUES (?, ?, ?, 'Member', FALSE)`,
      [Username, EmailAddress, hashedPassword]
    );
    
    // Get the auto-generated user ID
    const newUserId = insertUser.insertId;

    // ====================================================================
    // STEP 7: Generate Email Verification OTP
    // ====================================================================

    // Generate 6-digit OTP for email verification
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // Expires in 15 minutes

    // Store OTP in database
    await pool.query(
      "INSERT INTO otp_codes (user_id, otp_code, purpose, created_at, expires_at) VALUES (?, ?, 'verification', NOW(), ?)",
      [newUserId, otp, expiresAt]
    );

    // Display OTP in terminal for development/debugging
    console.log('\n' + '='.repeat(60));
    console.log(' EMAIL VERIFICATION - OTP GENERATED');
    console.log('='.repeat(60));
    console.log(` Username: ${Username}`);
    console.log(` Email: ${EmailAddress}`);
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log(`║           OTP CODE: ${otp}                              ║`);
    console.log('╚════════════════════════════════════════════════════════╝');
    console.log(` Expires at: ${expiresAt.toLocaleString()}`);
    console.log(`  Valid for: 15 minutes`);
    console.log('='.repeat(60) + '\n');

    // ====================================================================
    // STEP 8: Send Verification Email
    // ====================================================================

    // Send OTP to user's email address
    try {
      await sendMail(
        EmailAddress,
        "SmartPlant Sarawak - Verify Your Email",
        `Welcome to SmartPlant Sarawak!\n\nYour email verification code is: ${otp}\n\nThis code expires in 15 minutes.\n\nIf you did not create this account, please ignore this email.`
      );
      console.log(` Verification email sent to ${EmailAddress}`);
    } catch (mailErr) {
      console.error("  Warning: Failed to send verification email:", mailErr.message);
      console.log(" OTP generated successfully. Check terminal for code.\n");
      // Continue without failing - OTP is stored in database and displayed in terminal
    }

    // ====================================================================
    // STEP 9: Log Account Creation (Audit Trail)
    // ====================================================================

    // Log the account creation event for security audit
    await logEvent(
      newUserId, 
      'ACCOUNT_CREATED', 
      {Description: `New user account created: ${Username}. Email verification pending.`}, 
      false  // Not suspicious activity
    );

    // ====================================================================
    // STEP 10: Return Success Response (NO JWT TOKEN)
    // ====================================================================

    // Return success message - user must verify email before login
    // In development, include OTP in response for frontend display
    const isDevelopment = process.env.NODE_ENV !== 'production';

    return res.status(201).json({
      success: true,
      message: "Registration successful! Please check your email for verification code.",
      data: {
        userId: newUserId,
        username: Username,
        email: EmailAddress,
        emailVerified: false,
        requiresVerification: true,
        otpExpiresAt: expiresAt,
        //  DEV ONLY: Send OTP in response for frontend display
        ...(isDevelopment && { otpCode: otp })
      },
    });

  } catch (err) {
    // ====================================================================
    // ERROR HANDLING
    // ====================================================================

    console.error(" Error on registration:", err);
    return res.status(500).json({ 
      success: false, 
      message: "Internal Server Error" 
    });
  }
};

// ============================================================================
// EXPORT
// ============================================================================

module.exports = registerController;
