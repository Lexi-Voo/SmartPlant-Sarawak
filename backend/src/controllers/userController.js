/**
 * ============================================================================
 * USER CONTROLLER
 * ============================================================================
 * 
 * PURPOSE:
 * Handles user profile data, statistics, and plant identification history.
 * Provides endpoints for retrieving user-specific information.
 * 
 * FEATURES:
 * - Get user's plant identification history with validation data
 * - Get user statistics and community scores
 * - Profile data aggregation
 * 
 * ROUTES:
 * - GET /plant/identifications/user/:userId - Get identification history
 * - GET /user/:userId/stats - Get user statistics
 * ============================================================================
 */

// ============================================================================
// DEPENDENCIES
// ============================================================================

const DBConn = require('../config/db');  // Database connection pool

// ============================================================================
// GET USER IDENTIFICATIONS
// ============================================================================

/**
 * Get user's plant identification history with community validation data
 * @route GET /plant/identifications/user/:userId
 * @param {number} req.params.userId - User ID
 * @returns {Array} List of plant identifications with validation stats
 */
async function getUserIdentifications(req, res) {
  try {
    // Extract userId from URL parameters
    const { userId } = req.params;

    // ====================================================================
    // STEP 1: Validate Input
    // ====================================================================

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Missing userId parameter'
      });
    }

    // ====================================================================
    // STEP 2: Query Plant Identifications with Validation Stats
    // ====================================================================

    const pool = await DBConn();
    
    // Complex query joining identifications with community validations
    // Get user's identifications from ai_predictions and plant_images tables
    const query = `
      SELECT 
        ap.prediction_id,
        pc.species,
        ap.confidence_score as confidence,
        pi.image_path as image_url,
        ap.prediction_time as identified_at,
        COUNT(pf.feedback_id) as validation_count,
        SUM(CASE WHEN pf.initial_status = 'Verified' THEN 1 ELSE 0 END) as confirm_count,
        SUM(CASE WHEN pf.initial_status = 'Flagged' THEN 1 ELSE 0 END) as reject_count
      FROM ai_predictions ap
      LEFT JOIN plant_images pi ON ap.plant_image_id = pi.plant_image_id
      LEFT JOIN plant_classifications pc ON ap.plant_classification_id = pc.plant_classification_id
      LEFT JOIN prediction_feedback pf ON ap.prediction_id = pf.prediction_id
      WHERE ap.user_id = ?
      GROUP BY ap.prediction_id
      ORDER BY ap.prediction_time DESC
      LIMIT 100
    `;

    // Execute query with userId parameter (prevents SQL injection)
    const [identifications] = await pool.execute(query, [userId]);

    // ====================================================================
    // STEP 3: Return Results
    // ====================================================================

    res.json({
      success: true,
      data: identifications  // Array of identification objects
    });

  } catch (error) {
    // ====================================================================
    // ERROR HANDLING
    // ====================================================================

    console.error('Error fetching user identifications:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch identification history'
    });
  }
}

// ============================================================================
// GET USER STATISTICS
// ============================================================================

/**
 * Get comprehensive user statistics for profile page
 * Includes identification stats, validation stats, and community ranking
 * @route GET /user/:userId/stats
 * @param {number} req.params.userId - User ID
 * @returns {Object} User statistics and rankings
 */
async function getUserStats(req, res) {
  try {
    // Extract userId from URL parameters
    const { userId } = req.params;
    const pool = await DBConn();

    // ====================================================================
    // STEP 1: Verify User Exists
    // ====================================================================

    // Get basic user information
    const [users] = await pool.query(
      'SELECT user_id, username, email, user_type, profile_image, created_at FROM users WHERE user_id = ?',
      [userId]
    );

    // Return error if user not found
    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const user = users[0];

    // ====================================================================
    // STEP 2: Get Plant Identification Statistics
    // ====================================================================

    // Count total identifications and verified identifications by user
    const [idStats] = await pool.query(
      `SELECT 
        COUNT(*) as total_identifications,
        COUNT(*) as verified_identifications
       FROM ai_predictions ap
       WHERE ap.user_id = ?`,
      [userId]
    );

    // ====================================================================
    // STEP 3: Get Community Validation Statistics
    // ====================================================================

    // Count how many validations this user has performed (helping others)
    const [valStats] = await pool.query(
      'SELECT COUNT(*) as total_validations FROM prediction_feedback WHERE user_id = ?',
      [userId]
    );

    // ====================================================================
    // STEP 4: Return Aggregated Statistics
    // ====================================================================

    res.json({
      success: true,
      data: {
        // Plant identification statistics
        totalIdentifications: parseInt(idStats[0].total_identifications) || 0,
        verifiedIdentifications: parseInt(idStats[0].verified_identifications) || 0,
        
        // Community validation statistics
        totalValidations: parseInt(valStats[0].total_validations) || 0,
      }
    });

  } catch (error) {
    // ====================================================================
    // ERROR HANDLING
    // ====================================================================

    console.error('Get user stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user statistics'
    });
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  getUserIdentifications,  // Get user's identification history
  getUserStats             // Get user profile statistics
};