-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Nov 18, 2025 at 07:51 PM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.0.30

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";

--
-- Database: `smartplantctip`
--

-- Create database if it doesn't exist 
CREATE DATABASE IF NOT EXISTS SmartPlantCTIP CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE SmartPlantCTIP;

-- Drop all tables (clean slate)
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS plant_markers;
DROP TABLE IF EXISTS prediction_feedback;
DROP TABLE IF EXISTS ai_predictions;
DROP TABLE IF EXISTS plant_images;
DROP TABLE IF EXISTS heatmap_cache;
DROP TABLE IF EXISTS model_registry;
DROP TABLE IF EXISTS dataset_registry;
DROP TABLE IF EXISTS plant_classifications;

DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS otp_codes;
DROP TABLE IF EXISTS login_attempts;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

-- --------------------------------------------------------

--
-- Table structure for table `ai_predictions`
--

CREATE TABLE `ai_predictions` (
  `prediction_id` int(11) NOT NULL, 
  `plant_image_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `plant_classification_id` int(11) DEFAULT NULL,
  `model_id` int(11) DEFAULT NULL,
  `confidence_score` float DEFAULT NULL,
  `prediction_time` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `audit_logs`
--

CREATE TABLE `audit_logs` (
  `audit_log_id` int(11) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `action` varchar(100) NOT NULL,
  `details` text DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` text DEFAULT NULL,
  `status` enum('success','failure','warning') DEFAULT 'success',
  `is_alarming` tinyint(1) DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `dataset_registry`
--

CREATE TABLE `dataset_registry` (
  `dataset_id` int(11) NOT NULL, 
  `dataset_name` varchar(255) NOT NULL,
  `dataset_version` int(11) NOT NULL,
  `total_images` int(11) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `dataset_path` varchar(500) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `login_attempts`
--

CREATE TABLE `login_attempts` (
  `login_attempt_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `attempt_counter` int(11) DEFAULT 1,
  `attempt_time` timestamp NOT NULL DEFAULT current_timestamp(),
  `success` tinyint(1) DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `model_registry`
--

CREATE TABLE `model_registry` (
  `model_id` int(11) NOT NULL,
  `model_name` varchar(255) NOT NULL,
  `model_version` varchar(50) NOT NULL,
  `dataset_id` int(11) NOT NULL,
  `trained_on` datetime DEFAULT NULL,
  `val_accuracy` float DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 0,
  `model_path` varchar(500) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `otp_codes`
--

CREATE TABLE `otp_codes` (
  `otp_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `otp_code` varchar(6) NOT NULL,
  `purpose` enum('mfa','reset','verification') NOT NULL,
  `expires_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `is_used` tinyint(1) DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `plant_classifications`
--

CREATE TABLE `plant_classifications` (
  `plant_classification_id` int(11) NOT NULL,
  `species` varchar(255) NOT NULL,
  `scientific_name` varchar(255) NOT NULL,
  `common_name` varchar(255) DEFAULT NULL,
  `family` varchar(100) DEFAULT NULL,
  `conservation_status` enum('Endangered','Vulnerable','Common') NOT NULL,
  `is_endangered` tinyint(1) DEFAULT 0,
  `native_region` varchar(255) DEFAULT 'Borneo, Southeast Asia',
  `description` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `plant_classifications`
--

INSERT INTO `plant_classifications` (`plant_classification_id`, `species`, `scientific_name`, `common_name`, `family`, `conservation_status`, `is_endangered`, `native_region`, `description`, `created_at`) VALUES
(1, 'Arundina_graminifolia', 'Arundina graminifolia', 'Bamboo Orchid', 'Orchidaceae', 'Common', 0, 'Borneo, Southeast Asia', 'A terrestrial orchid with bamboo-like stems and purple flowers, often found along roadsides and open grasslands.', '2024-12-31 18:00:00'),
(2, 'Bulbophyllum_beccarii', 'Bulbophyllum beccarii', 'Beccari\'s Bulbophyllum', 'Orchidaceae', 'Vulnerable', 0, 'Borneo', 'A large shingling orchid with overlapping leaves and foul-smelling flowers that attract flies.', '2025-01-14 18:00:00'),
(3, 'Bulbophyllum_dearei', 'Bulbophyllum dearei', 'Deare\'s Bulbophyllum', 'Orchidaceae', 'Vulnerable', 0, 'Borneo, Malaysia', 'An epiphytic orchid found in lowland forests, known for its yellowish flowers with purple markings.', '2025-01-19 18:00:00'),
(4, 'Avicennia', 'Avicennia officinalis', 'Grey Mangrove', 'Acanthaceae', 'Common', 0, 'Coastal Southeast Asia', 'A common mangrove species with salt-excreting leaves and aerial roots, typically found in muddy estuaries.', '2025-01-31 18:00:00'),
(5, 'Begonias', 'Begonia spp.', 'Wild Begonias', 'Begoniaceae', 'Common', 0, 'Borneo', 'Shade-loving understory plants with colorful foliage. Many species in Borneo are endemic to limestone and hill forests.', '2025-02-14 18:00:00'),
(6, 'Nepenthes', 'Nepenthes rafflesiana', 'Raffles\' Pitcher Plant', 'Nepenthaceae', 'Vulnerable', 0, 'Borneo', 'A carnivorous pitcher plant with large, beautifully patterned pitchers that trap insects for nutrients.', '2025-02-19 18:00:00'),
(7, 'Coelogyne_pandurata', 'Coelogyne pandurata', 'Black Orchid', 'Orchidaceae', 'Vulnerable', 0, 'Borneo', 'A striking green orchid with a jet-black lip. Culturally significant in Sarawak and threatened by habitat disturbance.', '2025-02-20 18:00:00'),
(8, 'Grammatophyllum_speciosum', 'Grammatophyllum speciosum', 'Giant Tiger Orchid', 'Orchidaceae', 'Common', 0, 'Southeast Asia', 'One of the world’s largest orchids, producing massive clumps and yellow-brown tiger-patterned flowers.', '2025-02-21 18:00:00'),
(9, 'Dendrobium_pulchellum', 'Dendrobium pulchellum', 'Cute Dendrobium', 'Orchidaceae', 'Common', 0, 'Southeast Asia', 'An epiphyte with pale yellow flowers and a sweet fragrance, found in seasonal and hill forests.', '2025-02-22 18:00:00'),
(10, 'Bulbophyllum_longissimum', 'Bulbophyllum longissimum', 'Long-tailed Bulbophyllum', 'Orchidaceae', 'Vulnerable', 0, 'Malaysia, Thailand, Borneo', 'Famous for its extremely long, hanging sepals. Grows in humid lowland forests and is sensitive to habitat loss.', '2025-02-23 18:00:00'),
(11, 'Phalaenopsis_violacea', 'Phalaenopsis violacea', 'Violet Orchid', 'Orchidaceae', 'Vulnerable', 0, 'Borneo', 'A fragrant orchid with violet-colored petals, commonly found in shady lowland forests along rivers.', '2025-02-24 18:00:00'),
(12, 'Phalaenopsis_bellina', 'Phalaenopsis bellina', 'Bornean Bell Orchid', 'Orchidaceae', 'Vulnerable', 0, 'Borneo', 'An endemic species with purple-green star-shaped flowers and a sweet citrus-like fragrance.', '2025-02-25 18:00:00'),
(13, 'Renanthera_imschootiana', 'Renanthera imschootiana', 'Red Renanthera', 'Orchidaceae', 'Endangered', 1, 'Southeast Asia', 'A striking climbing orchid with brilliant red flowers. Threatened by overcollection and forest loss.', '2025-02-26 18:00:00'),
(14, 'Rhynchostylis_retusa', 'Rhynchostylis retusa', 'Foxtail Orchid', 'Orchidaceae', 'Common', 0, 'Southeast Asia', 'Known for its long, cascading flower spikes packed with pink-spotted blooms. Widely distributed but locally threatened.', '2025-02-27 18:00:00'),
(15, 'Shorea_smithiana', 'Shorea smithiana', 'Light Red Meranti', 'Dipterocarpaceae', 'Endangered', 1, 'Borneo', 'A large emergent rainforest tree heavily targeted for timber. Its population has declined due to logging.', '2025-02-28 18:00:00'),
(16, 'Rafflesia', 'Rafflesia arnoldii', 'Corpse Flower', 'Rafflesiaceae', 'Endangered', 1, 'Borneo, Sumatra', 'Produces the world’s largest single flower. A parasitic plant with no leaves, stems, or roots, emitting a strong odor to attract flies.', '2025-03-01 18:00:00'),
(17, 'Rhododendron', 'Rhododendron lowii', 'Low\'s Rhododendron', 'Ericaceae', 'Vulnerable', 0, 'Borneo highlands', 'A high-elevation shrub with large bell-shaped flowers, commonly found on Mount Kinabalu and other montane forests.', '2025-03-02 18:00:00'),
(18, 'Hibiscus_rosasinensis', 'Hibiscus rosa-sinensis', 'Bunga Raya (Hibiscus)', 'Malvaceae', 'Common', 0, 'Malaysia, Southeast Asia', 'A widely cultivated tropical shrub known for its large, striking red flowers. \r\n  It is Malaysia’s national flower and commonly used in landscaping.', '2025-11-21 01:01:44');

-- ========================================
-- DATABASE EVENTS (Automated Maintenance)
-- ========================================

SET GLOBAL event_scheduler = ON;

-- Cleanup expired OTPs
DELIMITER //
CREATE EVENT IF NOT EXISTS cleanup_expired_otps
ON SCHEDULE EVERY 5 MINUTE
DO 
BEGIN
  DELETE FROM otp_codes WHERE expires_at < NOW();
END//
DELIMITER ;

-- Auto-unlock accounts after 3 hours
DELIMITER //
CREATE EVENT IF NOT EXISTS auto_unlock_accounts
ON SCHEDULE EVERY 5 MINUTE
DO
BEGIN
  UPDATE users
  SET is_locked = FALSE, locked_at = NULL, failed_login_attempts = 0
  WHERE is_locked = TRUE
    AND locked_at < NOW() - INTERVAL 3 HOUR;
END//
DELIMITER ;

-- Cleanup old audit logs (keep 90 days)
DELIMITER //
CREATE EVENT IF NOT EXISTS cleanup_old_audit_logs
ON SCHEDULE EVERY 1 DAY
DO
BEGIN
  DELETE FROM audit_logs 
  WHERE created_at < DATE_SUB(NOW(), INTERVAL 90 DAY)
    AND is_alarming = FALSE;
END//
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `plant_images`
--

CREATE TABLE `plant_images` (
  `plant_image_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `image_data` longblob DEFAULT NULL COMMENT 'Actual image binary data stored in database',
  `image_size` int(11) DEFAULT NULL COMMENT 'Image size in bytes',
  `mime_type` varchar(50) DEFAULT 'image/jpeg' COMMENT 'Image MIME type',
  `upload_datetime` datetime NOT NULL DEFAULT current_timestamp(),
  `location` point DEFAULT NULL,
  `encrypted_location` longtext DEFAULT NULL,
  `retrained` tinyint(1) NOT NULL DEFAULT 0
  /*PRIMARY KEY (`plant_image_id`)*/
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Triggers `plant_images`
--
DELIMITER $$
CREATE TRIGGER `trg_pi_after_update` AFTER UPDATE ON `plant_images` FOR EACH ROW BEGIN
  IF ( (NEW.location IS NULL) <> (OLD.location IS NULL)
       OR (NEW.location IS NOT NULL AND OLD.location IS NOT NULL
           AND ST_AsText(NEW.location) <> ST_AsText(OLD.location)) ) THEN

    UPDATE plant_markers
       SET location = NEW.location
     WHERE plant_image_id = NEW.plant_image_id;
  END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `plant_markers`
--

CREATE TABLE `plant_markers` (
  `plant_marker_id` int(11) NOT NULL,
  `plant_image_id` int(11) NOT NULL,
  `plant_classification_id` int(11) DEFAULT NULL,
  `user_id` int(11) NOT NULL,
  `location` point DEFAULT NULL,
  `identification_status` enum('Pending','Approved') NOT NULL DEFAULT 'Pending',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `prediction_feedback`
--

CREATE TABLE `prediction_feedback` (
  `feedback_id` int(11) NOT NULL, 
  `prediction_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `feedback` varchar(255) DEFAULT NULL,
  `suggested_species` varchar(255) DEFAULT NULL,
  `initial_status` enum('Verified','Flagged') NOT NULL DEFAULT 'Flagged',
  `submitted_at` datetime DEFAULT current_timestamp(),
  `confirmed_status` enum('Verified','Rejected') DEFAULT NULL,
  `reviewed_by` int(11) DEFAULT NULL,
  `reviewed_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Triggers `prediction_feedback`
--
DELIMITER $$
CREATE TRIGGER `trg_pf_after_insert` AFTER INSERT ON `prediction_feedback` FOR EACH ROW BEGIN
  -- All DECLAREs must be at the top of the block
  DECLARE v_image_id   INT;
  DECLARE v_user_id    INT;
  DECLARE v_best_class INT;
  DECLARE v_best_conf  DECIMAL(6,4);

  IF NEW.confirmed_status = 'Verified' THEN
    -- Link feedback -> prediction -> image/user
    SELECT ap.plant_image_id, ap.user_id
      INTO v_image_id, v_user_id
    FROM ai_predictions ap
    WHERE ap.prediction_id = NEW.prediction_id
    LIMIT 1;

    IF v_image_id IS NOT NULL THEN
      -- Best prediction for that image (max confidence, tie -> latest time)
      SELECT ap1.plant_classification_id, ap1.confidence_score
        INTO v_best_class, v_best_conf
      FROM ai_predictions ap1
      LEFT JOIN ai_predictions ap2
        ON ap2.plant_image_id = ap1.plant_image_id
       AND (
            ap2.confidence_score > ap1.confidence_score
            OR (ap2.confidence_score = ap1.confidence_score
                AND ap2.prediction_time > ap1.prediction_time)
       )
      WHERE ap1.plant_image_id = v_image_id
        AND ap2.plant_image_id IS NULL
      LIMIT 1;

      -- Threshold + at least one Verified for THIS prediction_id
      IF v_best_conf IS NOT NULL
         AND v_best_conf >= 70
         AND EXISTS (
           SELECT 1
           FROM prediction_feedback pf
           WHERE pf.prediction_id = NEW.prediction_id
             AND pf.confirmed_status = 'Verified'
         )
      THEN
        -- Upsert marker as Pending; mirror location from plant_images
        INSERT INTO plant_markers
          (plant_image_id, plant_classification_id, user_id, location, identification_status, created_at, updated_at)
        SELECT
          pi.plant_image_id,
          v_best_class,
          v_user_id,
          pi.location,
          'Pending',
          NOW(),
          NOW()
        FROM plant_images pi
        WHERE pi.plant_image_id = v_image_id
        ON DUPLICATE KEY UPDATE
          plant_classification_id = VALUES(plant_classification_id),
          user_id                 = VALUES(user_id),
          location                = VALUES(location),
          identification_status   = 'Pending',
          updated_at              = NOW();
      END IF;
    END IF;
  END IF;
END
$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER `trg_pf_after_update` AFTER UPDATE ON `prediction_feedback` FOR EACH ROW BEGIN
  DECLARE v_image_id   INT;
  DECLARE v_user_id    INT;
  DECLARE v_best_class INT;
  DECLARE v_best_conf  DECIMAL(6,4);

  IF NEW.confirmed_status = 'Verified'
     AND (OLD.confirmed_status IS NULL OR OLD.confirmed_status <> 'Verified') THEN

    SELECT ap.plant_image_id, ap.user_id
      INTO v_image_id, v_user_id
    FROM ai_predictions ap
    WHERE ap.prediction_id = NEW.prediction_id
    LIMIT 1;

    IF v_image_id IS NOT NULL THEN
      SELECT ap1.plant_classification_id, ap1.confidence_score
        INTO v_best_class, v_best_conf
      FROM ai_predictions ap1
      LEFT JOIN ai_predictions ap2
        ON ap2.plant_image_id = ap1.plant_image_id
       AND (
            ap2.confidence_score > ap1.confidence_score
            OR (ap2.confidence_score = ap1.confidence_score
                AND ap2.prediction_time > ap1.prediction_time)
       )
      WHERE ap1.plant_image_id = v_image_id
        AND ap2.plant_image_id IS NULL
      LIMIT 1;

      IF v_best_conf IS NOT NULL
         AND v_best_conf >= 70
         AND EXISTS (
           SELECT 1
           FROM prediction_feedback pf
           WHERE pf.prediction_id = NEW.prediction_id
             AND pf.confirmed_status = 'Verified'
         )
      THEN
        INSERT INTO plant_markers
          (plant_image_id, plant_classification_id, user_id, location, identification_status, created_at, updated_at)
        SELECT
          pi.plant_image_id,
          v_best_class,
          v_user_id,
          pi.location,
          'Pending',
          NOW(),
          NOW()
        FROM plant_images pi
        WHERE pi.plant_image_id = v_image_id
        ON DUPLICATE KEY UPDATE
          plant_classification_id = VALUES(plant_classification_id),
          user_id                 = VALUES(user_id),
          location                = VALUES(location),
          identification_status   = 'Pending',
          updated_at              = NOW();
      END IF;
    END IF;
  END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `user_id` int(11) NOT NULL,
  `username` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `profile_image` varchar(500) DEFAULT NULL,
  `profile_image_data` longblob DEFAULT NULL COMMENT 'Profile image binary data stored in database',
  `profile_image_size` int(11) DEFAULT NULL COMMENT 'Profile image size in bytes',
  `profile_mime_type` varchar(50) DEFAULT 'image/jpeg' COMMENT 'Profile image MIME type',
  `user_type` enum('Admin','Expert','Member') DEFAULT 'Member',
  `is_active` tinyint(1) DEFAULT 1,
  `email_verified` tinyint(1) DEFAULT 0,
  `is_locked` tinyint(1) DEFAULT 0,
  `locked_at` timestamp NULL DEFAULT NULL,
  `failed_login_attempts` int(11) DEFAULT 0,
  `last_login` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `ai_predictions`
--
ALTER TABLE `ai_predictions`
  ADD PRIMARY KEY (`prediction_id`),
  ADD KEY `fk_ap_image` (`plant_image_id`),
  ADD KEY `fk_ap_class` (`plant_classification_id`),
  ADD KEY `fk_ap_model` (`model_id`),
  ADD KEY `idx_user` (`user_id`),
  ADD KEY `idx_confidence` (`confidence_score`),
  ADD KEY `idx_time` (`prediction_time`);

--
-- Indexes for table `audit_logs`
--
ALTER TABLE `audit_logs`
  ADD PRIMARY KEY (`audit_log_id`),
  ADD KEY `idx_user_action` (`user_id`,`action`),
  ADD KEY `idx_created_at` (`created_at`),
  ADD KEY `idx_status` (`status`),
  ADD KEY `idx_alarming` (`is_alarming`);

--
-- Indexes for table `dataset_registry`
--
ALTER TABLE `dataset_registry`
  ADD PRIMARY KEY (`dataset_id`),
  ADD UNIQUE KEY `unique_dataset` (`dataset_name`,`dataset_version`),
  ADD KEY `idx_version` (`dataset_version`);

--
-- Indexes for table `login_attempts`
--
ALTER TABLE `login_attempts`
  ADD PRIMARY KEY (`login_attempt_id`),
  ADD KEY `idx_user_time` (`user_id`,`attempt_time`);

--
-- Indexes for table `model_registry`
--
ALTER TABLE `model_registry`
  ADD PRIMARY KEY (`model_id`),
  ADD KEY `fk_model_dataset` (`dataset_id`),
  ADD KEY `idx_active` (`is_active`),
  ADD KEY `idx_accuracy` (`val_accuracy`);

--
-- Indexes for table `otp_codes`
--
ALTER TABLE `otp_codes`
  ADD PRIMARY KEY (`otp_id`),
  ADD KEY `idx_user_otp` (`user_id`,`otp_code`),
  ADD KEY `idx_expires` (`expires_at`);

--
-- Indexes for table `plant_classifications`
--
ALTER TABLE `plant_classifications`
  ADD PRIMARY KEY (`plant_classification_id`),
  ADD UNIQUE KEY `species` (`species`),
  ADD KEY `idx_species` (`species`);

--
-- Indexes for table `plant_images`
--
ALTER TABLE `plant_images`
  ADD PRIMARY KEY (`plant_image_id`),
  ADD KEY `idx_user` (`user_id`),
  ADD KEY `idx_upload` (`upload_datetime`),
  ADD KEY `idx_image_size` (`image_size`);

--
-- Indexes for table `plant_markers`
--
ALTER TABLE `plant_markers`
  ADD PRIMARY KEY (`plant_marker_id`),
  ADD UNIQUE KEY `uk_markers_image` (`plant_image_id`),
  ADD KEY `idx_status` (`identification_status`),
  ADD KEY `idx_user` (`user_id`),
  ADD KEY `fk_pm_class` (`plant_classification_id`);

--
-- Indexes for table `prediction_feedback`
--
ALTER TABLE `prediction_feedback`
  ADD PRIMARY KEY (`feedback_id`),
  ADD KEY `fk_pf_prediction` (`prediction_id`),
  ADD KEY `fk_pf_reviewer` (`reviewed_by`),
  ADD KEY `idx_status` (`initial_status`,`confirmed_status`),
  ADD KEY `idx_user` (`user_id`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`user_id`),
  ADD UNIQUE KEY `username` (`username`),
  ADD UNIQUE KEY `email` (`email`),
  ADD KEY `idx_username` (`username`),
  ADD KEY `idx_email` (`email`),
  ADD KEY `idx_user_type` (`user_type`),
  ADD KEY `idx_is_active` (`is_active`),
  ADD KEY `idx_email_verified` (`email_verified`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `ai_predictions`
--
ALTER TABLE `ai_predictions`
  MODIFY `prediction_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `audit_logs`
--
ALTER TABLE `audit_logs`
  MODIFY `audit_log_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `dataset_registry`
--
ALTER TABLE `dataset_registry`
  MODIFY `dataset_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `login_attempts`
--
ALTER TABLE `login_attempts`
  MODIFY `login_attempt_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `model_registry`
--
ALTER TABLE `model_registry`
  MODIFY `model_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `otp_codes`
--
ALTER TABLE `otp_codes`
  MODIFY `otp_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `plant_classifications`
--
ALTER TABLE `plant_classifications`
  MODIFY `plant_classification_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=17;

--
-- AUTO_INCREMENT for table `plant_images`
--
ALTER TABLE `plant_images`
  MODIFY `plant_image_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `plant_markers`
--
ALTER TABLE `plant_markers`
  MODIFY `plant_marker_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `prediction_feedback`
--
ALTER TABLE `prediction_feedback`
  MODIFY `feedback_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `user_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- Sample Data: Admin, Expert, and User Accounts
-- Default credentials:
-- Admin: username='admin', password='admin123', role='Admin'
-- Expert: username='expert', password='expert123', role='Expert'
-- User: username='user', password='user123', role='Member'
-- IMPORTANT: Change these passwords after setup!
--

INSERT INTO `users` (`username`, `email`, `password`, `user_type`, `is_active`, `email_verified`, `is_locked`, `failed_login_attempts`, `created_at`) VALUES
('admin', 'admin@smartplant.sarawak', '$argon2id$v=19$m=65536,t=3,p=4$BajA1wsE0KzP3H6soCj/CA$4Jd38NHmtECuySJ6yFBhr/Y/J/JAcjxQJ/nx8A4TkH4', 'Admin', 1, 1, 0, 0, NOW());

INSERT INTO `users` (`username`, `email`, `password`, `user_type`, `is_active`, `email_verified`, `is_locked`, `failed_login_attempts`, `created_at`) VALUES
('expert', 'expert@smartplant.sarawak', '$argon2id$v=19$m=65536,t=3,p=4$/qKrSXquIFVHdFVcVxoOdw$GYY8VXmFoorwSa8zgM6V2wrpfLSAaBTjwKw62pMcLE4', 'Expert', 1, 1, 0, 0, NOW());

INSERT INTO `users` (`username`, `email`, `password`, `user_type`, `is_active`, `email_verified`, `is_locked`, `failed_login_attempts`, `created_at`) VALUES
('user', 'user@smartplant.sarawak', '$argon2id$v=19$m=65536,t=3,p=4$qF2ymbvSkwPkLHyOzrehZQ$AGC2/zXzwrba8tq8e/j0xV0OAY6zx9wPyV7qIE5tHDw', 'Member', 1, 1, 0, 0, NOW());

--
-- Constraints for dumped tables
--

--
-- Constraints for table `ai_predictions`
--
ALTER TABLE `ai_predictions`
  ADD CONSTRAINT `fk_ap_class` FOREIGN KEY (`plant_classification_id`) REFERENCES `plant_classifications` (`plant_classification_id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_ap_image` FOREIGN KEY (`plant_image_id`) REFERENCES `plant_images` (`plant_image_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_ap_model` FOREIGN KEY (`model_id`) REFERENCES `model_registry` (`model_id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_ap_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE;

--
-- Constraints for table `audit_logs`
--
ALTER TABLE `audit_logs`
  ADD CONSTRAINT `fk_audit_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL;

--
-- Constraints for table `login_attempts`
--
ALTER TABLE `login_attempts`
  ADD CONSTRAINT `fk_login_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE;

--
-- Constraints for table `model_registry`
--
ALTER TABLE `model_registry`
  ADD CONSTRAINT `fk_model_dataset` FOREIGN KEY (`dataset_id`) REFERENCES `dataset_registry` (`dataset_id`);

--
-- Constraints for table `otp_codes`
--
ALTER TABLE `otp_codes`
  ADD CONSTRAINT `fk_otp_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE;

--
-- Constraints for table `plant_images`
--
ALTER TABLE `plant_images`
  ADD CONSTRAINT `fk_pi_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE;

--
-- Constraints for table `plant_markers`
--
ALTER TABLE `plant_markers`
  ADD CONSTRAINT `fk_pm_class` FOREIGN KEY (`plant_classification_id`) REFERENCES `plant_classifications` (`plant_classification_id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_pm_image` FOREIGN KEY (`plant_image_id`) REFERENCES `plant_images` (`plant_image_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_pm_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE;

--
-- Constraints for table `prediction_feedback`
--
ALTER TABLE `prediction_feedback`
  ADD CONSTRAINT `fk_pf_prediction` FOREIGN KEY (`prediction_id`) REFERENCES `ai_predictions` (`prediction_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_pf_reviewer` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_pf_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE;
COMMIT;


