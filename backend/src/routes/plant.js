/**
 * ============================================================================
 * SMARTPLANT SARAWAK - PLANT ROUTES (REWRITTEN + CLEANED)
 * ============================================================================
 * Mounted at: /plant
 * 
 * Final Endpoint Structure:
 *  - GET    /plant
 *  - GET    /plant/species/all
 *  - POST   /plant/identify
 *  - POST   /plant/upload
 *  - GET    /plant/my-images
 *  - GET    /plant/validations/user/:userId
 *  - GET    /plant/identifications/user/:userId
 *  - GET    /plant/image/:imageId
 *  - PUT    /plant/:markerId
 *  - PUT    /plant/marker/:markerId/coords
 *  - DELETE /plant/marker/:markerId
 * ============================================================================
 */

const express = require("express");
const router = express.Router();

const path = require("path");
const fs = require("fs");
const axios = require("axios");

const DBConn = require("../config/db.js");
const { authenticateJWT, authorizeRoles, optionalAuth } = require("../middleware/authMiddleware.js");
const { encryptGPS, decryptGPS } = require("../utils/encryption.js");
const { getPagination } = require("../utils/pagination.js");


// ============================================================================
// GET PLANT MARKERS (PUBLIC + ADMIN)
// ============================================================================
router.get("/", optionalAuth, async (req, res) => {
  try {
    const db = await DBConn();
    const isAdmin = req.user && (req.user.role === "Admin" || req.user.role === "Expert");

    const {
      species,
      commonName,
      search,
      status,
      date,
      includeAll = "0",
      masked = isAdmin ? req.query.masked ?? "1" : "1",
      conservation,
    } = req.query;

    const where = [];
    const args = [];

    // Public only sees approved markers
    if (includeAll !== "1" || !isAdmin) {
      where.push(`pm.identification_status = 'Approved'`);
    } else if (status && ["Pending", "Approved"].includes(status)) {
      where.push(`pm.identification_status = ?`);
      args.push(status);
    }

    // Unified search fields
    const searchRaw = search || commonName || species;
    if (searchRaw) {
      const terms = searchRaw
        .split(",")
        .map(s => s.trim().toLowerCase())
        .filter(Boolean);

      if (terms.length > 0) {
        const blocks = terms.map(() =>
          `REPLACE(LOWER(pc.common_name), ' ', '') LIKE ? 
           OR REPLACE(LOWER(pc.species), ' ', '') LIKE ? 
           OR REPLACE(LOWER(pc.scientific_name), ' ', '') LIKE ?`
        );

        where.push("(" + blocks.join(" OR ") + ")");
        terms.forEach(t => {
          const n = t.replace(/\s+/g, "");
          args.push(`%${n}%`, `%${n}%`, `%${n}%`);
        });
      }
    }

    // Filter by conservation status
    if (conservation) {
      const list = conservation.split(",").map(i => i.trim()).filter(Boolean);
      if (list.length > 0) {
        where.push(`pc.conservation_status IN (${list.map(() => "?").join(",")})`);
        args.push(...list);
      }
    }

    // Date filter
    if (date) {
      where.push(`DATE(pi.upload_datetime) = ?`);
      args.push(date);
    }

    // Hide endangered for public
    if (!isAdmin) {
      where.push(`(pc.conservation_status IS NULL OR pc.conservation_status <> 'Endangered')`);
    }

    const sql = `
      SELECT
        pm.plant_marker_id,
        pm.plant_image_id,
        pm.user_id,
        ST_X(pm.location) AS lng,
        ST_Y(pm.location) AS lat,
        pi.encrypted_location AS enc_pi,
        pm.plant_classification_id,
        pm.identification_status,
        pc.species,
        pc.scientific_name,
        pc.common_name,
        pc.family,
        pc.conservation_status,
        pc.is_endangered,
        pc.native_region,
        pc.description,
        DATE_FORMAT(pi.upload_datetime, '%Y-%m-%dT%H:%i:%sZ') AS uploaded_at_iso
      FROM plant_markers pm
      JOIN plant_images pi ON pi.plant_image_id = pm.plant_image_id
      LEFT JOIN plant_classifications pc ON pc.plant_classification_id = pm.plant_classification_id
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY pi.upload_datetime DESC
      LIMIT 1000
    `;

    const [rows] = await db.query(sql, args);

    // Decrypt for admin only
    for (const r of rows) {
      if (isAdmin && (r.lat === null || r.lng === null) && ( r.enc_pi)) {
        try {
          const dec = decryptGPS( r.enc_pi);
          r.lng = dec.lng;
          r.lat = dec.lat;
        } catch {}
      }
      delete r.enc_pi;
    }

    res.json(rows);
  } catch (err) {
    console.error("GET /plant failed:", err);
    res.status(500).json({ error: "Failed to fetch plant markers" });
  }
});

