/**
 * ============================================================================
 * OTP (One-Time Password) ROUTES
 * ============================================================================
 * 
 * PURPOSE:
 * Handles OTP generation and verification for:
 * 1. Email Verification (registration confirmation)
 * 2. Multi-Factor Authentication (MFA) for ALL users
 * 3. Password Reset Verification
 * 
 * MAIN ENDPOINTS:
 * - POST /otp/generate - Generate and send OTP code
 * - POST /otp/verify - Verify OTP code and complete authentication
 * 
 * OTP PURPOSES:
 * - 'verification' - Email verification after registration (15 min expiry)
 * - 'mfa' - Multi-Factor Authentication for login (90 sec expiry)
 * - 'reset' - Password reset verification (15 min expiry)
 * 
 * OTP WORKFLOW:
 * 1. User requests OTP (registration, login, or password reset)
 * 2. System generates 6-digit code
 * 3. OTP sent to user's email
 * 4. OTP displayed in backend terminal (development)
 * 5. User submits OTP code
 * 6. System verifies code (checks expiration, usage, correctness)
 * 7. For verification: Sets email_verified = TRUE
 *    For MFA: Returns JWT token (login complete for ALL users)
 *    For reset: Allows password change (see resetPasswordController)
 * 
 * SECURITY FEATURES:
 * - 90-second expiration time (MFA)
 * - 15-minute expiration time (verification, reset)
 * - 90-second cooldown between requests (prevents spam)
 * - Account locking after failed attempts
 * - One-time use only (marked as used after verification)
 * - Failed attempts tracked and counted
 * 
 * ROUTES MOUNTED AT: /otp/*
 * ============================================================================
 */

// ============================================================================
// DEPENDENCIES
// ============================================================================

const express = require("express");
const logEvent = require("../utils/logEvent");  // Audit logging
const router = express.Router();
const DBConn = require("../config/db");  // Database connection
const generateOTP = require("../utils/otpgeneration");  // Generate 6-digit OTP
const sendMail = require("../utils/mailer");  // Email sending
const { signToken } = require("../utils/jwt");  // JWT token generation
const {
    incrementLoginAttempt,
    checkAndAutoUnlock,
    lockAccount,
    MAX_ATTEMPTS
} = require("../utils/lockAccount");  // Account security

// ============================================================================
// GENERATE OTP
// ============================================================================

/**
 * POST /otp/generate
 * Generates and sends OTP code for MFA or password reset
 * @param {number} req.body.userId - User ID
 * @param {string} req.body.email - User email address
 * @returns {Object} Success message (OTP sent to email and terminal)
 */
router.post("/generate", async (req, res) => {
    const { userId, email } = req.body;
    if (!userId || !email) {
    return res.status(400).json({ success: false, message: "UserID and Email are required." });
    }
    try {
    const pool = await DBConn();

    // Check if the account is locked
    const isLocked = await checkAndAutoUnlock(pool, userId);
    if (isLocked) {
        return res.status(403).json({ success: false, message: "Account is locked. Try again later." });
    }

    // Cooldown check for 90 seconds before being able to generate another OTP
    const [existing] = await pool.query(
      "SELECT * FROM otp_codes WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
        [userId]
    );
    if (existing.length > 0) {
        const last = existing[0];
        const secondsSince = (Date.now() - new Date(last.created_at).getTime()) / 1000;
        if (secondsSince < 90) {
        return res.status(429).json({
            success: false,
            message: `Please wait ${Math.ceil(90 - secondsSince)} seconds before requesting another OTP.`
        });
        }
    }

    // Generate the OTP 
    const otp = generateOTP();
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 90 * 1000);

    // ========================================================================
    //  DISPLAY OTP PROMINENTLY IN BACKEND SERVER TERMINAL
    // ========================================================================
    console.log('\n' + '█'.repeat(70));
    console.log('█' + ' '.repeat(68) + '█');
    console.log('█' + '   NEW OTP CODE GENERATED - CHECK BACKEND TERMINAL!  '.padEnd(68) + '█');
    console.log('█' + ' '.repeat(68) + '█');
    console.log('█'.repeat(70));
    console.log('');
    console.log('  Email: ' + email);
    console.log('  User ID: ' + userId);
    console.log('');
    console.log('  ╔══════════════════════════════════════════════════════╗');
    console.log('  ║                                                      ║');
    console.log(`  ║                 OTP CODE: ${otp}                     ║`);
    console.log('  ║                                                      ║');
    console.log('  ╚══════════════════════════════════════════════════════╝');
    console.log('');
    console.log('  Expires at: ' + expiresAt.toLocaleString());
    console.log('  Valid for: 90 seconds');
    console.log('');
    console.log('  Enter this code in the mobile app to complete login');
    console.log('');
    console.log('█'.repeat(70) + '\n');

    // Send the OTP email first
    try {
        await sendMail(email, "Your OTP Code", `Your OTP code is ${otp}. It will expire in 90 seconds.`);
    } catch (mailErr) {
        console.error("  Warning: Error sending OTP email:", mailErr.message);
        console.log(" OTP still generated successfully. Check terminal for code.\n");
        // Continue even if email fails - OTP is still valid
    }

    // Insert OTP only after successful send
    await pool.query(
        "INSERT INTO otp_codes (user_id, otp_code, purpose, created_at, expires_at, is_used) VALUES (?, ?, 'mfa', ?, ?, 0)",
        [userId, otp, createdAt, expiresAt]
    );

    // Success message (OTP NOT sent in response for security)
    return res.status(200).json({ 
        success: true, 
        message: "OTP generated and sent successfully. Please check your email.",
        expiresAt: expiresAt
    });

    } catch (err) {
        console.error("Error generating OTP:", err);
        return res.status(500).json({ success: false, message: "Internal Server Error." });
    }
});


