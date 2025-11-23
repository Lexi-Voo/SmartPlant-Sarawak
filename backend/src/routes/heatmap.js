const express = require("express");
const DBConn = require("../config/db");

const router = express.Router();

/**
 * PUBLIC/ADMIN: HEATMAP POINTS
 * GET /api/heatmap
 * 
 * Query:
 *   bounds   : "minLng,minLat,maxLng,maxLat" (optional)
 *   from,to  : ISO datetimes for upload range (optional) — uses pi.upload_datetime
 *   search   : unified plant name (matches common_name, species, scientific_name)
 *
 * Behavior:
 *  - Only includes APPROVED markers (pm.identification_status='Approved')
 *  - Reads coords/time from plant_images (pi.location, pi.upload_datetime)
 *  - Always returns raw points:
 *      [{ lng, lat, sighted_date, count: 1 }, ...]
 *    Frontend decides whether to use it as general or per-species heatmap.
 */

router.get("/", async (req, res) => {
  try {
    const db = await DBConn();
    const where = [];
    const args = [];

    // Time filtering via query parameters (from, to)
    const from = req.query.from ? new Date(req.query.from) : null;
    const to = req.query.to ? new Date(req.query.to) : null;
    const isValid = (d) => d instanceof Date && !isNaN(d.getTime());

    if (isValid(from)) {
      where.push(`pi.upload_datetime >= ?`);
      args.push(from.toISOString().slice(0, 19).replace("T", " "));
    }
    if (isValid(to)) {
      where.push(`pi.upload_datetime <= ?`);
      args.push(to.toISOString().slice(0, 19).replace("T", " "));
    }

    // Map bounds filter (optional)
    if (req.query.bounds) {
      const [minLng, minLat, maxLng, maxLat] = req.query.bounds
        .split(",")
        .map(Number);
      if ([minLng, minLat, maxLng, maxLat].every(Number.isFinite)) {
        where.push(`ST_X(pi.location) BETWEEN ? AND ?`);
        where.push(`ST_Y(pi.location) BETWEEN ? AND ?`);
        args.push(minLng, maxLng, minLat, maxLat);
      }
    }

    // Unified name filter: ?search=... or legacy ?species=...
    const searchRaw = req.query.search || req.query.species;
    if (searchRaw) {
      const terms = searchRaw
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0);

      if (terms.length > 0) {
        const clauses = terms.map(
          () => `
            (
              REPLACE(LOWER(pc.common_name),       ' ', '') LIKE ?
              OR REPLACE(LOWER(pc.species),        ' ', '') LIKE ?
              OR REPLACE(LOWER(pc.scientific_name),' ', '') LIKE ?
            )
          `
        );

        where.push("(" + clauses.join(" OR ") + ")");

        terms.forEach((t) => {
          const norm = t.replace(/\s+/g, "");
          args.push(`%${norm}%`, `%${norm}%`, `%${norm}%`);
        });
      }
    }
    // Single raw-points query for both general + name-filtered modes
    const sql = `
      SELECT
        ST_X(pi.location) AS lng,
        ST_Y(pi.location) AS lat,
        DATE(pi.upload_datetime) AS sighted_date,
        1 AS count
      FROM plant_markers pm
      JOIN plant_images pi
        ON pi.plant_image_id = pm.plant_image_id
      LEFT JOIN plant_classifications pc
        ON pc.plant_classification_id = pm.plant_classification_id
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY pi.upload_datetime ASC
    `;

    const [rows] = await db.query(sql, args);
    console.log("[/heatmap] raw-points mode DB rows:", rows.length);

    const points = rows.filter(
      (r) => Number.isFinite(r.lat) && Number.isFinite(r.lng)
    );
    return res.json(points);
  } catch (err) {
    console.error("Heatmap aggregation error:", err.stack || err.message);
    res.status(500).json({ message: err.message });
  }
});

// ============================================================================
// GET /api/heatmap/locations?species=Arundina_graminifolia&limit=5
// Fetch latest marker coordinates for a specific species
// ============================================================================
router.get("/locations", async (req, res) => {
  try {
    const db = await DBConn();

    const { species, limit = 5 } = req.query;

    if (!species) {
      return res.status(400).json({
        success: false,
        error: "Species is required"
      });
    }

    const [rows] = await db.query(
      `
      SELECT 
        ST_Y(pi.location) AS latitude,
        ST_X(pi.location) AS longitude,
        pi.upload_datetime AS uploadedAt
      FROM plant_markers pm
      JOIN plant_images pi
        ON pi.plant_image_id = pm.plant_image_id
      JOIN plant_classifications pc
        ON pc.plant_classification_id = pm.plant_classification_id
      WHERE pc.species = ?
      ORDER BY pi.upload_datetime DESC
      LIMIT ?
      `,
      [species, Number(limit)]
    );

    return res.json({
      success: true,
      data: rows
    });

  } catch (err) {
    console.error("GET /heatmap/locations failed:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to load locations"
    });
  }
});


module.exports = router;