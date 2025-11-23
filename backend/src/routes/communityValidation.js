/**
 * COMMUNITY VALIDATION ROUTES
 */

const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../middleware/authMiddleware');

const {
  getPendingIdentifications,
  submitMemberVerification,
  submitValidationVote,
  saveFeedbackForm,
  submitPredictionFeedback,
  adminOverrideValidation
} = require('../controllers/communityValidationController');

// Get predictions needing validation
router.get('/pending', getPendingIdentifications);

router.post("/member-verify", authenticateJWT, submitMemberVerification);

// Community voting (confirm/reject)
router.post('/validate', authenticateJWT, submitValidationVote);

// Save feedback form only (text + suggested species)
router.post('/save-feedback', authenticateJWT, saveFeedbackForm);

// Submit full prediction feedback (for incorrect identification flow)
router.post('/submit', authenticateJWT, submitPredictionFeedback);

//Admin Override Route
router.post('/admin-override', authenticateJWT, adminOverrideValidation);

module.exports = router;
