/**
 * ============================================================================
 * PLANT IDENTIFICATION CONTROLLER
 * ============================================================================
 * 
 * PURPOSE:
 * Handles plant identification using AI model and manages identification history.
 * Connects frontend mobile app to AI server for plant species recognition.
 * 
 * MAIN FEATURES:
 * 1. AI-Powered Plant Identification (via Python Flask server)
 * 2. Species information retrieval (scientific names, conservation status)
 * 3. Identification history management
 * 4. Species image gallery
 * 5. Database integration for enriched species data
 * 
 * ENDPOINTS:
 * - POST /plant/identify - Identify plant from image
 * - GET /plant/identifications/user/:userId - Get user's identification history
 * - GET /plant/species/:species - Get detailed species information
 * - GET /plant/species/:species/images - Get species image gallery
 * 
 * AI INTEGRATION:
 * Communicates with Python Flask AI server running on port 5000
 * - Sends base64-encoded images
 * - Receives species predictions with confidence scores
 * - Handles alternative predictions (top 3)
 * - 30-second timeout for AI processing
 * 
 * DATABASE TABLES:
 * - plant_identifications: User identification records
 * - plant_classifications: Species information and conservation data
 * - plant_images: Reference images for each species
 * - users: User information
 * 
 * WORKFLOW:
 * 1. User captures plant photo in mobile app
 * 2. Frontend sends base64 image to this endpoint
 * 3. Backend forwards image to AI server
 * 4. AI server returns species prediction
 * 5. Backend enriches with database info
 * 6. Frontend displays result with conservation status
 * ============================================================================
 */

// ============================================================================
// DEPENDENCIES
// ============================================================================

const db = require('../config/db');  // Database connection pool
const axios = require('axios');  // HTTP client for AI server communication
const fs = require('fs');
const path = require('path');

// ============================================================================
// CONFIGURATION
// ============================================================================

// AI Server Configuration - Python Flask server with TensorFlow model
const AI_SERVER_URL = process.env.AI_SERVER_URL || 'http://localhost:5000';

console.log(' AI Server configured at:', AI_SERVER_URL);

// ============================================================================
// IDENTIFY PLANT FUNCTION
// ============================================================================

/**
 * Identify plant species from image using AI model
 * @route POST /plant/identify
 * @param {string} req.body.image - Base64-encoded plant image
 * @param {number} req.body.latitude - Optional GPS latitude
 * @param {number} req.body.longitude - Optional GPS longitude
 * @returns {Object} Species identification with confidence and alternatives
 */
