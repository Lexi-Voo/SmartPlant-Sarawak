/**
 * ============================================================================
 * ACCOUNTS DASHBOARD CONTROLLER 
 * ============================================================================
 * 
 * PURPOSE:
 * Provides data for the admin dashboard monitoring user accounts and security.
 * Tracks login activity, failed attempts, active users, and suspicious activities.
 * 
 * DATABASE TABLES:
 * - audit_logs: All user activities and security events
 * - users: User information for context
 * 
 * FIXED: Updated all queries to use correct lowercase table/column names
 * ============================================================================
 */

const DBConn = require("../config/db");

// ============================================================================
// SECTION 1: DASHBOARD METRICS
// ============================================================================

exports.getAccountMetrics = async (req, res) => {
  try {
    const pool = await DBConn();

    // Count successful logins today
    const [logins] = await pool.query(
      `SELECT COUNT(*) AS TotalLogins FROM audit_logs WHERE action = 'LOGIN_SUCCESS' AND DATE(created_at) = CURDATE()`
    );

    // Count failed login attempts today
    const [failedLogins] = await pool.query(
      `SELECT COUNT(*) AS FailedLogins FROM audit_logs WHERE action = 'LOGIN_FAIL' AND DATE(created_at) = CURDATE()`
    );

    // Count users who logged in within the last minute (currently active)
    const [activeUsers] = await pool.query(
      `SELECT COUNT(DISTINCT user_id) AS ActiveUsers FROM audit_logs WHERE action = 'LOGIN_SUCCESS' AND created_at >= NOW() - INTERVAL 1 MINUTE`
    );

    // Count suspicious/alarming activities in last 24 hours
    const [suspicious] = await pool.query(
      `SELECT COUNT(*) AS SuspiciousActivities FROM audit_logs WHERE is_alarming = TRUE AND created_at >= NOW() - INTERVAL 24 HOUR`
    );

    // Return aggregated metrics
    res.status(200).json({
      success: true,
      data: {
        totalLogins: logins[0].TotalLogins,
        failedLogins: failedLogins[0].FailedLogins,
        activeUsers: activeUsers[0].ActiveUsers,
        suspiciousActivities: suspicious[0].SuspiciousActivities,
      },
    });
  } catch (err) {
    console.error("Error fetching dashboard metrics: ", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// ============================================================================
// SECTION 2: ACTIVITY FEED
// ============================================================================

exports.getActivityFeed = async (req, res) => {
  try {
    const pool = await DBConn();

    // Fetch last 50 activities from audit_logs
    const [activities] = await pool.query(
      `SELECT action, details, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 50`
    );

    // Parse and format each activity
    const parsed = activities.map((a) => {
      // Special formatting for role changes
      if (a.action === "ROLE_CHANGED" && a.details) {
        let details;
        try {
          details = JSON.parse(a.details);
        } catch {
          details = {};
        }

        const oldRole = details.OldRole || "unknown";
        const newRole = details.NewRole || "unknown";
        const target = details.TargetUser || "A user";
        const admin = details.ChangedBy || "an admin";

        // Determine if promotion, demotion, or lateral change
        let changeType = "";
        if (oldRole === "Admin" && newRole !== "Admin") {
          changeType = "demoted";
        } else if (newRole === "Admin" && oldRole !== "Admin") {
          changeType = "promoted";
        } else {
          changeType = "changed";
        }

        // Create user-friendly description with emojis
        let description;
        if (changeType === "promoted") {
          description = `${target} was promoted to ${newRole} by ${admin}.`;
        } else if (changeType === "demoted") {
          description = `${target} was demoted from ${oldRole} to ${newRole} by ${admin}.`;
        } else {
          description = `${target}'s role was changed from ${oldRole} to ${newRole} by ${admin}.`;
        }

        return {
          type: a.action,
          details: description,
          timestamp: new Date(a.created_at).toLocaleString(),
        };
      }

      // Default formatting for other activity types
      let parsedDetails;
      try {
        parsedDetails = typeof a.details === 'string' ? JSON.parse(a.details) : a.details;
      } catch {
        parsedDetails = { Description: a.details || "No details recorded" };
      }

      return {
        type: a.action,
        details: parsedDetails.Description || a.details || "No details recorded",
        timestamp: new Date(a.created_at).toLocaleString(),
      };
    });

    res.status(200).json({ success: true, data: parsed });
  } catch (err) {
    console.error("Error fetching activity feed: ", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// ============================================================================
// SECTION 3: ALERT FEED (SECURITY ALERTS)
// ============================================================================

exports.getAlertFeed = async (req, res) => {
  try {
    const pool = await DBConn();

    // -----------------------------------------------------------------------
    // QUERY 1: Multiple Failed Login Attempts
    // -----------------------------------------------------------------------
    const [loginFailAlerts] = await pool.query(`
      SELECT u.username, COUNT(*) AS FailedLoginAttempts, MAX(a1.created_at) AS LastLoginAttempt
      FROM audit_logs a1
      JOIN users u ON a1.user_id = u.user_id
      WHERE a1.action = 'LOGIN_FAIL'
      AND a1.created_at >= NOW() - INTERVAL 24 HOUR
      GROUP BY u.user_id, 
        UNIX_TIMESTAMP(a1.created_at) DIV (5 * 60)  -- bucket by 5-minute intervals
      HAVING FailedLoginAttempts > 3
      ORDER BY LastLoginAttempt DESC;
    `);

    // -----------------------------------------------------------------------
    // QUERY 2: Multiple Failed OTP Attempts
    // -----------------------------------------------------------------------
    const [otpFailAlerts] = await pool.query(`
      SELECT u.username, COUNT(*) AS FailedOTPAttempts, MAX(a1.created_at) AS LastOTPAttempt
      FROM audit_logs a1
      JOIN users u ON a1.user_id = u.user_id
      WHERE a1.action = 'OTP_FAIL'
      AND a1.created_at >= NOW() - INTERVAL 24 HOUR
      GROUP BY u.user_id, 
        UNIX_TIMESTAMP(a1.created_at) DIV (5 * 60)  -- bucket by 5-minute intervals
      HAVING FailedOTPAttempts > 3
      ORDER BY LastOTPAttempt DESC;
    `);

    // -----------------------------------------------------------------------
    // QUERY 3: Admin Role Changes
    // -----------------------------------------------------------------------
    const [roleChangeAlerts] = await pool.query(`
      SELECT 
        JSON_UNQUOTE(JSON_EXTRACT(a.details, '$.TargetUser')) AS TargetUsername,
        JSON_UNQUOTE(JSON_EXTRACT(a.details, '$.ChangedBy')) AS ChangedBy,
        JSON_UNQUOTE(JSON_EXTRACT(a.details, '$.OldRole')) AS OldRole,
        JSON_UNQUOTE(JSON_EXTRACT(a.details, '$.NewRole')) AS NewRole,
        a.created_at AS LastEventAt
      FROM audit_logs a
      WHERE a.action = 'ROLE_CHANGED'
      AND a.created_at >= NOW() - INTERVAL 24 HOUR
      ORDER BY a.created_at DESC
      LIMIT 50
    `);

    // -----------------------------------------------------------------------
    // QUERY 4: Account Lockouts
    // -----------------------------------------------------------------------
    const [accountLockAlerts] = await pool.query(`
      SELECT 
        JSON_UNQUOTE(JSON_EXTRACT(a.details, '$.Description')) AS Description,
        u.username,
        a.created_at AS LastEventAt
      FROM audit_logs a
      JOIN users u ON a.user_id = u.user_id
      WHERE a.action = 'ACCOUNT_LOCKED'
      AND a.created_at >= NOW() - INTERVAL 24 HOUR
      ORDER BY a.created_at DESC
    `);

    // -----------------------------------------------------------------------
    // COMBINE AND FORMAT ALL ALERTS
    // -----------------------------------------------------------------------
    
    const combined = [
      // Format login failure alerts
      ...loginFailAlerts.map((a) => ({
        username: a.username,
        alertType: "LOGIN_FAIL",
        details: `${a.username} failed ${a.FailedLoginAttempts} login attempts.`,
        timestamp: a.LastLoginAttempt,
      })),
      
      // Format account lockout alerts
      ...accountLockAlerts.map((a) => ({
        username: a.username,
        alertType: "ACCOUNT_LOCKED",
        details: a.Description || `${a.username}'s account was locked.`,
        timestamp: a.LastEventAt,
      })),
  
      // Format OTP failure alerts
      ...otpFailAlerts.map((a) => ({
        username: a.username,
        alertType: "OTP_FAIL",
        details: `${a.username} failed ${a.FailedOTPAttempts} OTP attempts.`,
        timestamp: a.LastOTPAttempt,
      })),
      
      // Format and filter role change alerts (only admin promotions/demotions)
      ...roleChangeAlerts
        .filter((a) => {
          const oldRole = a.OldRole || "";
          const newRole = a.NewRole || "";
          return (
            (oldRole === "Admin" && newRole !== "Admin") ||
            (newRole === "Admin" && oldRole !== "Admin")
          );
        })
        .map((a) => {
          const oldRole = a.OldRole || "unknown";
          const newRole = a.NewRole || "unknown";
          const target = a.TargetUsername || "A user";
          const admin = a.ChangedBy || "an admin";

          let changeType = "";
          if (oldRole === "Admin" && newRole !== "Admin") {
            changeType = "demoted";
          } else if (newRole === "Admin" && oldRole !== "Admin") {
            changeType = "promoted";
          }

          let detailsMessage;
          if (changeType === "promoted") {
            detailsMessage = `${target} was promoted to Admin by ${admin}.`;
          } else if (changeType === "demoted") {
            detailsMessage = `${target} was demoted from Admin to ${newRole} by ${admin}.`;
          }

          return {
            username: target,
            alertType: "ROLE_CHANGED",
            details: detailsMessage,
            changeType,
            timestamp: a.LastEventAt,
          };
        }),
    ];

    // Sort all alerts by timestamp (most recent first)
    combined.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.status(200).json({ success: true, data: combined });
  } catch (err) {
    console.error("Error fetching alert feed: ", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};