// ============================================================================
// GET SPECIES + AI DATASET IMAGES
// ============================================================================
router.get("/species/all", async (req, res) => {
  try {
    const db = await DBConn();
    const [species] = await db.query(`
      SELECT
        plant_classification_id AS id,
        species,
        scientific_name,
        common_name,
        family,
        conservation_status,
        is_endangered,
        native_region,
        description,
        created_at
      FROM plant_classifications
      ORDER BY species ASC
    `);

    const protocol = req.protocol || "http";
    const host = req.get("host");
    const baseUrl = `${protocol}://${host}`;

    const datasetPath = path.join(__dirname, "..", "..", "..", "ai", "retraining", "test", "dataset_split", "train");

    const transformed = species.map(s => {
      const imageUrls = [];
      const folder = path.join(datasetPath, s.species);

      if (fs.existsSync(folder)) {
        const files = fs
          .readdirSync(folder)
          .filter(f => /\.(jpg|jpeg|png)$/i.test(f))
          .slice(0, 10);

        files.forEach(f => {
          imageUrls.push(`${baseUrl}/ai-images/${s.species}/${f}`);
        });
      }

      return {
        id: s.id,
        species: s.species,
        scientificName: s.scientific_name,
        commonName: s.common_name,
        family: s.family,
        conservationStatus: s.conservation_status,
        isEndangered: !!s.is_endangered,
        nativeRegion: s.native_region,
        description: s.description,
        createdAt: s.created_at,
        imageUrls,
        imageCount: imageUrls.length,
        hasImages: imageUrls.length > 0,
      };
    });

    res.json({ success: true, count: transformed.length, data: transformed });
  } catch (err) {
    console.error("Species fetch error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch species" });
  }
});

