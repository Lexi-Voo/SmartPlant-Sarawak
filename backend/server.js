/**
 * ============================================================================
 * SMARTPLANT SARAWAK - BACKEND SERVER
 * ============================================================================
 * 
 * PURPOSE:
 * Main Express.js server for SmartPlant Sarawak mobile application backend.
 * Handles authentication, plant identification, community validation, and more.
 * 
 * MAIN FEATURES:
 * 1. User authentication and authorization (JWT-based)
 * 2. Plant identification and community validation
 * 3. Map-based plant discovery
 * 4. User profile management
 * 5. Audit logging for security
 * 6. Static file serving for plant images
 * 
 * TECHNOLOGY STACK:
 * - Express.js: Web framework
 * - MySQL: Database
 * - JWT: Authentication tokens
 * - bcrypt: Password hashing
 * - Multer: File uploads
 * 
 * PORT: 8080 (configurable via .env)
 * 
 * USAGE:
 * npm start  OR  node server.js
 * ============================================================================
 */

// ============================================================================
// DEPENDENCIES
// ============================================================================

const express = require("express");  // Web framework for Node.js
const cors = require("cors");  // Cross-Origin Resource Sharing for mobile app
const path = require("path");  // File path utilities
require("dotenv").config();  // Load environment variables from .env file

// ============================================================================
// EXPRESS APP INITIALIZATION
// ============================================================================

const app = express();  // Create Express application instance

// Increase payload limit for base64 image uploads (plant identification)
// Default is 100kb, but plant images can be several MB when base64 encoded
app.use(express.json({ limit: '50mb' }));  // Parse JSON bodies up to 50MB
app.use(express.urlencoded({ limit: '50mb', extended: true }));  // Parse URL-encoded bodies

// ============================================================================
// CORS CONFIGURATION
// ============================================================================

// Enable CORS for frontend (Expo / React Native mobile app)
// IMPORTANT: This must be before route handlers!
app.use(
  cors({
    origin: "*",  // Allow requests from any origin (development/production)
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],  // Allowed HTTP methods
    allowedHeaders: ["Content-Type", "Authorization"],  // Allowed request headers
  })
);

// ============================================================================
// STATIC FILE SERVING
// ============================================================================

// NOTE: Static file serving for /uploads removed - all images now use BLOB storage

// Serve AI training dataset images for community validation feature
const fs = require('fs');  // File system module for checking paths

// Use relative path to AI dataset (works on any computer, not hardcoded!)
// Path: backend/../ai/retraining/test/dataset_split/train/
const aiDatasetPath = path.join(__dirname, '..', 'ai', 'retraining', 'test', 'dataset_split', 'train');
console.log(' Attempting to serve AI Dataset images from:', aiDatasetPath);

// Check if AI dataset path exists before serving
if (fs.existsSync(aiDatasetPath)) {
  // Serve AI training images at /ai-images/ endpoint
  app.use('/ai-images', express.static(aiDatasetPath));
  console.log('   AI Dataset images are NOW being served from /ai-images/');
  console.log('   Test URL: http://localhost:8080/ai-images/Rafflesia/Rafflesia_0.jpg');
  
  // List available species folders for debugging
  try {
    // Read directory and filter for folders only (exclude files)
    const speciesFolders = fs.readdirSync(aiDatasetPath).filter((file) => {
      const fullPath = path.join(aiDatasetPath, file);
      return fs.statSync(fullPath).isDirectory();  // Check if it's a directory
    });
    console.log('   Available species folders:', speciesFolders.join(', '));
    console.log('   Total species folders:', speciesFolders.length);
  } catch (err) {
    console.error('   Error reading species folders:', err.message);
  }
} else {
  // Path doesn't exist - show error message
  console.error('   AI Dataset path does not exist:', aiDatasetPath);
  console.error('   Current directory:', __dirname);
  console.error('   Please check the folder structure');
}

// ============================================================================
// MIDDLEWARE AND ROUTES IMPORT
// ============================================================================

// Import authentication middleware (JWT verification and role authorization)
const { authenticateJWT, authorizeRoles } = require("./src/middleware/authMiddleware");

