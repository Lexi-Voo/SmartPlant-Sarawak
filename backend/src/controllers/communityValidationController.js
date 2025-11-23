/**
 * COMMUNITY VALIDATION CONTROLLER
 */

const DBConn = require('../config/db');

/* ================================================================
   GET ALL IDENTIFICATION ITEMS (flagged, admin-verified, rejected, user-verified)
================================================================ */
async function getPendingIdentifications(req, res) {
  try {
    const pool = await DBConn();

    const [rows] = await pool.query(`
      SELECT
        ap.prediction_id AS id,
        pi.plant_image_id AS imageUri,
        pc.species,
        ap.confidence_score AS confidence,
        pi.retrained,

        -- Feedback fields (may be NULL)
        pf.feedback_id,
        pf.feedback AS rejectionReason,
        pf.suggested_species AS suggestedSpecies,
        pf.initial_status AS initialStatus,
        pf.submitted_at AS submittedAt,
        pf.confirmed_status AS confirmedStatus,

        -- Detect whether feedback exists
        CASE WHEN pf.feedback_id IS NULL THEN 0 ELSE 1 END AS feedbackExists,

        -- Classification for FE filtering
        CASE
          WHEN pf.feedback_id IS NULL THEN 'user-verified'
          WHEN pf.confirmed_status IS NULL THEN 'flagged'
          WHEN pf.confirmed_status = 'Verified' THEN 'verified'
          WHEN pf.confirmed_status = 'Rejected' THEN 'rejected'
          ELSE 'unknown'
        END AS reviewState,

        -- Sort by prediction time OR feedback time if exists
        COALESCE(pf.submitted_at, ap.prediction_time) AS createdAt

      FROM ai_predictions ap

      LEFT JOIN plant_images pi 
        ON ap.plant_image_id = pi.plant_image_id

      LEFT JOIN plant_classifications pc 
        ON ap.plant_classification_id = pc.plant_classification_id

      -- Join latest feedback (if exists)
      LEFT JOIN (
        SELECT pf1.*
        FROM prediction_feedback pf1
        INNER JOIN (
          SELECT prediction_id, MAX(feedback_id) AS max_fid
          FROM prediction_feedback
          GROUP BY prediction_id
        ) AS latest
        ON pf1.prediction_id = latest.prediction_id
        AND pf1.feedback_id = latest.max_fid
      ) pf
      ON ap.prediction_id = pf.prediction_id

      ORDER BY createdAt DESC;
    `);

    return res.json({ success: true, data: rows });

  } catch (err) {
    console.error("Get pending identifications error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch pending identifications",
    });
  }
}


// /* ================================================================
//    COMMUNITY VALIDATION (Confirm / Reject)
// ================================================================ */
async function submitValidationVote(req, res) {
//   try {
//     const { predictionId, identificationId, vote, rejectionReason, suggestedSpecies } = req.body;
//     const userId = req.user.userId;

//     const targetId = predictionId || identificationId;

//     if (!targetId || !vote) {
//       return res.status(400).json({ 
//         success: false, 
//         error: 'Prediction ID (predictionId / identificationId) and vote are required.' 
//       });
//     }

//     if (!['confirm', 'reject'].includes(vote)) {
//       return res.status(400).json({ success: false, error: 'Invalid vote type' });
//     }

//     const pool = await DBConn();

//     // Check prediction exists
//     const [exists] = await pool.query(
//       'SELECT prediction_id, user_id FROM ai_predictions WHERE prediction_id=?',
//       [targetId]
//     );

//     if (exists.length === 0) {
//       return res.status(404).json({ success: false, error: 'Prediction not found.' });
//     }

//     // Prevent users from validating their own predictions
//     if (exists[0].user_id === userId)
//       return res.status(403).json({ success: false, error: 'Cannot vote on your own prediction.' });

//     // Build comment string
//     let comment = null;
//     if (vote === 'reject') {
//       if (rejectionReason && suggestedSpecies)
//         comment = `Reason: ${rejectionReason}. Suggested: ${suggestedSpecies}`;
//       else if (rejectionReason)
//         comment = `Reason: ${rejectionReason}`;
//       else if (suggestedSpecies)
//         comment = `Suggested species: ${suggestedSpecies}`;
//     }

//     // Check for existing vote
//     const [existing] = await pool.query(
//       'SELECT feedback_id FROM prediction_feedback WHERE prediction_id=? AND user_id=?',
//       [targetId, userId]
//     );

//     const initialStatus = vote === 'confirm' ? 'Verified' : 'Flagged';

//     if (existing.length > 0) {
//       // Update existing feedback
//       await pool.query(
//         `UPDATE prediction_feedback
//          SET feedback=?, suggested_species=?, initial_status=?, submitted_at=NOW()
//          WHERE feedback_id=?`,
//         [comment, suggestedSpecies || null, initialStatus, existing[0].feedback_id]
//       );
//     } else {
//       // Insert new feedback
//       await pool.query(
//         `INSERT INTO prediction_feedback 
//         (prediction_id, user_id, feedback, suggested_species, initial_status, submitted_at)
//         VALUES (?, ?, ?, ?, ?, NOW())`,
//         [targetId, userId, comment, suggestedSpecies || null, initialStatus]
//       );
//     }

//     return res.json({ success: true, message: 'Validation submitted.' });

//   } catch (err) {
//     console.error('Validation error:', err);
//     return res.status(500).json({ success: false, error: 'Failed to submit validation.' });
//   }
 }

 // ================================================================
