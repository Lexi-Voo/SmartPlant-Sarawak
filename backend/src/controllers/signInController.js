/**
 * ============================================================================
 * SIGN IN CONTROLLER
 * ============================================================================
 * 
 * PURPOSE:
 * Handles user authentication with comprehensive security features including:
 * - Email verification check
 * - Password verification
 * - Account locking after failed attempts
 * - Multi-Factor Authentication (MFA) for ALL users
 * - Audit logging
 * 
 * MAIN SECTIONS:
 * 1. Dependencies - Import required utilities and helpers
 * 2. Input Validation - Verify required fields
 * 3. User Lookup - Find user by username or email
 * 4. Email Verification Check - Ensure email is verified
 * 5. Account Lock Check - Prevent login if account is locked
 * 6. Password Verification - Validate password and handle failures
 * 7. MFA Flow - OTP generation and email for ALL users
 * 
 * HOW IT WORKS:
 * 1. User submits username/email + password
 * 2. System checks if account exists
 * 3. Verifies email is confirmed (email_verified = TRUE)
 * 4. Checks if account is not locked
 * 5. Verifies password (tracks failed attempts)
 * 6. For ALL USERS: Generates OTP and sends to email (MFA)
 * 7. User must verify OTP in next step to get JWT token
 * 8. Logs all attempts in AuditLog table
 * 
 * SECURITY FEATURES:
 * - Email verification required before login
 * - Account locking after 5 failed attempts
 * - Auto-unlock after 3 hours
 * - MFA for ALL user types (Admin, Expert, Member) via OTP
 * - OTP expires after 90 seconds
 * - 90-second cooldown between OTP requests
 * - Comprehensive audit logging
 * 
 * USAGE:
 * POST /auth/signin
 * Body: { Identifier: "username or email", Password: "password123" }
 * ============================================================================
 */

// ============================================================================
// SECTION 1: DEPENDENCIES
// ============================================================================

const DBConn = require('../config/db');
const verifyHash = require('../utils/verifyHashing');
const { signToken } = require('../utils/jwt');
const generateOTP = require('../utils/otpgeneration');
const sendMail = require('../utils/mailer');
const {
    incrementLoginAttempt,
    checkAndAutoUnlock,
    lockAccount,
    MAX_ATTEMPTS
} = require('../utils/lockAccount');
const logEvent = require('../utils/logEvent');

// ============================================================================
// SECTION 2: MAIN SIGNIN CONTROLLER
// ============================================================================