// ============================================================================
//  PLANT IDENTIFICATION (BLOB STORAGE)
// ============================================================================
router.post("/identify", authenticateJWT, async (req, res) => {
  try {
    const { image, latitude, longitude } = req.body;
    const userId = req.user.userId;

    if (!image) {
      return res.status(400).json({ success: false, error: "Image is required" });
    }

    // Convert base64 → buffer
    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    const imageSize = buffer.length;
    const mimeType = "image/jpeg";

    const db = await DBConn();

    // Insert BLOB
    const [img] = await db.query(
      `INSERT INTO plant_images (user_id, image_data, image_size, mime_type, upload_datetime, location, encrypted_location, retrained)
       VALUES (?, ?, ?, ?, NOW(), POINT(?, ?), NULL, 0)`,
      [userId, buffer, imageSize, mimeType, longitude || null, latitude || null, 0]
    );

    const plantImageId = img.insertId;

    const protocol = req.protocol || "http";
    const host = req.get("host");
    const baseUrl = `${protocol}://${host}`;

    const imageUrl = `/plant/image/${plantImageId}`;
    const imageUri = `${baseUrl}${imageUrl}`;

    // Send to AI server
    const AI_SERVER_URL = process.env.AI_SERVER_URL || "http://localhost:5000";

    const aiResponse = await axios.post(`${AI_SERVER_URL}/predict`, { image }, { timeout: 30000 });

    if (!aiResponse.data || !aiResponse.data.species) {
      throw new Error("AI failed to detect species");
    }

    const species = aiResponse.data.species;
    const confidence = parseFloat(aiResponse.data.confidence) || 0;
    const topPred = aiResponse.data.top_predictions || [];
    // 💡 Add this line to capture the status if the AI server returns it
    const status = aiResponse.data.status || 'success';

    // Fetch species info
    const [info] = await db.query(
      `SELECT * FROM plant_classifications WHERE species = ? OR scientific_name = ? LIMIT 1`,
      [species, species]
    );

    const sData = info[0] || null;

    let predictionId = null;

    if (sData) {
      const [pred] = await db.query(
        `INSERT INTO ai_predictions (plant_image_id, user_id, plant_classification_id, confidence_score, prediction_time)
         VALUES (?, ?, ?, ?, NOW())`,
        [plantImageId, userId, sData.plant_classification_id, confidence]
      );
      predictionId = pred.insertId;
    }

    // Alternatives
    const alternatives = [];
    for (const alt of topPred.slice(1, 4)) {
      const [altInfo] = await db.query(
        `SELECT plant_classification_id AS id, species, scientific_name, common_name, conservation_status
         FROM plant_classifications WHERE species = ? LIMIT 1`,
        [alt.species]
      );

      if (altInfo[0]) {
        alternatives.push({
          ...altInfo[0],
          confidence: parseFloat(alt.confidence) || 0,
        });
      }
    }

    // Encrypt endangered locations
    if (sData?.is_endangered && latitude != null && longitude != null) {
      const encrypted = encryptGPS(Number(latitude), Number(longitude));

      await db.query(
        `UPDATE plant_images SET encrypted_location = ?, location = NULL WHERE plant_image_id = ?`,
        [encrypted, plantImageId]
      );

      await db.query(
        `UPDATE plant_markers SET location = NULL, updated_at = NOW()
         WHERE plant_image_id = ?`,
        [plantImageId]
      );
    }

    res.json({
      success: true,
      data: {
        plantImageId,
        predictionId,
        imageUrl,
        imageUri,
        species,
        confidence,
        scientificName: sData?.scientific_name || species,
        commonName: sData?.common_name || "",
        family: sData?.family || "",
        conservationStatus: sData?.conservation_status || "Data Deficient",
        isEndangered: !!sData?.is_endangered,
        nativeRegion: sData?.native_region || "",
        description: sData?.description || "",
        alternatives,
        latitude: latitude || null,
        longitude: longitude || null,
        status, // 💡 Add the new status field here
      }
    });
  } catch (err) {
    console.error("Identify error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// NOTE: Legacy /upload endpoint removed - all images now use BLOB storage via /plant/identify
// ============================================================================

// ============================================================================
// 📷 GET MY IMAGES (BLOB / FILE MIX)
// ============================================================================
router.get("/my-images", authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { page, pageSize, offset } = getPagination(req, { defaultPageSize: 20, maxPageSize: 50 });

    const db = await DBConn();

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM plant_images WHERE user_id = ?`,
      [userId]
    );

    const [rows] = await db.query(
      `SELECT plant_image_id, upload_datetime,
              ST_Y(location) AS lat, ST_X(location) AS lng,
              encrypted_location,
              CASE WHEN image_data IS NOT NULL THEN 1 ELSE 0 END AS has_blob,
              mime_type
         FROM plant_images
         WHERE user_id = ?
         ORDER BY upload_datetime DESC
         LIMIT ? OFFSET ?`,
      [userId, pageSize, offset]
    );

    const data = rows.map(r => {
      let { lat, lng } = r;
      if ((lat === null || lng === null) && r.encrypted_location) {
        try {
          const dec = decryptGPS(r.encrypted_location);
          lat = dec.lat;
          lng = dec.lng;
        } catch {}
      }

      return {
        plantImageId: r.plant_image_id,
        imageUrl: `/plant/image/${r.plant_image_id}`,
        mimeType: r.mime_type || (r.has_blob ? "image/jpeg" : null),
        uploadDatetime: r.upload_datetime,
        lat,
        lng,
        hasBlob: !!r.has_blob,
      };
    });

    res.json({
      success: true,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      data,
    });
  } catch (err) {
    console.error("My images error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// USER VALIDATION HISTORY
// ============================================================================
router.get("/validations/user/:userId", authenticateJWT, async (req, res) => {
  try {
    const requestedId = Number(req.params.userId);

    if (req.user.userId !== requestedId && req.user.role !== "Admin") {
      return res.status(403).json({ success: false, error: "Unauthorized" });
    }

    const { page, pageSize, offset } = getPagination(req, { defaultPageSize: 20 });
    const db = await DBConn();

    const [rows] = await db.query(
      `SELECT
          pf.feedback_id,
          pf.prediction_id,
          CASE 
            WHEN pf.initial_status = 'Verified' THEN 'confirm'
            WHEN pf.initial_status = 'Flagged' THEN 'reject'
            ELSE 'unknown'
          END AS vote,
          pf.feedback AS feedback_text,
          pf.suggested_species,
          pf.submitted_at AS createdAt,
          ap.confidence_score AS confidence,
          ap.prediction_time AS predictionTime,
          pc.species AS originalSpecies,
          pi.plant_image_id,
          ST_Y(pi.location) AS lat,
          ST_X(pi.location) AS lng,
          pi.encrypted_location,
          CASE WHEN pi.image_data IS NOT NULL THEN 1 ELSE 0 END AS has_blob
       FROM prediction_feedback pf
       JOIN ai_predictions ap ON pf.prediction_id = ap.prediction_id
       JOIN plant_classifications pc ON pc.plant_classification_id = ap.plant_classification_id
       JOIN plant_images pi ON pi.plant_image_id = ap.plant_image_id
       WHERE pf.user_id = ?
       ORDER BY pf.submitted_at DESC
       LIMIT ? OFFSET ?`,
      [requestedId, pageSize, offset]
    );

    const data = rows.map(v => {
      let lat = v.lat;
      let lng = v.lng;

      if ((lat === null || lng === null) && v.encrypted_location) {
        try {
          const dec = decryptGPS(v.encrypted_location);
          lat = dec.lat;
          lng = dec.lng;
        } catch {}
      }

      return {
        ...v,
        imageUri: `/plant/image/${v.plant_image_id}`,
        lat,
        lng
      };
    });

    res.json({
      success: true,
      meta: { page, pageSize, count: data.length },
      data
    });
  } catch (err) {
    console.error("Validation history error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// 📘 IDENTIFICATION HISTORY
// ============================================================================
router.get("/identifications/user/:userId", authenticateJWT, async (req, res) => {
  try {
    const requestedId = Number(req.params.userId);

    if (req.user.userId !== requestedId && req.user.role !== "Admin") {
      return res.status(403).json({ success: false, error: "Unauthorized" });
    }

    const { page, pageSize, offset } = getPagination(req, { defaultPageSize: 20 });
    const db = await DBConn();

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM ai_predictions WHERE user_id = ?`,
      [requestedId]
    );

    const [rows] = await db.query(
      `SELECT
          ap.prediction_id AS identificationId,
          ap.plant_image_id,
          pc.species,
          pc.common_name AS commonName,
          ap.confidence_score AS confidence,
          ap.prediction_time AS createdAt,
          ST_Y(pi.location) AS lat,
          ST_X(pi.location) AS lng,
          pi.encrypted_location,
          CASE WHEN pi.image_data IS NOT NULL THEN 1 ELSE 0 END AS has_blob
       FROM ai_predictions ap
       JOIN plant_images pi ON ap.plant_image_id = pi.plant_image_id
       JOIN plant_classifications pc ON ap.plant_classification_id = pc.plant_classification_id
       WHERE ap.user_id = ?
       ORDER BY ap.prediction_time DESC
       LIMIT ? OFFSET ?`,
      [requestedId, pageSize, offset]
    );

    const data = rows.map(r => {
      let { lat, lng } = r;

      if ((lat === null || lng === null) && r.encrypted_location) {
        try {
          const dec = decryptGPS(r.encrypted_location);
          lat = dec.lat;
          lng = dec.lng;
        } catch {}
      }

      return {
        ...r,
        imageUrl:`/plant/image/${r.plant_image_id}`,
        lat,
        lng
      };
    });

    res.json({
      success: true,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      data
    });
  } catch (err) {
    console.error("Identification history error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// SERVE BLOB IMAGE
// ============================================================================
router.get("/image/:imageId", async (req, res) => {
  try {
    const { imageId } = req.params;
    const db = await DBConn();

    const [rows] = await db.query(
      `SELECT image_data, mime_type, image_size FROM plant_images WHERE plant_image_id = ?`,
      [imageId]
    );

    if (!rows.length || !rows[0].image_data) {
      return res.status(404).send("Image not found");
    }

    const img = rows[0];

    res.set({
      "Content-Type": img.mime_type || "image/jpeg",
      "Content-Length": img.image_size,
      "Cache-Control": "public, max-age=31536000"
    });

    res.send(img.image_data);
  } catch (err) {
    console.error("BLOB image error:", err);
    res.status(500).send("Failed to load image");
  }
});

// ============================================================================
// ADMIN: UPDATE IDENTIFICATION STATUS
// ============================================================================
router.put("/:markerId", authenticateJWT, authorizeRoles("Admin", "Expert"), async (req, res) => {
  try {
    const markerId = Number(req.params.markerId);
    const next = String(req.body.identification_status || "").trim();

    if (!["Approved", "Pending"].includes(next)) {
      return res.status(400).json({ success: false, error: "Invalid status" });
    }

    const db = await DBConn();

    const [result] = await db.query(
      `UPDATE plant_markers SET identification_status = ?, updated_at = NOW()
       WHERE plant_marker_id = ?`,
      [next, markerId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: "Marker not found" });
    }

    res.json({
      success: true,
      data: { plant_marker_id: markerId, identification_status: next }
    });
  } catch (err) {
    console.error("Update status error:", err);
    res.status(500).json({ success: false, error: "Failed to update marker" });
  }
});

// ============================================================================
// ADMIN: UPDATE MARKER COORDS (With Endangered Encryption)
// ============================================================================
router.put("/marker/:markerId/coords", authenticateJWT, authorizeRoles("Admin"), async (req, res) => {
  try {
    const markerId = Number(req.params.markerId);
    const { lat, lng } = req.body;

    if (!Number.isFinite(markerId)) return res.status(400).json({ success: false, error: "Invalid markerId" });
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return res.status(400).json({ success: false, error: "Invalid lat/lng" });

    const db = await DBConn();

    const [[found]] = await db.query(
      `SELECT plant_image_id, plant_classification_id FROM plant_markers WHERE plant_marker_id = ?`,
      [markerId]
    );

    if (!found) {
      return res.status(404).json({ success: false, error: "Marker not found" });
    }

    const plantImageId = found.plant_image_id;

    // Check if endangered
    let endangered = false;

    if (found.plant_classification_id) {
      const [[classRow]] = await db.query(
        `SELECT is_endangered FROM plant_classifications WHERE plant_classification_id = ?`,
        [found.plant_classification_id]
      );
      endangered = !!classRow?.is_endangered;
    }

    const wkt = `POINT(${lng} ${lat})`;

    if (endangered) {
      const encrypted = encryptGPS(lat, lng);

      await db.query(
        `UPDATE plant_images SET encrypted_location = ?, location = NULL WHERE plant_image_id = ?`,
        [encrypted, plantImageId]
      );

      await db.query(
        `UPDATE plant_markers SET location = NULL, updated_at = NOW()
         WHERE plant_image_id = ?`,
        [ plantImageId]
      );
    } else {
      await db.query(
        `UPDATE plant_images SET location = ST_GeomFromText(?, 4326), encrypted_location = NULL
         WHERE plant_image_id = ?`,
        [wkt, plantImageId]
      );

      await db.query(
        `UPDATE plant_markers SET location = ST_GeomFromText(?, 4326), updated_at = NOW()
         WHERE plant_image_id = ?`,
        [wkt, plantImageId]
      );
    }

    res.json({ success: true, data: { plant_marker_id: markerId, lng, lat } });
  } catch (err) {
    console.error("Update coords error:", err);
    res.status(500).json({ success: false, error: "Failed to update coordinates" });
  }
});

// ============================================================================
//  DELETE MARKER
// ============================================================================
router.delete("/marker/:markerId", authenticateJWT, authorizeRoles("Admin"), async (req, res) => {
  try {
    const markerId = Number(req.params.markerId);

    const db = await DBConn();

    const [result] = await db.query(`DELETE FROM plant_markers WHERE plant_marker_id = ?`, [markerId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Marker not found" });
    }

    res.status(204).send();
  } catch (err) {
    console.error("Delete marker error:", err);
    res.status(500).json({ message: err.message });
  }
});

// ============================================================================
// GET /api/plant/species/verified (TO BE SHOWN IN SPECIES SCREEN)
// Returns: Species list + ONLY verified, high-confidence (>80%) images
// ============================================================================
router.get("/species/speciesImage", async (req, res) => {
  try {
    const db = await DBConn();

    const sql = `
      SELECT 
        pc.plant_classification_id,
        pc.species,
        pc.scientific_name,
        pc.common_name,
        pc.family,
        pc.conservation_status,
        pc.description,

        pi.plant_image_id,
        pi.image_size,

        ap.prediction_id,
        ap.confidence_score,

        pf.confirmed_status
      FROM plant_classifications pc
      LEFT JOIN ai_predictions ap
        ON ap.plant_classification_id = pc.plant_classification_id
      LEFT JOIN plant_images pi
        ON pi.plant_image_id = ap.plant_image_id
      LEFT JOIN prediction_feedback pf
        ON pf.prediction_id = ap.prediction_id
      ORDER BY pc.scientific_name ASC;
    `;

    const [rows] = await db.query(sql);

    const speciesMap = {};

    for (const row of rows) {
      if (!speciesMap[row.plant_classification_id]) {
        speciesMap[row.plant_classification_id] = {
          id: row.plant_classification_id,
          scientific_name: row.scientific_name,
          common_name: row.common_name,
          family: row.family,
          conservation_status: row.conservation_status,
          description: row.description,
          images: []
        };
      }

      if (!row.plant_image_id) continue;

      const hasFeedback = row.confirmed_status === "Verified" || row.confirmed_status === "Rejected";

      let allowed = false;

      if (!hasFeedback) {
        // no feedback → allow only high confidence
        if (row.confidence_score >= 80) allowed = true;
      } else {
        // has feedback
        if (row.confirmed_status === "Verified") allowed = true;
        else allowed = false; // Rejected or NULL means blocked
      }

      if (allowed) {
        speciesMap[row.plant_classification_id].images.push({
          imageId: row.plant_image_id,
          url: `/image/${row.plant_image_id}`,
          confidence: row.confidence_score,
          verified: row.confirmed_status === "Verified",
        });
      }
    }

    const result = Object.values(speciesMap).filter(sp => sp.images.length > 0);

    return res.json({
      success: true,
      count: result.length,
      data: result
    });

  } catch (err) {
    console.error("Error in /species/speciesImage:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;