// COMMUNITY MEMBER VERIFICATION ("YES, Correct")
// ================================================================
async function submitMemberVerification(req, res) {
  try {
    const { predictionId } = req.body;
    const userId = req.user.userId;

    if (!predictionId) {
      return res.status(400).json({
        success: false,
        error: "predictionId is required.",
      });
    }

    const pool = await DBConn();

    // Make sure the prediction exists
    const [predictions] = await pool.query(
      `SELECT prediction_id FROM ai_predictions WHERE prediction_id = ?`,
      [predictionId]
    );

    if (predictions.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Prediction not found.",
      });
    }

    // Check if this user already verified this prediction
    const [existing] = await pool.query(
      `SELECT feedback_id
         FROM prediction_feedback
        WHERE prediction_id = ? AND user_id = ?
        ORDER BY feedback_id DESC
        LIMIT 1`,
      [predictionId, userId]
    );

    const genericFeedback = "Member verified this identification as correct.";

    if (existing.length > 0) {
      // Update latest feedback to reflect verified status
      await pool.query(
        `UPDATE prediction_feedback
           SET feedback = ?,
               suggested_species = NULL,
               initial_status = 'Verified',
               confirmed_status = 'Verified',
               reviewed_by = ?,
               submitted_at = NOW(),
               reviewed_at = NOW()
         WHERE feedback_id = ?`,
        [genericFeedback, userId, existing[0].feedback_id]
      );
    } else {
      // New verification
      await pool.query(
        `INSERT INTO prediction_feedback
          (prediction_id, user_id, feedback, suggested_species,
           initial_status, submitted_at,
           confirmed_status, reviewed_by, reviewed_at)
         VALUES (?, ?, ?, NULL, 'Verified', NOW(), 'Verified', ?, NOW())`,
        [predictionId, userId, genericFeedback, userId]
      );
    }

    // Trigger (on confirmed_status='Verified') will now auto-create/update plant_markers
    return res.json({
      success: true,
      message: "Prediction verified successfully.",
    });
  } catch (err) {
    console.error("Member verification error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to verify prediction.",
    });
  }
}

