/**
 * ============================================================================
 * USER ROUTES
 * ============================================================================
 * 
 * PURPOSE:
 * Handles user profile management, statistics, and profile image uploads.
 * Provides endpoints for viewing and updating user information.
 * 
 * MAIN ENDPOINTS:
 * 1. GET /user/:userId/stats - Get user statistics and activity
 * 2. GET /user/:userId/profile - Get user profile information
 * 3. PUT /user/:userId/profile - Update user profile (authenticated)
 * 4. POST /user/upload-profile-image - Upload profile picture (authenticated)
 * 
 * FEATURES:
 * - User statistics (identifications, validations, community score)
 * - Profile image upload with automatic resize
 * - Profile updates with ownership verification
 * - Recent activity tracking
 * - Validation leaderboard integration
 * 
 * FILE UPLOADS:
 * - Supports: JPEG, JPG, PNG, GIF
 * - Max size: 5MB
 * - Storage: Memory (multer.memoryStorage) - no file system folder needed
 * - Images saved as BLOB in database only (not stored as files)
 * 
 * ROUTES MOUNTED AT: /user/*
 * ============================================================================
 */

// ============================================================================
// DEPENDENCIES
// ============================================================================

const express = require('express');
const router = express.Router();
const multer = require('multer');  // File upload handling
const path = require('path');  // Path manipulation
const fs = require('fs');  // File system operations
const { authenticateJWT } = require('../middleware/authMiddleware');  // JWT authentication
const DBConn = require('../config/db');  // Database connection

// ============================================================================
// MULTER CONFIGURATION FOR PROFILE IMAGE UPLOADS
// ============================================================================
// NOTE: Using memoryStorage instead of diskStorage to avoid creating uploads/profiles folder
// Profile images are stored as BLOB in database, so no file system storage needed

const storage = multer.memoryStorage();  // Store files in memory instead of disk

const upload = multer({
  storage: storage,  // Memory storage - no folder needed!
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed (jpeg, jpg, png, gif)'));
    }
  }
});

/**
 * =====================================================================
 * USER HISTORY ROUTE
 * Combines user's identifications + validation feedback
 * =====================================================================
 */
/**
 * =====================================================================
 * USER HISTORY ROUTE (FULLY FIXED)
 * Combines user's AI identifications + validation feedback
 * =====================================================================
 */

router.get('/:userId/history', async (req, res) => {
  try {
    const { userId } = req.params;
    const pool = await DBConn();

    // =====================================================================
    // 1. Fetch user identifications with correct latest feedback join
    // =====================================================================
    const [rows] = await pool.query(
      `
      SELECT 
          ap.prediction_id,
          ap.user_id,
          ap.confidence_score,
          ap.prediction_time AS createdAt,

          pi.plant_image_id,
          CONCAT('/image/', pi.plant_image_id) AS imageUri,

          pc.species,

          -- Latest feedback (if any)
          pf.feedback_id,
          pf.initial_status,
          pf.confirmed_status,
          pf.feedback AS feedback_text,
          pf.suggested_species,
          pf.submitted_at,
          pf.reviewed_by,
          pf.reviewed_at

      FROM ai_predictions ap

      LEFT JOIN plant_images pi 
        ON ap.plant_image_id = pi.plant_image_id

      LEFT JOIN plant_classifications pc
        ON ap.plant_classification_id = pc.plant_classification_id

      -- Get LATEST feedback per prediction
      LEFT JOIN (
          SELECT pf1.*
          FROM prediction_feedback pf1
          INNER JOIN (
              SELECT prediction_id, MAX(feedback_id) AS maxFid
              FROM prediction_feedback
              GROUP BY prediction_id
          ) AS latest
              ON pf1.prediction_id = latest.prediction_id
             AND pf1.feedback_id = latest.maxFid
      ) pf 
         ON pf.prediction_id = ap.prediction_id

      WHERE ap.user_id = ?
      ORDER BY ap.prediction_time DESC;
      `,
      [userId]
    );

    // =====================================================================
    // 2. Convert raw rows into uniform results
    // =====================================================================

    const history = rows.map((r) => {
      let status = "pending"; // default

      /** STATUS LOGIC **/
      if (!r.feedback_id) {
        // Case: user did not flag → self-verified
        status = "validated";
      } 
      else if (r.initial_status === "Flagged" && r.confirmed_status === null) {
        // User flagged → waiting for admin
        status = "pending";
      } 
      else if (r.confirmed_status === "Verified") {
        status = "validated";
      } 
      else if (r.confirmed_status === "Rejected") {
        status = "rejected";
      }

      return {
        id: `pred-${r.prediction_id}`,
        type: "identification",

        imageUri: r.imageUri,
        species: r.species || "Unknown",
        confidence: r.confidence_score || null,
        createdAt: r.createdAt,

        // For "validations" list (not used now but good for consistency)
        comment: r.feedback_text || null,
        suggestion: r.suggested_species || null,
        vote: r.confirmed_status === "Rejected" ? "reject"
             : r.confirmed_status === "Verified" ? "confirm"
             : null,

        status
      };
    });

    return res.json({ success: true, data: history });

  } catch (err) {
    console.error("History route error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to load history"
    });
  }
});

