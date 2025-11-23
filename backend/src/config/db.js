/**
 * ============================================================================
 * DATABASE CONNECTION CONFIGURATION
 * ============================================================================
 * 
 * PURPOSE:
 * Establishes and manages MySQL database connection pool for the SmartPlant application.
 * Uses connection pooling for better performance and resource management.
 * 
 * HOW IT WORKS:
 * 1. Loads database credentials from .env file
 * 2. Creates a connection pool (reusable connections)
 * 3. Tests connection with a simple query
 * 4. Returns pool for use throughout the application
 * 
 * CONNECTION POOLING BENEFITS:
 * - Reuses existing connections instead of creating new ones
 * - Improves performance by reducing connection overhead
 * - Automatically manages connection lifecycle
 * - Queues requests when all connections are in use
 * 
 * CONFIGURATION:
 * - connectionLimit: 10 (max 10 simultaneous connections)
 * - waitForConnections: true (wait if all connections busy)
 * - queueLimit: 0 (unlimited queue size)
 * 
 * USAGE:
 * const DBConn = require('./config/db');
 * const pool = await DBConn();
 * const [results] = await pool.query('SELECT * FROM users');
 * 
 * ENVIRONMENT VARIABLES REQUIRED:
 * - DB_HOST: Database server address (default: localhost)
 * - DB_PORT: Database port (default: 3306)
 * - DB_USER: Database username (default: root)
 * - DB_PASS: Database password (default: empty)
 * - DB_NAME: Database name (default: SmartPlantCTIP)
 * ============================================================================
 */

// ============================================================================
// DEPENDENCIES
// ============================================================================

const mysql = require('mysql2/promise');
require('dotenv').config();

// ============================================================================
// DATABASE CONNECTION FUNCTION
// ============================================================================

/**
 * Creates and returns a MySQL connection pool
 * @returns {Promise<Pool>} MySQL connection pool instance
 * @throws {Error} Exits process if connection fails
 */
const DBConn = async () => {
    try {
        // Create connection pool with configuration from environment variables
        const pool = mysql.createPool({
            host: process.env.DB_HOST || "localhost",
            port: process.env.DB_PORT || 3306,
            user: process.env.DB_USER || "root",
            password: process.env.DB_PASS || "",
            database: process.env.DB_NAME || "SmartPlantCTIP",
            waitForConnections: true,  // Wait for available connection instead of failing
            connectionLimit: 10,       // Maximum 10 simultaneous connections
            queueLimit: 0,            // Unlimited queue (0 = no limit)
    });

    // Test database connection with a simple query
    const [rows] = await pool.query('SELECT NOW() AS time;');
    console.log(`${process.env.DB_NAME || "SmartPlantCTIP"} connected successfully at:`, rows[0].time);

    // Return the pool for use in other modules
    return pool; 

    } catch (error) {
        // Log error and exit if connection fails
        console.error('Error connecting to the database:', error.message);
        process.exit(1);  // Exit with error code
    }
};

// ============================================================================
// EXPORT
// ============================================================================

module.exports = DBConn;
