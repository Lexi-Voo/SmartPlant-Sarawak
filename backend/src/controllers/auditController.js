/**
 * ============================================================================
 * AUDIT LOG CONTROLLER 
 * ============================================================================
 * 
 * PURPOSE:
 * Provides audit log retrieval with filtering and formatting capabilities.
 * 
 * DATABASE TABLES:
 * - audit_logs: All user activities and security events
 * - users: User information for context
 * 
 * ============================================================================
 */

const DBConn = require("../config/db");

// ============================================================================
// GET AUDIT LOGS WITH FILTERING
// ============================================================================

exports.getLogs = async (req, res) => {
  try {
    const { type, from, to } = req.query;
    const pool = await DBConn();

    // Build dynamic SQL query
    let query = `
      SELECT a.*, u.username
      FROM audit_logs a
      LEFT JOIN users u ON a.user_id = u.user_id
      WHERE 1=1
    `;
    const params = [];

    // Add activity type filter if provided
    if (type) {
      query += " AND a.action = ?";
      params.push(type);
    }
    
    // Add date range filter (from date)
    if (from) {
      query += " AND a.created_at >= ?";
      params.push(from);
    }
    
    // Add date range filter (to date)
    if (to) {
      query += " AND a.created_at <= ?";
      params.push(to);
    }

    // Sort by most recent and limit to 100 results
    query += " ORDER BY a.created_at DESC LIMIT 100";
    const [rows] = await pool.query(query, params);

    // Format each log entry with human-readable description
    const formatted = rows.map((r) => {
      let description = "System event recorded.";
      let details = {};

      // Safely parse JSON details field
      try {
        details = typeof r.details === 'string' ? JSON.parse(r.details) : r.details || {};
      } catch {
        details = {};
      }

      // Use custom description if available, otherwise generate based on type
      if (details.Description) {
        description = details.Description;
      } else {
        // Generate description based on action type
        switch (r.action) {
          case "LOGIN_SUCCESS":
            description = `${r.username || "Unknown user"} logged in successfully from ${
              details.device || "an unknown device"
            }.`;
            break;

          case "LOGIN_FAIL":
            description = `${r.username || "Unknown user"} failed to log in from ${
              details.device || "an unknown device"
            }.`;
            break;

          case "ACCOUNT_CREATED":
            description = `New account created by ${details.createdBy || r.username || "an admin"}.`;
            break;

          case "ACCOUNT_LOCKED":
            description = `${r.username || "A user"}'s account was locked — ${
              details.reason || "No reason provided"
            }.`;
            break;

          case "ACCOUNT_UNLOCKED":
            description = `${r.username || "A user"}'s account was unlocked by ${
              details.unlockedBy || "an admin"
            }.`;
            break;

          case "ROLE_CHANGED":
            description = `${details.TargetUser || "A user"}'s role was changed from ${
              details.OldRole || "unknown"
            } to ${details.NewRole || "unknown"} by ${
              details.ChangedBy || "an admin"
            }.`;
            break;

          case "OTP_FAIL":
            description = `${r.username || "A user"} failed OTP verification — ${
              details.reason || "Unknown reason"
            }.`;
            break;

          default:
            // For unknown activity types, show raw details or JSON
            if (typeof r.details === 'string') {
              description = r.details;
            } else if (Object.keys(details).length > 0) {
              description = `Event details: ${JSON.stringify(details)}`;
            }
            break;
        }
      }

      // Return formatted log entry
      return {
        id: r.id,
        type: r.action,
        detail: description,
        timestamp: new Date(r.created_at).toLocaleString(),
        isAlarming: !!r.is_alarming,
      };
    });

    res.json({ success: true, data: formatted });
  } catch (error) {
    console.error("Error fetching audit logs:", error);
    res.status(500).json({ success: false, message: "Failed to retrieve logs" });
  }
};