// ============================================================================
// ROUTES
// ============================================================================

/**
 * @route   GET /user/:userId/stats
 * @desc    Get user statistics
 * @access  Public
 */
router.get('/:userId/stats', async (req, res) => {
  try {
    const { userId } = req.params;
    const pool = await DBConn();

    // Get user basic info
    const [users] = await pool.query(
      'SELECT user_id, username, email, user_type, profile_image, created_at FROM users WHERE user_id = ?',
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const user = users[0];

    // Get identification count (from ai_predictions table)
    const [identifications] = await pool.query(
      'SELECT COUNT(*) as count FROM ai_predictions WHERE user_id = ?',
      [userId]
    );

    // Get validation count and stats (from prediction_feedback table)
    const [validations] = await pool.query(
      'SELECT COUNT(*) as count FROM prediction_feedback WHERE user_id = ?',
      [userId]
    );

    // Get validation stats (calculated from prediction_feedback)
    // Note: user_validation_stats table doesn't exist in current schema
    const validationStats = [
      {
        total_validations: validations[0].count,
        accurate_validations: 0,
        community_score: validations[0].count * 10, // 10 points per validation
        rank_position: null
      }
    ];

    // Get recent activity (from ai_predictions table)
    const [recentActivity] = await pool.query(
      `SELECT 'identification' as type, ap.prediction_time as created_at, pc.species 
       FROM ai_predictions ap
       LEFT JOIN plant_classifications pc ON ap.plant_classification_id = pc.plant_classification_id
       WHERE ap.user_id = ? 
       UNION ALL
       SELECT 'validation' as type, pf.submitted_at as created_at, NULL as species
       FROM prediction_feedback pf
       WHERE pf.user_id = ?
       ORDER BY created_at DESC
       LIMIT 10`,
      [userId, userId]
    );

    return res.json({
      success: true,
      data: {
        user: {
          id: user.user_id,
          username: user.username,
          email: user.email,
          userType: user.user_type,
          profileImage: user.profile_image,
          memberSince: user.created_at
        },
        stats: {
          totalIdentifications: parseInt(identifications[0].count) || 0,
          totalValidations: parseInt(validations[0].count) || 0,
          communityScore: validationStats.length > 0 ? parseInt(validationStats[0].community_score) : 0,
          accurateValidations: validationStats.length > 0 ? parseInt(validationStats[0].accurate_validations) : 0,
          rankPosition: validationStats.length > 0 ? parseInt(validationStats[0].rank_position) : null
        },
        recentActivity: recentActivity
      }
    });
  } catch (error) {
    console.error('Get user stats error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch user statistics'
    });
  }
});

/**
 * @route   POST /user/upload-profile-image
 * @desc    Upload user profile image
 * @access  Private
 */
