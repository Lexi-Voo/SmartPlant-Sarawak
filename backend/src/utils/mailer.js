/**
 * ============================================================================
 * EMAIL SENDING UTILITY (MULTI-MODE)
 * ============================================================================
 * 
 * PURPOSE:
 * Sends emails using Gmail SMTP service via Nodemailer with fallback modes.
 * Used for OTP codes, password resets, and notifications.
 * 
 * MODES:
 * - PRODUCTION: Real Gmail SMTP (requires valid credentials)
 * - DEVELOPMENT: Console logging (works without credentials)
 * - MOCK: Simulated email (always succeeds, logs to file)
 * 
 * EMAIL TYPES SENT:
 * - Admin MFA OTP codes (90-second expiration)
 * - Password reset OTP codes
 * - Account notifications
 * 
 * CONFIGURATION (via .env):
 * - NODE_ENV: 'production' or 'development' (controls mode)
 * - EMAIL_MODE: 'smtp', 'mock', or 'console' (optional override)
 * - EMAIL_USER: Gmail address (only required for SMTP mode)
 * - EMAIL_PASS: Gmail app-specific password (only required for SMTP mode)
 * 
 * GMAIL APP PASSWORD SETUP (Production Only):
 * 1. Enable 2-Factor Authentication on Gmail account
 * 2. Go to Google Account → Security → App Passwords
 * 3. Generate password for "Mail" → "Other"
 * 4. Copy 16-character password to .env file
 * 
 * FEATURES:
 * - Multi-mode operation (SMTP/Console/Mock)
 * - Works without credentials in development
 * - Automatic fallback if SMTP fails
 * - Debug logging for troubleshooting
 * - Never crashes the application
 * - Stores emails in logs for testing
 * 
 * USAGE:
 * const sendMail = require('./utils/mailer');
 * await sendMail('user@example.com', 'Subject', 'Message body');
 * 
 * ============================================================================
 */

// ============================================================================
// DEPENDENCIES
// ============================================================================

const nodemailer = require("nodemailer");  // Email sending library
const fs = require("fs");  // File system for logging
const path = require("path");  // Path utilities
require("dotenv").config();  // Load environment variables

// ============================================================================
// CONFIGURATION
// ============================================================================

// Determine email mode
const NODE_ENV = process.env.NODE_ENV || 'development';
const EMAIL_MODE = process.env.EMAIL_MODE || (NODE_ENV === 'production' ? 'smtp' : 'console');

// Email storage directory for mock/console modes
const EMAIL_LOG_DIR = path.join(__dirname, '../../logs/emails');

// Ensure log directory exists
if (EMAIL_MODE !== 'smtp') {
    try {
        if (!fs.existsSync(EMAIL_LOG_DIR)) {
            fs.mkdirSync(EMAIL_LOG_DIR, { recursive: true });
        }
    } catch (err) {
        console.warn('[MAILER] Could not create email log directory:', err.message);
    }
}

console.log(`[MAILER] Initialized in ${EMAIL_MODE.toUpperCase()} mode (NODE_ENV: ${NODE_ENV})`);

// ============================================================================
// EMAIL TRANSPORTER CONFIGURATION (SMTP MODE ONLY)
// ============================================================================

let transporter = null;

// Only create real transporter if in SMTP mode and credentials are available
if (EMAIL_MODE === 'smtp' && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    try {
        // Remove spaces from password (common copy-paste issue)
        const cleanPassword = process.env.EMAIL_PASS.replace(/\s+/g, '');
        
        transporter = nodemailer.createTransport({
    service: "gmail",  // Use Gmail's SMTP service
    auth: {
        user: process.env.EMAIL_USER,  // Gmail address
                pass: cleanPassword,  // Gmail app-specific password (cleaned)
    },
    tls: {
        rejectUnauthorized: false  // Accept self-signed certificates
    },
    debug: true,  // Enable debug output for troubleshooting
    logger: true  // Enable detailed logging
});
        console.log('[MAILER] SMTP transporter configured');
    } catch (err) {
        console.warn('[MAILER] Failed to create SMTP transporter:', err.message);
        console.warn('[MAILER] Falling back to console mode');
    }
}

// ============================================================================
// EMAIL SENDING FUNCTIONS
// ============================================================================

/**
 * Send email via real SMTP
 */
async function sendViaSmtp(to, subject, message) {
    if (!transporter) {
        throw new Error('SMTP transporter not configured');
    }

    const mailOptions = {
        from: `SmartPlantSWK <${process.env.EMAIL_USER}>`,
        to: to,
        subject: subject,
        text: message,
    };

    await transporter.verify();
    const info = await transporter.sendMail(mailOptions);
    console.log("[MAILER] Email sent via SMTP:", info.messageId);
    return info;
}