const identifyPlant = async (req, res) => {
  try {
    const { image, latitude, longitude } = req.body;

    if (!image) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: image'
      });
    }

    // Call AI server for identification
    console.log(' Sending image to AI server:', AI_SERVER_URL);
    try {
      const aiResponse = await axios.post(`${AI_SERVER_URL}/predict`, {
        image: image, // base64 encoded image
      }, {
        timeout: 30000, // 30 second timeout for AI processing
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log(' AI Server Response received:', {
        species: aiResponse.data.species,
        confidence: aiResponse.data.confidence
      });

          // =============================================================
          // GATING LOGIC: Check if the image was filtered by Model B
          // =============================================================
          if (aiResponse.data.status === 'Filtered by Binary Model') {
            console.log('AI Gating: Image identified as "Not a Plant". Aborting DB insert.');
            
            // Return immediate filtered response (No DB interaction)
            return res.json({
                success: true,
                data: {
                    species: 'Not a Plant',
                    confidence: parseFloat(aiResponse.data.confidence) || 0,
                    status: 'Filtered by Binary Model',
                    scientificName: null,
                    commonNames: [],
                    conservationStatus: 'N/A',
                    isEndangered: false,
                    alternatives: [],
                },
            });
        }

      // SUCCESS CONDITION: Only proceed if it was NOT filtered and we have data
      if (aiResponse.data && aiResponse.data.species) {
        console.log('**SUCCESS PATH: Proceeding to DB insert.**'); // CRITICAL LOG
            
        // Get top prediction and alternatives
        const species = aiResponse.data.species;
        // Ensure confidence is in valid range [0, 100]
        let confidence = parseFloat(aiResponse.data.confidence) || 0;
        confidence = Math.max(0, Math.min(100, confidence)); // Clamp to [0, 100]
        const topPredictions = aiResponse.data.top_predictions || aiResponse.data.alternatives || [];

        // Get info from database for main species
        const pool = await db();
        
        // Handle "Begonias" vs "Begonia" inconsistency
        const dbSpecies = species === 'Begonias' ? 'Begonia' : species;
        
        const [speciesInfo] = await pool.execute(
          `SELECT 
            plant_classification_id,
            scientific_name, 
            common_name, 
            family,
            conservation_status,
            is_endangered,
            native_region
          FROM plant_classifications 
          WHERE species = ? OR species = ? OR scientific_name = ?
          LIMIT 1`,
          [species, dbSpecies, species]
        );

        // IMPORTANT: The following database inserts (plant_images, ai_predictions)
              
        console.log(`**Executing INSERT INTO plant_images**`); // CRITICAL LOG
              
        const [imageResult] = await pool.execute(
          `INSERT INTO plant_images (image_url, uploaded_at)
          VALUES (?, NOW())`,
          [null] // You do not have the real upload here; front-end handles that
        );

        const plantImageId = imageResult.insertId;

        const plantClassificationId =
        speciesInfo.length > 0 ? speciesInfo[0].plant_classification_id : null;

        console.log(`**Executing INSERT INTO ai_predictions**`); // CRITICAL LOG

        const [predictionResult] = await pool.execute(
          `INSERT INTO ai_predictions 
            (plant_image_id, user_id, plant_classification_id, model_id, confidence_score, prediction_time)
          VALUES (?, ?, ?, ?, ?, NOW())`,
          [
            plantImageId,
            req.user?.userId || null,
            plantClassificationId,
            1,          // model_id for the Python model
            confidence
          ]
        );

        const predictionId = predictionResult.insertId;
        console.log("AI Prediction saved with predictionId:", predictionId);

        // Get alternative species details (exclude the identified species to avoid duplicates)
        const alternatives = [];
        if (topPredictions.length > 0) {
          for (let i = 0; i < Math.min(3, topPredictions.length); i++) {
            const alt = topPredictions[i];
            const altSpecies = alt.species || alt.name;
            if (altSpecies === species) continue;

            let altConfidence = parseFloat(alt.confidence || alt.probability) || 0;
            altConfidence = Math.max(0, Math.min(100, altConfidence));
            const altDbSpecies = altSpecies === 'Begonias' ? 'Begonia' : altSpecies;
            
            const [altInfo] = await pool.execute(
              `SELECT 
                plant_classification_id,
                species,
                scientific_name,
                common_name,
                conservation_status,
                is_endangered
              FROM plant_classifications 
              WHERE species = ? OR species = ? OR scientific_name = ?
              LIMIT 1`,
              [altSpecies, altDbSpecies, altSpecies]
            );
            
            if (altInfo.length > 0) {
              // Generate image URL from AI training dataset
              // Use first available image for this species
              const fs = require('fs');
              const path = require('path');
              const datasetPath = path.join(__dirname, '..', '..', '..', 'ai', 'retraining', 'test', 'dataset_split', 'train');
              
              let imageUrl = null;
              try {
                const speciesFolder = path.join(datasetPath, altInfo[0].species);
                if (fs.existsSync(speciesFolder)) {
                  const files = fs.readdirSync(speciesFolder)
                    .filter(file => file.endsWith('.jpg') || file.endsWith('.jpeg') || file.endsWith('.png'));
                  
                  if (files.length > 0) {
                    // Generate full URL for first image
                    const protocol = 'http';
                    const host = req.get('host') || 'localhost:8080';
                    imageUrl = `${protocol}://${host}/ai-images/${altInfo[0].species}/${files[0]}`;
                  }
                }
              } catch (err) {
                console.error(`Error loading image for alternative ${altInfo[0].species}:`, err.message);
              }
              
              alternatives.push({
                species: altInfo[0].species,
                scientificName: altInfo[0].scientific_name,
                commonName: altInfo[0].common_name,
                confidence: altConfidence,
                conservationStatus: altInfo[0].conservation_status,
                isEndangered: Boolean(altInfo[0].is_endangered),
                imageUrl: imageUrl,
                plantClassificationId: altInfo[0].plant_classification_id
              });
            }
          }
        }

        const description = speciesInfo.length > 0 
          ? `${speciesInfo[0].common_name} (${speciesInfo[0].scientific_name}) is a plant species found in ${speciesInfo[0].native_region || 'Sarawak, Malaysia'}.`
          : `${species.replace(/_/g, ' ')} is a plant species found in Sarawak.`;

        res.json({
          success: true,
          data: {
            predictionId: predictionId,
            plantImageId: plantImageId, 
            species: species,
            confidence: confidence,
            description: description,
            scientificName: speciesInfo.length > 0 ? speciesInfo[0].scientific_name : species,
            commonNames: speciesInfo.length > 0 ? [speciesInfo[0].common_name] : [],
            conservationStatus: speciesInfo.length > 0 ? speciesInfo[0].conservation_status : 'Unknown',
            isEndangered: speciesInfo.length > 0 ? Boolean(speciesInfo[0].is_endangered) : false,
            family: speciesInfo.length > 0 ? speciesInfo[0].family : 'Unknown',
            nativeRegion: speciesInfo.length > 0 ? speciesInfo[0].native_region : 'Sarawak, Malaysia',
            alternatives: alternatives,
            status: 'success',
          }
        });
      } else {
        // This 'else' catches cases where the status wasn't 'Filtered' but the prediction data was invalid/missing.
        console.error('AI server returned an ambiguous response (not filtered, but no valid species).');
        return res.status(500).json({
          success: false,
          error: 'AI server did not return valid identification data'
        });
      }
    } catch (aiError) {
      console.error('AI Server Error:', aiError.message);
      console.log('  AI Server not available at:', AI_SERVER_URL);
      console.log('  To enable real AI predictions:');
      console.log('   1. cd SmartPlantSarawak/ai/retraining/test/app');
      console.log('   2. python app.py');
      console.log('   3. Server should start on port 5000');
      
      // Return demo/fallback with alternatives from database
      const pool = await db();
      
      // Get 3 random species as demo alternatives
      const [alternatives] = await pool.query(`
        SELECT 
          plant_classification_id,
          species,
          scientific_name,
          common_name,
          conservation_status,
          is_endangered,
          (SELECT image_url FROM plant_images WHERE plant_classification_id = plant_classifications.plant_classification_id LIMIT 1) as image_url
        FROM plant_classifications 
        WHERE species != 'Nepenthes'
        ORDER BY RAND()
        LIMIT 3
      `);
      
      return res.json({
        success: true,
        data: {
          species: 'Nepenthes',
          confidence: 85,
          description: 'This appears to be a Nepenthes (Pitcher Plant), a carnivorous plant native to Borneo.',
          scientificName: 'Nepenthes spp.',
          commonNames: ['Pitcher Plant', 'Tropical Pitcher Plant'],
          conservationStatus: 'Vulnerable',
          isEndangered: false,
          habitat: 'Highland and lowland forests, peat swamps',
          characteristics: 'Carnivorous plant with pitcher-shaped traps, diverse species across Borneo',
          uses: 'Horticulture, insect control, research',
          threats: 'Overcollection, habitat degradation',
          family: 'Nepenthaceae',
          alternatives: alternatives.map(alt => ({
            species: alt.species,
            scientificName: alt.scientific_name,
            commonName: alt.common_name,
            confidence: Math.floor(Math.random() * 20) + 60, // Random 60-80%
            conservationStatus: alt.conservation_status,
            isEndangered: Boolean(alt.is_endangered),
            imageUrl: alt.image_url,
            plantClassificationId: alt.plant_classification_id
          }))
        },
        note: 'Demo mode - AI server unavailable. Start AI server for real predictions.'
      });
    }
  } catch (error) {
    console.error('Error in plant identification:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to identify plant'
    });
  }
};

module.exports = {
  identifyPlant
};