// Verify the OTP entered by the user
// body: { userId, otp, purpose } where purpose is 'mfa' (default) or 'reset' (password reset)
router.post("/verify", async (req, res) => {
const { userId, otp, purpose = 'mfa' } = req.body;
if (!userId || !otp) {
    return res.status(400).json({ success: false, message: "UserID and OTP are required." });
    }
    try {
    const pool = await DBConn();

    const isLocked = await checkAndAutoUnlock(pool, userId);
    if (isLocked) {
        return res.status(403).json({ success: false, message: "Account is locked. Try again later." });
    }

    // Fetch username for use in log descriptions
    const [userRows] = await pool.query(
        "SELECT username as Username, user_type FROM users WHERE user_id = ?",
        [userId]
    );
    const user = userRows[0];
    const role = user.user_type || 'Public';

    // Find the latest OTP for the user
    const [rows] = await pool.query(
      "SELECT otp_id as OTPID, user_id as UserID, otp_code as OTPCode, created_at as CreatedAt, expires_at as ExpiresAt FROM otp_codes WHERE user_id = ? AND is_used = 0 ORDER BY created_at DESC LIMIT 1",
    [userId]
    );

    // If none are found, then increment the failed attempt counter in the Loginattempt table
    // This is assuming the OTP entered was wrong
    if (rows.length === 0) {
        const attempts = await incrementLoginAttempt(pool, userId);

        // Log failed OTP login attempts in database AuditLog table
        if (purpose === 'mfa'){
            await logEvent(userId, 'LOGIN_FAIL', {Description: `${user.Username} failed an OTP login.`}, true);
        } else if (purpose === 'verification') {
            await logEvent(userId, 'EMAIL_VERIFICATION_FAIL', {Description: `${user.Username} failed email verification OTP.`}, false);
        }
        
        if (attempts >= MAX_ATTEMPTS) {
        await lockAccount(pool, userId);
        return res.status(403).json({ success: false, message: "Account locked due to too many failed attempts." });
        }
        return res.status(400).json({ success: false, message: "No OTP found." });
    }

    const record = rows[0];
    const now = new Date();

    // Check if the OTP entered has already expired or not
    // If yes, it is considered a failed attempt
    if (now > new Date(record.ExpiresAt)) {
        const attempts = await incrementLoginAttempt(pool, userId);

        // Log failed OTP attempts in database AuditLog table
        if (purpose === 'mfa'){
            await logEvent(userId, 'LOGIN_FAIL', {Description: `${user.Username} failed an OTP login - expired.`}, true);
        } else if (purpose === 'verification') {
            await logEvent(userId, 'EMAIL_VERIFICATION_FAIL', {Description: `${user.Username} failed email verification OTP - expired.`}, false);
        }

        if (attempts >= MAX_ATTEMPTS) {
        await lockAccount(pool, userId);
        return res.status(403).json({ success: false, message: "Account locked due to too many failed attempts." });
        }
        return res.status(400).json({ success: false, message: "OTP has expired. Please request a new one." });
    }

    // Verify that the OTP matches with the one stored in the database
    // Convert both to strings for comparison
    const storedOtp = String(record.OTPCode).trim();
    const enteredOtp = String(otp).trim();
    
    console.log('   OTP Verification:');
    console.log(`   Entered OTP: "${enteredOtp}" (type: ${typeof enteredOtp})`);
    console.log(`   Stored OTP: "${storedOtp}" (type: ${typeof record.OTPCode})`);
    console.log(`   Match: ${storedOtp === enteredOtp}`);
    
    if (storedOtp !== enteredOtp) {
        const attempts = await incrementLoginAttempt(pool, userId);

        // Log failed OTP attempts in database AuditLog table
        if (purpose === 'mfa'){
            await logEvent(userId, 'LOGIN_FAIL', {Description: `${user.Username} failed an OTP login - incorrect code.`}, true);
        } else if (purpose === 'verification') {
            await logEvent(userId, 'EMAIL_VERIFICATION_FAIL', {Description: `${user.Username} failed email verification OTP - incorrect code.`}, false);
        }

        if (attempts >= MAX_ATTEMPTS) {
        await lockAccount(pool, userId);
        return res.status(403).json({ success: false, message: "Account locked due to too many failed attempts." });
        }
        return res.status(400).json({ success: false, message: `Invalid OTP. ${MAX_ATTEMPTS - attempts} attempts remaining.` });
    }

    // If the OTP is valid, mark it as used
    await pool.query("UPDATE otp_codes SET is_used = 1 WHERE otp_id = ?", [record.OTPID]);
    // Reset failed login attempts
    await pool.query("UPDATE users SET failed_login_attempts = 0 WHERE user_id = ?", [userId]);

    // Handle different OTP purposes
    if (purpose === 'verification') {
      // ========================================================================
      // EMAIL VERIFICATION: Set email_verified = TRUE + Auto-start MFA
      // ========================================================================
      await pool.query("UPDATE users SET email_verified = TRUE WHERE user_id = ?", [userId]);
      
      // Log email verification success
      await logEvent(userId, 'EMAIL_VERIFIED', {Description: `${user.Username} verified their email address.`}, false);
      
      // ========================================================================
      // AUTO-START MFA FLOW: Generate MFA OTP for seamless login
      // ========================================================================
      console.log('\n Email verified! Auto-starting MFA flow for user:', user.Username);
      
      // Generate MFA OTP
      const mfaOtp = generateOTP();
      const mfaExpiresAt = new Date(Date.now() + 90 * 1000); // 90 seconds
      
      // Store MFA OTP in database
      await pool.query(
        "INSERT INTO otp_codes (user_id, otp_code, purpose, created_at, expires_at) VALUES (?, ?, 'mfa', NOW(), ?)",
        [userId, mfaOtp, mfaExpiresAt]
      );
      
      // Display MFA OTP in terminal
      console.log('\n' + '='.repeat(60));
      console.log(` MFA LOGIN - OTP GENERATED`);
      console.log('='.repeat(60));
      console.log(` Username: ${user.Username}`);
      console.log(` Email: ${(await pool.query('SELECT email FROM users WHERE user_id = ?', [userId]))[0][0].email}`);
      console.log('\n╔════════════════════════════════════════════════════════╗');
      console.log(`║           OTP CODE: ${mfaOtp}                              ║`);
      console.log('╚════════════════════════════════════════════════════════╝');
      console.log(` Expires at: ${mfaExpiresAt.toLocaleString()}`);
      console.log(` Valid for: 90 seconds`);
      console.log('='.repeat(60) + '\n');
      
      // Send MFA OTP to user's email
      const [userEmail] = await pool.query('SELECT email FROM users WHERE user_id = ?', [userId]);
      try {
        await sendMail(
          userEmail[0].email,
          "SmartPlant Sarawak - Login OTP",
          `Your login verification code is: ${mfaOtp}\n\nThis code expires in 90 seconds.\n\nIf you did not attempt to login, please secure your account immediately.`
        );
        console.log(` MFA OTP email sent to ${userEmail[0].email}`);
      } catch (mailErr) {
        console.error(" Warning: Failed to send MFA email:", mailErr.message);
      }
      
      // Return success with flag to continue to MFA
      return res.status(200).json({ 
        success: true, 
        message: "Email verified! Please enter the login code sent to your email.",
        emailVerified: true,
        requiresMFA: true,
        userId: userId,
        email: userEmail[0].email,
        username: user.Username,
        role: role,
        // Include OTP in development mode
        ...(process.env.NODE_ENV !== 'production' && { otpCode: mfaOtp })
      });
    }
    
    if (purpose === 'mfa') {
      // ========================================================================
      // MFA FOR ALL USERS: Issue JWT token for Admin, Expert, Member
      // ========================================================================
      const token = signToken({ userId, role });

      // Log successful login in database AuditLog table
      await logEvent(userId, 'LOGIN_SUCCESS', {Description: `${user.Username} logged in successfully via MFA.`}, false);

      // Get full user data for response
      const [fullUserRows] = await pool.query(
        "SELECT user_id, username, email, user_type, profile_image FROM users WHERE user_id = ?",
        [userId]
      );
      const fullUser = fullUserRows[0];

      return res.status(200).json({ 
        success: true, 
        message: "OTP verified. Login successful.", 
        data: {
          token,
          user: {
            userId: fullUser.user_id,
            username: fullUser.username,
            email: fullUser.email,
            firstName: fullUser.first_name,
            lastName: fullUser.last_name,
            userType: fullUser.user_type
          }
        }
      });
    }

    // For password reset or other purposes, return success but no JWT
    return res.status(200).json({ success: true, message: "OTP verified." });

    } catch (err) {
    console.error("Error verifying OTP:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error." });
    }
});

module.exports = router;