// Import route handlers for different features
const authRoutes = require("./src/routes/auth");  // Sign in, sign up, password reset
const otpRoutes = require("./src/routes/otp");  // OTP generation and verification
const auditRoutes = require("./src/routes/audit");  // Security audit logs
const RoleRoutes = require('./src/routes/roleChange');  // Admin role management
const plantRoutes = require("./src/routes/plant");  // Plant identification, history, and image uploads
const communityValidationRoutes = require("./src/routes/communityValidation");  // Community validation system
const heatmapRoutes = require("./src/routes/heatmap");  // Map-based plant discovery
const userRoutes = require("./src/routes/user");  // User profile management

// ============================================================================
// ROUTE MOUNTING
// ============================================================================

// Mount routes at their respective base paths
app.use("/auth", authRoutes);  // Authentication: /auth/signin, /auth/signup, etc.
app.use("/otp", otpRoutes);  // OTP: /otp/generate, /otp/verify
app.use("/audit", auditRoutes);  // Audit logs: /audit/logs
app.use('/role', RoleRoutes);  // Role management: /role/change
app.use("/plant", plantRoutes);  // Plant features: /plant/identify, /plant/upload, /plant/history
app.use("/community-validation", communityValidationRoutes);  // Community validation: /community-validation/image
app.use("/heatmap", heatmapRoutes);  // Map: /heatmap/plants
app.use("/user", userRoutes);  // User: /user/profile, /user/update

//Mount image route
app.use("/image", require("./src/routes/image"));

// ============================================================================
// TEST ROUTES (Development & Debugging)
// ============================================================================

// Protected route - requires valid JWT token (any authenticated user)
app.get("/protected/user", authenticateJWT, (req, res) => {
  res.json({ message: "Protected user route", user: req.user });
});

// Admin-only protected route - requires JWT token AND Admin role
app.get("/protected/admin", authenticateJWT, authorizeRoles("Admin"), (req, res) => {
  res.json({ message: "Admin-only route", user: req.user });
});

// ============================================================================
// GENERAL ROUTES
// ============================================================================

// Root route - simple health check
app.get("/", (req, res) => res.send("Server running successfully"));

// Health check route for frontend monitoring (used by mobile app)
app.get("/health", (req, res) => {
  res.json({ success: true, status: "ok" });
});

// ============================================================================
// DEBUG ROUTES
// ============================================================================

// Test route to verify AI images path configuration
// Useful for troubleshooting image serving issues
app.get("/test-ai-images", (req, res) => {
  const fs = require('fs');
  const testPath = aiDatasetPath;  // Reuse the AI dataset path from above

  // Check if the path exists
  const pathExists = fs.existsSync(testPath);
  
  // Check if a sample image exists (Rafflesia_0.jpg)
  const rafflesiaPath = path.join(testPath, 'Rafflesia', 'Rafflesia_0.jpg');
  const imageExists = fs.existsSync(rafflesiaPath);
  
  // List all species folders
  let folders = [];
  if (pathExists) {
    folders = fs.readdirSync(testPath).filter(file => 
      fs.statSync(path.join(testPath, file)).isDirectory()
    );
  }
  
  // Return diagnostic information as JSON
  res.json({
    pathExists,  // Does the AI dataset path exist?
    imageExists,  // Does the sample Rafflesia image exist?
    testPath,  // Full path to AI dataset
    imagePath: rafflesiaPath,  // Full path to sample image
    folders: folders,  // List of species folders
    folderCount: folders.length  // Number of species
  });
});

// ============================================================================
// DATABASE INITIALIZATION
// ============================================================================

// Initialize database connection on server startup
const DBConn = require("./src/config/db");  // Import database connection function

// Immediately Invoked Function Expression (IIFE) to initialize database
(async () => {
  try {
    await DBConn();  // Connect to MySQL database
  } catch (error) {
    console.error("Failed to connect to database on startup:", error.message);
    // Server continues running even if DB connection fails (can retry later)
  }
})();

// ============================================================================
// SERVER STARTUP
// ============================================================================

// Get port from environment variable or default to 8080
const PORT = process.env.PORT || 8080;

// Listen on all network interfaces (0.0.0.0)
// This allows mobile devices on the same network to connect
// Using 'localhost' or '127.0.0.1' would only allow local connections
const HOST = '0.0.0.0';

// Start the Express server
app.listen(PORT, HOST, () => {
  console.log(` Server running on port ${PORT}`);
  console.log(` Mobile devices can connect at: http://172.17.1.177:${PORT}`);
  console.log(` Local access: http://localhost:${PORT}`);
});