router.post('/upload-profile-image', authenticateJWT, upload.single('profileImage'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No image file provided'
      });
    }

    const userId = req.user.userId;
    
    // Get file buffer directly from memory (no file system access needed!)
    const buffer = req.file.buffer;  // Already in memory with memoryStorage
    const imageSize = buffer.length;
    const mimeType = req.file.mimetype;
    
    console.log('Profile image BLOB from memory, size:', imageSize, 'bytes');

    const pool = await DBConn();

    // Update user profile image as BLOB (DATABASE ONLY!)
    await pool.query(
      'UPDATE users SET profile_image_data = ?, profile_image_size = ?, profile_mime_type = ? WHERE user_id = ?',
      [buffer, imageSize, mimeType, userId]
    );

    const imageUrl = `/user/profile-image/${userId}`;
    console.log('Profile image BLOB saved to database - stored in memory, no file system used!');

    return res.json({
      success: true,
      data: {
        imageUrl: imageUrl,
        message: 'Profile image uploaded successfully (database only)'
      }
    });
  } catch (error) {
    console.error('Upload profile image error:', error);
    
    // No need to delete files - memoryStorage doesn't create files!
    
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to upload profile image'
    });
  }
});

/**
 * @route   GET /user/:userId/profile
 * @desc    Get user profile
 * @access  Public
 */
router.get('/:userId/profile', async (req, res) => {
  try {
    const { userId } = req.params;
    const pool = await DBConn();

    const [users] = await pool.query(
      `SELECT 
        user_id,
        username,
        email,
        first_name,
        last_name,
        user_type,
        profile_image,
        created_at,
        last_login
       FROM users 
       WHERE user_id = ?`,
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const user = users[0];

    return res.json({
      success: true,
      data: {
        userId: user.user_id,
        username: user.username,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        userType: user.user_type,
        profileImage: user.profile_image,
        memberSince: user.created_at,
        lastLogin: user.last_login
      }
    });
  } catch (error) {
    console.error('Get user profile error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch user profile'
    });
  }
});

/**
 * @route   PUT /user/:userId/profile
 * @desc    Update user profile
 * @access  Private (own profile or admin)
 */
router.put('/:userId/profile', authenticateJWT, async (req, res) => {
  try {
    const { userId } = req.params;
    const requestingUserId = req.user.userId;
    const requestingUserRole = req.user.role;

    // Check if user is updating their own profile or is admin
    if (parseInt(userId) !== requestingUserId && requestingUserRole !== 'Admin') {
      return res.status(403).json({
        success: false,
        error: 'You can only update your own profile'
      });
    }

    const { firstName, lastName, email } = req.body;
    const pool = await DBConn();

    const updates = [];
    const params = [];

    if (firstName) {
      updates.push('first_name = ?');
      params.push(firstName);
    }
    if (lastName) {
      updates.push('last_name = ?');
      params.push(lastName);
    }
    if (email) {
      updates.push('email = ?');
      params.push(email);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }

    params.push(userId);

    await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE user_id = ?`,
      params
    );

    return res.json({
      success: true,
      message: 'Profile updated successfully'
    });
  } catch (error) {
    console.error('Update user profile error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update profile'
    });
  }
});

// ============================================================================
// SERVE PROFILE IMAGE FROM DATABASE BLOB
// ============================================================================

router.get('/profile-image/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const pool = await DBConn();
    
    // Query database for BLOB data
    const [rows] = await pool.query(
      'SELECT profile_image_data, profile_mime_type, profile_image_size FROM users WHERE user_id = ?',
      [userId]
    );
    
    // Check if user exists and has profile image
    if (rows.length === 0 || !rows[0].profile_image_data) {
      console.log(`Profile image not found for user: ${userId}`);
      return res.status(404).send('Profile image not found');
    }
    
    const image = rows[0];
    
    console.log(`Serving profile BLOB for user ${userId}: ${image.profile_image_size} bytes`);
    
    // Set proper headers for image
    res.set({
      'Content-Type': image.profile_mime_type || 'image/jpeg',
      'Content-Length': image.profile_image_size,
      'Cache-Control': 'public, max-age=31536000'
    });
    
    // Send binary image data
    res.send(image.profile_image_data);
    
  } catch (error) {
    console.error('Error serving profile image:', error);
    res.status(500).send('Failed to load profile image');
  }
});


module.exports = router;