/**
 * Log email to console (development mode)
 */
async function sendViaConsole(to, subject, message) {
    console.log('\n' + '='.repeat(80));
    console.log('[MAILER] EMAIL (CONSOLE MODE - NOT ACTUALLY SENT)');
    console.log('='.repeat(80));
    console.log(`From:    SmartPlantSWK <${process.env.EMAIL_USER || 'noreply@smartplant.com'}>`);
    console.log(`To:      ${to}`);
    console.log(`Subject: ${subject}`);
    console.log('-'.repeat(80));
    console.log(message);
    console.log('='.repeat(80) + '\n');

    // Also save to file for reference
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `email_${timestamp}_${to.replace(/[^a-zA-Z0-9]/g, '_')}.txt`;
        const filepath = path.join(EMAIL_LOG_DIR, filename);
        
        const content = `FROM: SmartPlantSWK <${process.env.EMAIL_USER || 'noreply@smartplant.com'}>
TO: ${to}
SUBJECT: ${subject}
DATE: ${new Date().toISOString()}
MODE: CONSOLE (Development)

${'-'.repeat(80)}
${message}
${'-'.repeat(80)}
`;
        
        fs.writeFileSync(filepath, content, 'utf8');
        console.log(`[MAILER] Email saved to: ${filepath}`);
    } catch (err) {
        console.warn('[MAILER] Could not save email to file:', err.message);
    }

    return {
        messageId: `<console-${Date.now()}@smartplant.dev>`,
        response: 'Email logged to console (development mode)',
        accepted: [to],
        rejected: [],
        envelope: { from: process.env.EMAIL_USER || 'noreply@smartplant.com', to: [to] }
    };
}

/**
 * Mock email sending (always succeeds)
 */
async function sendViaMock(to, subject, message) {
    console.log(`[MAILER] 🎭 MOCK EMAIL: "${subject}" to ${to}`);
    
    // Save to file for testing/verification
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `mock_${timestamp}_${to.replace(/[^a-zA-Z0-9]/g, '_')}.txt`;
        const filepath = path.join(EMAIL_LOG_DIR, filename);
        
        const content = `FROM: SmartPlantSWK <${process.env.EMAIL_USER || 'noreply@smartplant.com'}>
TO: ${to}
SUBJECT: ${subject}
DATE: ${new Date().toISOString()}
MODE: MOCK (Testing)

${'-'.repeat(80)}
${message}
${'-'.repeat(80)}
`;
        
        fs.writeFileSync(filepath, content, 'utf8');
        console.log(`[MAILER] Mock email saved to: ${filepath}`);
    } catch (err) {
        console.warn('[MAILER] Could not save mock email:', err.message);
    }

    return {
        messageId: `<mock-${Date.now()}@smartplant.dev>`,
        response: 'Mock email sent successfully',
        accepted: [to],
        rejected: [],
        envelope: { from: process.env.EMAIL_USER || 'noreply@smartplant.com', to: [to] }
    };
}

// ============================================================================
// MAIN SEND EMAIL FUNCTION
// ============================================================================

/**
 * Send email using configured mode with automatic fallback
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject line
 * @param {string} message - Email body (plain text)
 * @returns {Promise<Object>} Email info object with messageId
 */
async function sendMail(to, subject, message) {
    console.log(`[MAILER] Sending email via ${EMAIL_MODE.toUpperCase()} mode`);
    console.log(`[MAILER] To: ${to} | Subject: ${subject}`);
    
    // Validate email parameters
    if (!to) {
        console.error('[MAILER] Recipient email is undefined or empty');
        throw new Error('Recipient email is required');
    }
    
    try {
        // Try the configured mode
        switch (EMAIL_MODE) {
            case 'smtp':
                return await sendViaSmtp(to, subject, message);
            
            case 'mock':
                return await sendViaMock(to, subject, message);
            
            case 'console':
            default:
                return await sendViaConsole(to, subject, message);
        }
    } catch (error) {
        console.error(`[MAILER] Failed to send via ${EMAIL_MODE}:`, error.message);
        
        // If SMTP fails, fallback to console mode (never crash the app)
        if (EMAIL_MODE === 'smtp') {
            console.warn('[MAILER]  Falling back to console mode');
            try {
                return await sendViaConsole(to, subject, message);
            } catch (fallbackError) {
                console.error('[MAILER] Fallback also failed:', fallbackError.message);
                // Last resort: return mock success to prevent app crash
                return await sendViaMock(to, subject, message);
            }
        }
        
        throw error;
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = sendMail;