/* ================================================================
   SAVE FEEDBACK (simple text save)
================================================================ */
async function saveFeedbackForm(req, res) {
  try {
    const { predictionId, feedback, suggestedSpecies } = req.body;
    const userId = req.user.userId;

    const pool = await DBConn();

    const [result] = await pool.query(
      `INSERT INTO prediction_feedback 
       (prediction_id, user_id, feedback, suggested_species, submitted_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [predictionId, userId, feedback, suggestedSpecies || null]
    );

    return res.json({
      success: true,
      message: 'Feedback saved.',
      feedbackId: result.insertId
    });

  } catch (err) {
    console.error('Feedback save error:', err);
    return res.status(500).json({ success: false, error: 'Failed to save feedback.' });
  }
}



/* ================================================================
   SUBMIT FEEDBACK FROM IDENTIFICATION FLOW (Incorrect identification modal)
================================================================ */
async function submitPredictionFeedback(req, res) {
  try {
    const { predictionId, feedback, suggestedSpecies } = req.body;
    const userId = req.user.userId;

    if (!predictionId)
      return res.status(400).json({ success: false, error: 'Missing predictionId' });

    const pool = await DBConn();

    await pool.query(
      `INSERT INTO prediction_feedback
      (prediction_id, user_id, feedback, suggested_species, initial_status, submitted_at)
      VALUES (?, ?, ?, ?, 'Flagged', NOW())`,
      [predictionId, userId, feedback, suggestedSpecies || null]
    );

    return res.json({ success: true, message: 'Feedback submitted.' });

  } catch (err) {
    console.error('Submit prediction feedback error:', err);
    return res.status(500).json({ success: false, error: 'Failed to submit feedback.' });
  }
}

async function adminOverrideValidation(req, res) {
  try {
    const { predictionId, vote, rejectionReason } = req.body;
    const adminId = req.user.userId;

    if (!predictionId || !vote) {
      return res.status(400).json({
        success: false,
        error: "Prediction ID and vote are required."
      });
    }

    const pool = await DBConn();

    // Check prediction exists
    const [prediction] = await pool.query(
      "SELECT prediction_id, user_id FROM ai_predictions WHERE prediction_id = ?",
      [predictionId]
    );

    if (prediction.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Prediction not found."
      });
    }

    const originalUserId = prediction[0].user_id;

    // Get latest feedback (if any)
    const [existing] = await pool.query(
      `SELECT * FROM prediction_feedback
       WHERE prediction_id = ?
       ORDER BY feedback_id DESC
       LIMIT 1`,
      [predictionId]
    );

    const finalStatus = vote === "confirm" ? "Verified" : "Rejected";

    // ======================================================================
    // CASE 1: FLAGGED → existing feedback record
    // ======================================================================
    if (existing.length > 0) {
      await pool.query(
        `UPDATE prediction_feedback
         SET
            initial_status = 'Verified',
            confirmed_status = ?,
            reviewed_by = ?,
            reviewed_at = NOW()
         WHERE feedback_id = ?`,
        [
          finalStatus,   // confirmed_status
          adminId,       // reviewed_by
          existing[0].feedback_id // WHERE
        ]
      );

      return res.json({
        success: true,
        message: "Admin decision applied (FLAGGED record).",
        finalStatus
      });
    }

    // ======================================================================
    // CASE 2: USER-VERIFIED → NO feedback exists
    // Admin must create a new feedback entry
    // ======================================================================

    const adminFeedback =
      finalStatus === "Rejected"
        ? (rejectionReason || "ADMIN MARKED AS WRONG")
        : null;

    await pool.query(
      `INSERT INTO prediction_feedback 
        (prediction_id, user_id, feedback, suggested_species, 
         initial_status, submitted_at,
         confirmed_status, reviewed_by, reviewed_at)
       VALUES (?, ?, ?, NULL, ?, NOW(), ?, ?, NOW())`,
      [
        predictionId,      // prediction_id
        originalUserId,    // user_id (owner of prediction)
        adminFeedback,     // feedback (only when rejected)
        "Verified",        // initial_status (user verified)
        finalStatus,       // confirmed_status
        adminId            // reviewed_by
      ]
    );

    return res.json({
      success: true,
      message: "Admin decision applied (USER-VERIFIED record).",
      finalStatus
    });

  } catch (error) {
    console.error("Admin override error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to apply admin override."
    });
  }
}

/* ================================================================
   EXPORT CONTROLLER
================================================================ */
module.exports = {
  getPendingIdentifications,
  submitMemberVerification,
  submitValidationVote,
  saveFeedbackForm,
  submitPredictionFeedback,
  adminOverrideValidation
};
