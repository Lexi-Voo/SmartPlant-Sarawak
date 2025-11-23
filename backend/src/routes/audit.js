/**
 * ============================================================================
 * AUDIT ROUTES (Admin Only)
 * ============================================================================
 * 
 * PURPOSE:
 * Provides admin-only endpoints for security monitoring and audit logging.
 * Tracks all user activities, failed logins, role changes, and suspicious events.
 * 
 * MAIN ENDPOINTS:
 * - GET /audit/logs - Get filtered audit logs
 * - GET /audit/metrics - Get dashboard metrics (logins, active users, suspicious)
 * - GET /audit/activities - Get recent activity feed
 * - GET /audit/alerts - Get security alerts and suspicious activities
 * 
 * FEATURES:
 * - Comprehensive activity logging
 * - Security event tracking
 * - Real-time metrics
 * - Suspicious activity detection
 * - Failed login monitoring
 * 
 * ACCESS CONTROL:
 * All routes require Admin role (authenticateJWT + authorizeRoles("Admin"))
 * 
 * DATABASE TABLES:
 * - audit_logs: All security events and user activities
 * - users: User information for context
 * 
 * ROUTES MOUNTED AT: /audit/*
 * ============================================================================
 */

// ============================================================================
// DEPENDENCIES
// ============================================================================

const express = require("express");
const router = express.Router();
const { authenticateJWT, authorizeRoles } = require("../middleware/authMiddleware");  // Auth middleware
const { getLogs } = require("../controllers/auditController");  // Audit log retrieval
const { getAccountMetrics, getActivityFeed, getAlertFeed } = require("../controllers/accountsDashboardController");  // Dashboard metrics

// ============================================================================
// AUDIT LOG ROUTES (All Admin Only)
// ============================================================================

/**
 * GET /audit/logs
 * Retrieve audit logs with optional filtering (type, date range)
 */
router.get("/logs", authenticateJWT, authorizeRoles("Admin"), getLogs);

// Dashboard summary metrics
router.get("/metrics", authenticateJWT, authorizeRoles("Admin"), getAccountMetrics);

// // Activity feed
router.get("/activities", authenticateJWT, authorizeRoles("Admin"), getActivityFeed);

// // Alert feed
router.get("/alerts", authenticateJWT, authorizeRoles("Admin"), getAlertFeed);

module.exports = router;
