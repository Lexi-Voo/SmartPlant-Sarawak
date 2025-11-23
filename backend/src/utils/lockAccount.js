/**
 * ============================================================================
 * ACCOUNT LOCKING UTILITY
 * ============================================================================
 * 
 * PURPOSE:
 * Implements automatic account locking to prevent brute force attacks.
 * Tracks failed login attempts and locks accounts after threshold.
 * 
 * FUNCTIONS:
 * 1. incrementLoginAttempt() - Track failed login attempts
 * 2. checkAndAutoUnlock() - Check lock status and auto-unlock if expired
 * 3. lockAccount() - Lock account immediately
 * 
 * SECURITY PARAMETERS:
 * - MAX_ATTEMPTS: 5 failed attempts allowed
 * - LOCK_DURATION: 3 hours (auto-unlock after this period)
 * 
 * WORKFLOW:
 * 1. User fails login (wrong password or OTP)
 * 2. System increments attempt counter
 * 3. After 5 failures → account locked
 * 4. Lock lasts 3 hours
 * 5. After 3 hours → auto-unlock
 * 6. Successful login → reset counter
 * 
 * DATABASE TABLES:
 * - login_attempts: Tracks failed attempt counts per user
 * - users: Stores is_locked and locked_at fields
 * - audit_logs: Records lock/unlock events
 * 
 * ADMIN OVERRIDE:
 * Admins can manually unlock accounts (see unlock_admin.js script)
 * 
 * USAGE:
 * const { incrementLoginAttempt, checkAndAutoUnlock, lockAccount, MAX_ATTEMPTS } 
 *   = require('./utils/lockAccount');
 * 
 * // Check if locked before login
 * const isLocked = await checkAndAutoUnlock(pool, userId);
 * 
 * // Increment on failure
 * const attempts = await incrementLoginAttempt(pool, userId);
 * if (attempts >= MAX_ATTEMPTS) { await lockAccount(pool, userId); }
 * ============================================================================
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const MAX_ATTEMPTS = 5;  // Maximum failed login attempts before account lock
const LOCK_DURATION_HOURS = 3;  // Hours until automatic unlock
const logEvent = require("./logEvent");  // Audit logging

// ============================================================================
// INCREMENT LOGIN ATTEMPT
// ============================================================================

/**
 * Increment failed login attempt counter for user
 * Creates new record if none exists, otherwise increments existing counter
 * @param {Object} pool - Database connection pool
 * @param {number} userId - User ID
 * @returns {Promise<number>} Current attempt count after increment
 */
async function incrementLoginAttempt(pool, userId) {
    const [rows] = await pool.query(
    "SELECT * FROM login_attempts WHERE user_id = ? LIMIT 1",
    [userId]
    );

    if (rows.length === 0) {
    await pool.query(
        "INSERT INTO login_attempts (user_id, attempt_counter, attempt_time) VALUES (?, 1, NOW())",
        [userId]
    );
    return 1;
    } else {
    const newCount = (rows[0].attempt_counter || 0) + 1;
    await pool.query(
        "UPDATE login_attempts SET attempt_counter = ?, attempt_time = NOW() WHERE login_attempt_id = ?",
        [newCount, rows[0].login_attempt_id]
    );
    return newCount;
    }
}

// Check if user is locked
// Auto unlock the account if it detects that 3 hours has passed since the accoutn was locked
async function checkAndAutoUnlock(pool, userId) {
    const [rows] = await pool.query(
    "SELECT username, is_locked, locked_at FROM users WHERE user_id = ?",
    [userId]
    );
    if (rows.length === 0) return false;

    const user = rows[0];
    if (!user.is_locked) return false;

    const lockedAt = user.locked_at ? new Date(user.locked_at) : null;
    if (lockedAt) {
    const hoursLocked = (Date.now() - lockedAt.getTime()) / (1000 * 60 * 60);
    if (hoursLocked >= LOCK_DURATION_HOURS) {
        await pool.query(
        "UPDATE users SET is_locked = FALSE, locked_at = NULL WHERE user_id = ?",
        [userId]
        );
        await pool.query("DELETE FROM login_attempts WHERE user_id = ?", [userId]);

        //Log account unlocking in database AuditLog
        await logEvent(userId, 'ACCOUNT_UNLOCKED', {Description:`User '${user.username}' account auto-unlocked.`}, false);

        return false;
    }
    }
    return true;
}

// If maximum attempts have been breached then lock the user account imediately
async function lockAccount(pool, userId) {
    await pool.query(
    "UPDATE users SET is_locked = TRUE, locked_at = NOW() WHERE user_id = ?",
    [userId]
    );

    // Fetch username for use in log description
    const [rows] = await pool.query(
        "SELECT username FROM users WHERE user_id = ?",
        [userId]
    );
    const user = rows[0];

    // Log account locking in database AuditLog table
    await logEvent(userId, 'ACCOUNT_LOCKED', {Description: `User '${user.username}' account has been locked.`}, true);
}

module.exports = {
    incrementLoginAttempt,
    checkAndAutoUnlock,
    lockAccount,
    MAX_ATTEMPTS
};
