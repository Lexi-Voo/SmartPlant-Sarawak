/**
 * ============================================================================
 * AUDIT LOG SEARCH UTILITY
 * ============================================================================
 * 
 * PURPOSE:
 * Provides advanced search functionality for audit logs.
 * Enables admins to search and filter security events.
 * 
 * SEARCH TYPES:
 * - 'activity': General activity logs (all events)
 * - 'alert': Security alerts and suspicious activities
 * 
 * SEARCH CAPABILITIES:
 * - Text search in action type, details, and username
 * - Date range filtering (from/to)
 * - Result limit (pagination)
 * - Username lookup integration
 * 
 * FEATURES:
 * - SQL LIKE pattern matching
 * - Joins with users table for username search
 * - Flexible parameter handling
 * - Sorted by most recent first
 * 
 * USAGE:
 * const { searchAuditLog } = require('./utils/logSearch');
 * 
 * const results = await searchAuditLog({
 *   type: 'activity',
 *   search: 'login',
 *   from: '2024-01-01',
 *   to: '2024-12-31',
 *   limit: 100
 * });
 * 
 * DATABASE TABLES:
 * - audit_logs: Main audit log table
 * - users: For username lookups
 * ============================================================================
 */

// ============================================================================
// DEPENDENCIES
// ============================================================================

const DBConn = require("../config/db");  // Database connection pool

// ============================================================================
// SEARCH AUDIT LOG FUNCTION
// ============================================================================

/**
 * Search audit logs with filtering
 * @param {Object} params - Search parameters
 * @param {string} params.type - Search type: 'activity' or 'alert' (default: 'activity')
 * @param {string} params.search - Search term (searches action, details, username)
 * @param {string} params.from - Start date for filtering (ISO format)
 * @param {string} params.to - End date for filtering (ISO format)
 * @param {number} params.limit - Maximum results (default: 50)
 * @returns {Promise<Array>} Array of matching audit log entries
 */
const searchAuditLog = async ({ type = "activity", search = "", from = null, to = null, limit = 50 }) => {
  const pool = await DBConn();
  const searchPattern = `%${search}%`;
  const params = [];
  let sql = "";

  if (type === "activity") {
    sql = `
      SELECT action AS ActivityType, details AS Details, created_at AS RecordedAt, user_id AS UserID
      FROM audit_logs
      WHERE (action LIKE ? OR details LIKE ? OR user_id IN (
        SELECT user_id FROM users WHERE username LIKE ?
      ))
    `;
    params.push(searchPattern, searchPattern, searchPattern);
  } else if (type === "alert") {
    sql = `
      SELECT a.*, u.username AS Username
      FROM audit_logs a
      JOIN users u ON a.user_id = u.user_id
      WHERE (a.action LIKE ? OR a.details LIKE ? OR u.username LIKE ?)
    `;
    params.push(searchPattern, searchPattern, searchPattern);
  }

  if (from) {
    sql += " AND created_at >= ?";
    params.push(from);
  }
  if (to) {
    sql += " AND created_at <= ?";
    params.push(to);
  }

  sql += " ORDER BY created_at DESC LIMIT ?";
  params.push(limit);

  const [rows] = await pool.query(sql, params);
  return rows;
};

module.exports = { searchAuditLog };
