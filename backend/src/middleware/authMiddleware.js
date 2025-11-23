/**
 * ============================================================================
 * AUTHENTICATION & AUTHORIZATION MIDDLEWARE
 * ============================================================================
 * 
 * PURPOSE:
 * Provides middleware functions for JWT-based authentication and role-based
 * authorization throughout the SmartPlant Sarawak application.
 * 
 * MIDDLEWARE FUNCTIONS:
 * 1. authenticateJWT - Requires valid JWT token (STRICT)
 * 2. optionalAuth - Checks for JWT but continues without it (FLEXIBLE)
 * 3. authorizeRoles - Restricts access to specific user roles (RBAC)
 * 
 * WORKFLOW:
 * - Extract JWT token from Authorization header
 * - Verify token signature and expiration
 * - Decode user information (userId, role)
 * - Attach to req.user for downstream use
 * - Enforce role-based access control
 * 
 * SECURITY:
 * - Tokens signed with SECRET_KEY (see jwt.js)
 * - Tokens expire after 24 hours
 * - Invalid/expired tokens rejected
 * - Role-based access prevents privilege escalation
 * 
 * USAGE EXAMPLES:
 * - authenticateJWT: Protected routes (requires login)
 * - optionalAuth: Public routes with enhanced features for logged-in users
 * - authorizeRoles('Admin'): Admin-only routes
 * 
 * ============================================================================
 */

const { verifyToken } = require('../utils/jwt');

/**
 * MIDDLEWARE 1: authenticateJWT (STRICT AUTHENTICATION)
 * 
 * PURPOSE:
 * Enforces that the user MUST be authenticated to access the route.
 * Rejects requests without valid JWT token.
 * 
 * WORKFLOW:
 * 1. Extract Authorization header from request
 * 2. Validate header format: "Bearer <token>"
 * 3. Verify JWT token signature and expiration
 * 4. Decode payload to get userId and role
 * 5. Attach user info to req.user object
 * 6. Continue to next middleware/route handler
 * 7. If any step fails → return 401 Unauthorized
 * 
 * REQUEST:
 * Headers: { Authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." }
 * 
 * SETS:
 * req.user = { userId: 123, role: "Admin" }
 * 
 * USED BY:
 * - /community-validation/validate (users must be logged in to vote)
 * - /community-validation/stats (personal statistics)
 * - /auth/update-profile (profile updates)
 * 
 * ERRORS:
 * - 401: Missing Authorization header
 * - 401: Invalid header format
 * - 401: Invalid or expired token
 */
function authenticateJWT(req, res, next) {
    // Extract Authorization header (supports both lowercase and uppercase)
    const authHeader = req.headers.authorization || req.headers.Authorization;
    
    // If no authorization header, reject the request
    if (!authHeader) {
        return res.status(401).send('Missing Authorization header');
    }

    // Validate Bearer token format: "Bearer <token>"
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
        return res.status(401).send('Invalid Authorization header format. Expected: Bearer <token>');
    }

    const token = parts[1];
    
    try {
        // Verify token signature and expiration using JWT utility
        const payload = verifyToken(token);
        
        // Attach decoded user information to request object
        // Available downstream: req.user.userId, req.user.role
        req.user = { 
            userId: payload.userId, 
            role: payload.role 
        };
        
        // Continue to next middleware or route handler
        next();
    } catch (err) {
        // Token verification failed (invalid signature or expired)
        return res.status(401).send('Invalid or expired token');
    }
}

