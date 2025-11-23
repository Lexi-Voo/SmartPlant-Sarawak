const express = require("express");
const router = express.Router();
const DBConn = require("../config/db");

// GET image by ID
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await DBConn();

    const [rows] = await pool.query(
      "SELECT image_data, mime_type FROM plant_images WHERE plant_image_id = ?",
      [id]
    );

    if (rows.length === 0) 
      return res.status(404).send("Image not found");

    res.set("Content-Type", rows[0].mime_type || "image/jpeg");
    res.send(rows[0].image_data);

  } catch (err) {
    console.error("Image fetch error:", err);
    res.status(500).send("Failed to load image.");
  }
});

// Get species image from plant_classifications
router.get("/classification/:species", async (req, res) => {
  try {
    const species = req.params.species;

    const pool = await DBConn();
    const [rows] = await pool.query(
      "SELECT image_ref, mime_type FROM plant_classifications WHERE species = ? LIMIT 1",
      [species]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).send("Image not found");
    }

    const img = rows[0];

    res.setHeader("Content-Type", img.mime_type || "image/jpeg");
    res.send(img.image_ref);

  } catch (err) {
    console.error("Error fetching classification image:", err);
    res.status(500).send("Error fetching image");
  }
});

module.exports = router;
