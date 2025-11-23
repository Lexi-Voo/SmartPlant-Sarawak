/**
 * ============================================================================
 * ROLE CHANGE ROUTES (Admin Only)
 * ============================================================================
 * 
 * PURPOSE:
 * Allows administrators to manage user roles and permissions.
 * Provides endpoints for viewing users and changing their roles.
 * 
 * MAIN ENDPOINTS:
 * - GET /role/users - Get all users with their current roles
 * - PUT /role/update - Update a user's role (Admin → Member, Member → Expert, etc.)
 * 
 * USER ROLES:
 * - Member: Regular user (default for new accounts)
 * - Expert: Trusted user with higher validation weight
 * - Admin: Full system access and management capabilities
 * 
 * SECURITY:
 * - All routes require Admin role (authenticateJWT + authorizeRoles("Admin"))
 * - Admins cannot change their own role (prevents lock-out)
 * - All role changes logged in audit_logs table
 * - Tracks who made the change and what was changed
 * 
 * WORKFLOW:
 * 1. Admin views user list with current roles
 * 2. Admin selects user and new role
 * 3. System validates request (not self-change)
 * 4. Role updated in database
 * 5. Event logged for audit trail
 * 6. Confirmation returned to admin
 * 
 * ROUTES MOUNTED AT: /role/*
 * ============================================================================
 */

// ============================================================================
// DEPENDENCIES
// ============================================================================

const express = require('express');
const router = express.Router();
const { authenticateJWT, authorizeRoles } = require('../middleware/authMiddleware');  // Auth middleware
const DBConn = require("../config/db");  // Database connection

// ============================================================================
// GET ALL USERS (Admin Only)
// ============================================================================

/**
 * GET /role/users
 * Get list of all users with their current roles (excludes requesting admin)
 * @access Admin only
 * @returns {Array} List of users with ID, username, email, and role
 */
router.get('/users', authenticateJWT, authorizeRoles("Admin"), async (req, res) => {
  try {
    const adminId = req.user.userId;
    const pool = await DBConn();

    const [users] = await pool.query(`
      SELECT user_id AS id, username AS user, email AS email, user_type AS role
      FROM users
      WHERE user_id != ?
      ORDER BY username;
    `, [adminId]);

    res.json({ success: true, data: users });
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Function to update the user role
router.put('/update', authenticateJWT, authorizeRoles("Admin"), async (req, res) => {
  try {
    const { userId, newRole } = req.body;
    const adminId = req.user.userId;

    if (!userId || !newRole) {
      return res.status(400).json({ success: false, message: 'Missing fields' });
    }

    if (Number(userId) === adminId) {
      return res.status(400).json({
        success: false,
        message: "You cannot change your own role."
      });
    }

    const pool = await DBConn();

    // Fetch target user's current role and username
    const [[target]] = await pool.query(
      `SELECT username AS TargetUsername, user_type AS OldRole
      FROM users
      WHERE user_id = ?`,
      [userId]
    );

    // Fetch admin username
    const [[admin]] = await pool.query(
      `SELECT username FROM users WHERE user_id = ?`,
      [adminId]
    );

    if (!target || !admin) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Update the role
    await pool.query(
      `UPDATE users SET user_type = ? WHERE user_id = ?`,
      [newRole, userId]
    );

    // Log the change in AuditLog (with readable detail)
    const details = JSON.stringify({
      Description: `Admin ${admin.username} changed ${target.TargetUsername}'s role from ${target.OldRole} to ${newRole}.`,
      ChangedBy: admin.username,
      TargetUser: target.TargetUsername,
      OldRole: target.OldRole,
      NewRole: newRole,
    });

    await pool.query(
      `INSERT INTO audit_logs (user_id, action, details, status, is_alarming, created_at)
      VALUES (?, 'ROLE_CHANGED', ?, 'success', 0, NOW())`,
      [adminId, details]
    );

    res.json({ success: true, message: `Role updated: ${target.TargetUsername} → ${newRole}` });
  } catch (err) {
    console.error('Error updating role:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


module.exports = router;