const signInController = async (req, res) => {
    const { Identifier, Password } = req.body;

    // ============================================================================
    // STEP 1: INPUT VALIDATION
    // ============================================================================
    
    if (!Identifier || !Password) {
    return res.status(400).json({
        success: false,
        message: "Input required in all fields."
    });
    }

    try {
    const pool = await DBConn();

    // ============================================================================
    // STEP 2: USER LOOKUP
    // ============================================================================
    
    // Find user by username OR email (flexible identifier)
    const [users] = await pool.query(
        `SELECT * FROM users WHERE username = ? OR email = ?`,
        [Identifier, Identifier]
    );

    if (users.length === 0) {
        return res.status(400).json({
        success: false,
        message: "User does not exist."
        });
    }

    const userFound = users[0];

    // ============================================================================
    // STEP 3: ACCOUNT LOCK CHECK
    // ============================================================================
    
    // Check if account is locked and auto-unlock if lock period expired
    let isLocked = false;
    try {
        isLocked = await checkAndAutoUnlock(pool, userFound.user_id);
    } catch (lockErr) {
        console.error('checkAndAutoUnlock failed:', lockErr);
        // Proceed assuming not locked to avoid false lockouts due to missing tables
        isLocked = false;
    }
    
    if (isLocked) {
        return res.status(403).json({
        success: false,
        message: "Account is locked. Try again later."
        });
    }

    // ============================================================================
    // STEP 4: PASSWORD VERIFICATION
    // ============================================================================
    
    const matchedPassword = await verifyHash(userFound.password, Password);
    
    if (!matchedPassword) {
        // Password is incorrect - increment failed attempts
        let attempts = 1;
        try {
            attempts = await incrementLoginAttempt(pool, userFound.user_id);
        } catch (incErr) {
            console.error('incrementLoginAttempt failed:', incErr);
            attempts = 1; // fall back
        }

        // Log failed login attempt in database AuditLog table
        await logEvent(userFound.user_id, 'LOGIN_FAIL', {Description: `${userFound.username} failed a password login attempt.`}, true);

        // Lock account if max attempts reached
        if (attempts >= MAX_ATTEMPTS) {
        try {
            await lockAccount(pool, userFound.user_id);
        } catch (lockErr) {
            console.error('lockAccount failed:', lockErr);
        }
        return res.status(403).json({
            success: false,
            message: "Account locked due to too many failed attempts."
        });
        }
        
        // Return remaining attempts to user
        return res.status(401).json({
        success: false,
        message: `Incorrect password. ${MAX_ATTEMPTS - attempts} attempts remaining.`
        });
    }

    // Password is correct - reset failed login attempts counter
    try {
        await pool.query("DELETE FROM login_attempts WHERE user_id = ?", [userFound.user_id]);
    } catch (resetErr) {
        console.error('Failed to reset login attempts:', resetErr);
    }

    // Get user role from user_type field
    const role = userFound.user_type || 'Member';

    // ============================================================================
    // STEP 5: EMAIL VERIFICATION CHECK
    // ============================================================================
    
    // Check if user has verified their email address
    if (!userFound.email_verified) {
      // ========================================================================
      // Generate OTP for Email Verification
      // ========================================================================
      
      // Check if an OTP was recently sent (cooldown period to prevent spam)
      const [existingOtp] = await pool.query(
        "SELECT * FROM otp_codes WHERE user_id = ? AND purpose = 'verification' ORDER BY created_at DESC LIMIT 1",
        [userFound.user_id]
      );
      
      let shouldGenerateNewOtp = true;
      let existingOtpCode = null;
      
      if (existingOtp.length > 0) {
        const lastOtp = existingOtp[0];
        const secondsSince = (Date.now() - new Date(lastOtp.created_at).getTime()) / 1000;
        const expiresAt = new Date(lastOtp.expires_at);
        const isExpired = new Date() > expiresAt;
        const isUsed = lastOtp.is_used === 1;
        
        // If OTP is still valid (not expired, not used), reuse it
        if (!isExpired && !isUsed) {
          shouldGenerateNewOtp = false;
          existingOtpCode = lastOtp.otp_code;
          console.log('  Reusing existing valid verification OTP for user:', userFound.username);
        }
      }
      
      let otpCode = existingOtpCode;
      
      // Generate new OTP if needed
      if (shouldGenerateNewOtp) {
        otpCode = generateOTP();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
        
        // Store OTP in database
        await pool.query(
          "INSERT INTO otp_codes (user_id, otp_code, purpose, created_at, expires_at) VALUES (?, ?, 'verification', NOW(), ?)",
          [userFound.user_id, otpCode, expiresAt]
        );
        
        // Display OTP in terminal
        console.log('\n' + '='.repeat(60));
        console.log('📧 EMAIL VERIFICATION - OTP GENERATED');
        console.log('='.repeat(60));
        console.log(`👤 Username: ${userFound.username}`);
        console.log(`📧 Email: ${userFound.email}`);
        console.log('\n╔════════════════════════════════════════════════════════╗');
        console.log(`║           OTP CODE: ${otpCode}                              ║`);
        console.log('╚════════════════════════════════════════════════════════╝');
        console.log(`⏰ Expires at: ${expiresAt.toLocaleString()}`);
        console.log(`⏱️  Valid for: 15 minutes`);
        console.log('='.repeat(60) + '\n');
        
        // Send OTP to user's email
        try {
          await sendMail(
            userFound.email,
            "SmartPlant Sarawak - Verify Your Email",
            `Welcome to SmartPlant Sarawak!\n\nYour email verification code is: ${otpCode}\n\nThis code expires in 15 minutes.\n\nPlease enter this code to verify your email and complete your account setup.`
          );
          console.log(` Verification OTP email sent to ${userFound.email}`);
        } catch (mailErr) {
          console.error("  Warning: Failed to send verification email:", mailErr.message);
          console.log(" OTP generated successfully. Check terminal for code.\n");
        }
      }
      
      // Return response that will redirect to verification screen
      return res.status(200).json({
        success: false,
        message: "Email not verified. Please enter the verification code from your email.",
        requiresVerification: true,
        userId: userFound.user_id,
        username: userFound.username,
        email: userFound.email,
        // Include OTP in development mode only
        ...(process.env.NODE_ENV !== 'production' && { otpCode })
      });
    }

    // ============================================================================
    // STEP 6: MFA (Multi-Factor Authentication) FLOW - ALL USERS
    // ============================================================================
    
    /**
     * ALL USERS REQUIRE MFA (Admin, Expert, Member):
     * - Generate 6-digit OTP code
     * - Send OTP to user's email
     * - OTP expires in 90 seconds
     * - 90-second cooldown between OTP requests
     * - User must verify OTP in separate endpoint to get JWT token
     */
    
    // Check if an OTP was recently sent (cooldown period)
    const [existing] = await pool.query(
        "SELECT * FROM otp_codes WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
        [userFound.user_id]
    );

    if (existing.length > 0) {
        const last = existing[0];
        const secondsSince = (Date.now() - new Date(last.created_at).getTime()) / 1000;

        // Enforce 90-second cooldown to prevent OTP spam
        if (secondsSince < 90) {
            return res.status(429).json({
                success: false,
                message: `OTP already sent. Please wait ${Math.ceil(90 - secondsSince)} seconds before requesting another.`
            });
        }
    }

    // Generate new 6-digit OTP code
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 90 * 1000); // Expires in 90 seconds

    // Display OTP prominently in terminal (for development/debugging)
    console.log('\n' + '='.repeat(60));
    console.log(` ${role.toUpperCase()} LOGIN - OTP GENERATED`);
    console.log('='.repeat(60));
    console.log(` Username: ${userFound.username}`);
    console.log(` Email: ${userFound.email}`);
    console.log(` Role: ${role}`);
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log(`║           OTP CODE: ${otp}                              ║`);
    console.log('╚════════════════════════════════════════════════════════╝');
    console.log(` Expires at: ${expiresAt.toLocaleString()}`);
    console.log(`  Valid for: 90 seconds`);
    console.log('='.repeat(60) + '\n');

    // Store OTP in database
    await pool.query(
        "INSERT INTO otp_codes (user_id, otp_code, purpose, created_at, expires_at) VALUES (?, ?, 'mfa', NOW(), ?)",
        [userFound.user_id, otp, expiresAt]
    );

    // Send OTP to user's email address
    try {
        await sendMail(
            userFound.email, 
            "SmartPlant Sarawak - Login OTP",
            `Your login verification code is: ${otp}\n\nThis code expires in 90 seconds.\n\nIf you did not attempt to login, please secure your account immediately.`
        );
        console.log(` MFA OTP email sent to ${userFound.email}`);
    } catch (mailErr) {
        console.error("  Warning: Failed to send OTP email:", mailErr.message);
        console.log(" OTP generated successfully. Check terminal for code.\n");
        // Continue without failing - OTP is displayed in terminal
    }

    // Return success - User must verify OTP in next step
    // In development, include OTP in response for frontend terminal display
    const isDevelopment = process.env.NODE_ENV !== 'production';
    
    return res.status(200).json({
        success: true,
        message: "OTP sent to your email. Please verify to complete login.",
        requiresMFA: true,
        role: role,
        userId: userFound.user_id,
        username: userFound.username,
        email: userFound.email,
        otpExpiresAt: expiresAt,
        // DEV ONLY: Send OTP in response for frontend terminal display
        ...(isDevelopment && { otpCode: otp })
    });

    // ============================================================================
    // ERROR HANDLING
    // ============================================================================

    } catch (err) {
        console.error(" Error encountered on sign in:", err);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
};

// ============================================================================
// EXPORT
// ============================================================================

module.exports = signInController;