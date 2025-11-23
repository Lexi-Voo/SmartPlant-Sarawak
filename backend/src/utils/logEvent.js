/**
 * ============================================================================
 * AUDIT EVENT LOGGING UTILITY
 * ============================================================================
 * 
 * PURPOSE:
 * Logs security events and user activities to the audit_logs table.
 * Provides comprehensive audit trail for security monitoring.
 * 
 * EVENT TYPES:
 * - LOGIN_SUCCESS: Successful user login
 * - LOGIN_FAIL: Failed login attempt (wrong password/OTP)
 * - ACCOUNT_CREATED: New user registration
 * - ACCOUNT_LOCKED: Account locked due to failed attempts
 * - ACCOUNT_UNLOCKED: Account unlocked (auto or manual)
 * - ROLE_CHANGED: User role modified by admin
 * - OTP_FAIL: Failed OTP verification
 * - PASSWORD_RESET: Password changed
 * 
 * FEATURES:
 * - Automatic timestamp recording
 * - Suspicious activity flagging
 * - Detailed event descriptions
 * - Non-blocking (failures don't crash requests)
 * - JSON details support
 * 
 * DATABASE TABLE: audit_logs
 * Columns: id, user_id, action, details, status, is_alarming, created_at
 * 
 * USAGE:
 * const logEvent = require('./utils/logEvent');
 * await logEvent(userId, 'LOGIN_SUCCESS', {Description: 'User logged in'}, false);
 * await logEvent(userId, 'LOGIN_FAIL', {Description: 'Wrong password'}, true);
 * 
 * HARDENED DESIGN:
 * - Never throws errors (catches and logs)
 * - Logging failures don't disrupt user experience
 * - Ensures application stability
 * ============================================================================
 */

// ============================================================================
// DEPENDENCIES
// ============================================================================

const DBConn = require("../config/db");  // Database connection pool

// ============================================================================
// LOG EVENT FUNCTION
// ============================================================================

/**
 * Log an event to the audit_logs table
 * @param {number} userId - ID of the user performing the action
 * @param {string} action - Event type (LOGIN_SUCCESS, LOGIN_FAIL, etc.)
 * @param {Object} Details - Event details (preferably with Description key)
 * @param {boolean} isAlarming - Flag as suspicious/alarming activity (default: false)
 * @returns {Promise<void>} Always resolves (never throws)
 */
async function logEvent(userId, action, Details = {}, isAlarming = false) {
  try {
    // Get database connection pool
    const pool = await DBConn();
    
    // Format details as string (prefer Description field, fallback to JSON)
    const detailsString = Details.Description || JSON.stringify(Details) || "No additional details provided";

    // Insert audit log entry
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, details, status, is_alarming)
      VALUES (?, ?, ?, ?, ?)`,
      [userId, action, detailsString, 'success', isAlarming]
    );
  } catch (err) {
    // CRITICAL: Do not throw - logging failures should not block core flows
    // This ensures audit logging doesn't crash the application
    console.error("Failed to write audit_logs entry:", {
      userId: userId,
      action: action,
      error: err?.message || err,
    });
  }
}

// ============================================================================
// EXPORT
// ============================================================================

module.exports = logEvent;