/**
 * MIDDLEWARE 2: optionalAuth (FLEXIBLE AUTHENTICATION)
 * 
 * PURPOSE:
 * Allows PUBLIC access but checks for authentication if provided.
 * Used for routes that behave differently based on user role.
 * 
 * KEY DIFFERENCE FROM authenticateJWT:
 * - authenticateJWT: REJECTS if no token
 * - optionalAuth: CONTINUES if no token (sets req.user = null)
 * 
 * WORKFLOW:
 * 1. Check if Authorization header exists
 * 2. If YES → verify token → attach user info → continue
 * 3. If NO → set req.user = null → continue
 * 4. If token invalid → set req.user = null → continue (NO rejection!)
 * 
 * USE CASE: Endangered Species Protection
 * - Public can view map
 * - But endangered species only shown to Admin
 * - Controller checks: if (req.user?.role === 'Admin')
 * 
 * EXAMPLE:
 * Route: GET /map/locations (optionalAuth)
 * - No token → req.user = null → show non-endangered plants
 * - User token → req.user = {role: "Member"} → show non-endangered plants
 * - Admin token → req.user = {role: "Admin"} → show ALL plants
 * 
 * USED BY:
 * - /map/locations (endangered species filtering)
 * - /map/statistics (endangered species in stats)
 * - /map/species (endangered species in list)
 * - /map/heatmap (endangered species in heatmap)
 */
function optionalAuth(req, res, next) {
    // Extract Authorization header (if provided)
    const authHeader = req.headers.authorization || req.headers.Authorization;
    
    // If no authorization header, continue WITHOUT user info
    if (!authHeader) {
        req.user = null;
        return next();
    }

    // Validate Bearer token format
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
        // Invalid format → continue without user (don't reject)
        req.user = null;
        return next();
    }

    const token = parts[1];
    
    try {
        // Attempt to verify token
        const payload = verifyToken(token);
        
        // Success! Attach user information
        req.user = { 
            userId: payload.userId, 
            role: payload.role 
        };
        
        next();
    } catch (err) {
        // Token invalid or expired → continue without user (don't reject)
        req.user = null;
        next();
    }
}

/**
 * MIDDLEWARE 3: authorizeRoles (ROLE-BASED ACCESS CONTROL)
 * 
 * PURPOSE:
 * Restricts route access to specific user roles only.
 * Implements Role-Based Access Control (RBAC).
 * 
 * WORKFLOW:
 * 1. Check if user is authenticated (req.user exists)
 * 2. Check if user's role is in allowed roles list
 * 3. If YES → continue
 * 4. If NO → return 403 Forbidden
 * 
 * USAGE:
 * router.get('/admin-only', authenticateJWT, authorizeRoles('Admin'), handler);
 * 
 * ROLES IN SYSTEM:
 * - Member: Regular users (can identify plants, vote on validations)
 * - Expert: Experienced users (same as Member currently)
 * - Admin: Administrators (full access including endangered species, admin review, IoT monitoring)
 * 
 * EXAMPLES:
 * - authorizeRoles('Admin') → Only admins allowed
 * - authorizeRoles('Admin', 'Expert') → Admins and Experts allowed
 * - authorizeRoles('Admin', 'Expert', 'Member') → All users allowed
 * 
 * USED BY:
 * - /community-validation/disputed (Admin only)
 * - /community-validation/admin-decision (Admin only)
 * - /audit/* (Admin only)
 * - /role/* (Admin only)
 * 
 * ERRORS:
 * - 401: Not authenticated (no req.user)
 * - 403: Forbidden (user role not in allowed list)
 */
function authorizeRoles(...allowedRoles) {
    return (req, res, next) => {
        // Ensure user is authenticated first
        if (!req.user) {
            return res.status(401).send('Not authenticated');
        }
        
        // Check if user's role is in the allowed roles array
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).send(`Forbidden. Required role: ${allowedRoles.join(' or ')}`);
        }
        
        // User has required role - continue
        next();
    };
}

/**
 * ALIAS: authenticateToken
 * 
 * PURPOSE:
 * Provides backward compatibility with older code that uses authenticateToken
 * instead of authenticateJWT.
 */
const authenticateToken = authenticateJWT;

// Export all middleware functions
module.exports = { 
    authenticateJWT,      // Strict authentication (required)
    optionalAuth,         // Flexible authentication (optional)
    authorizeRoles,       // Role-based access control
    authenticateToken     // Alias for authenticateJWT
};

