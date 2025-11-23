# ============================================================================
# SMARTPLANT SARAWAK - AI PREDICTION SERVER (Flask) 
# ============================================================================

# PURPOSE:
# Flask-based web server that provides plant identification API using a 
# sequential prediction pipeline: Binary Filter (Model B) -> Multi-class Classifier (Model A).

# ============================================================================
# SECTION 1: IMPORTS
# ============================================================================

from flask import Flask, request, jsonify
from flask_cors import CORS
import tensorflow as tf
import numpy as np
import base64
from io import BytesIO
from PIL import Image
import os
import traceback  # Added for better error logging

# ============================================================================
# SECTION 2: FLASK APP INITIALIZATION
# ============================================================================

app = Flask(__name__)
CORS(app)

# ============================================================================
# SECTION 3: MODEL & LABELS LOADING (MODIFIED)
# ============================================================================

# Define paths for both models
# Priority: plant_model_v1.keras (working) > mobilenetv2_plant_model.keras (may be broken)
MODEL_DIR = os.path.join(os.path.dirname(__file__), 'model')
V1_MODEL_PATH = os.path.join(MODEL_DIR, 'plant_model_v1.keras')
BASE_MODEL_PATH = os.path.join(MODEL_DIR, 'mobilenetv2_plant_model.keras')
MODEL_B_PATH = os.path.join(MODEL_DIR, 'plant_detector.keras')  # Binary Filter Model (Model B)
CLASS_LABELS_PATH = os.path.join(MODEL_DIR, 'class_labels.txt')

# Global variables for both models
model_a = None  # Original Plant Identification Model
model_b = None  # New Binary Filter Model

# Display startup banner
print("=" * 60)
print(" SmartPlant AI Server - Starting...")
print("=" * 60)

# Load class labels from text file
try:
    with open(CLASS_LABELS_PATH, 'r') as f:
        class_labels = [line.strip() for line in f.readlines()]
    print(f" Loaded {len(class_labels)} class labels.")
except Exception as e:
    # Fallback
    print(f" Error loading class labels: {e}")
    print("  Using fallback class labels")
    class_labels = [
    'Arundina_graminifolia', 
    'Avicennia', 
    'Begonias', 
    'Bulbophyllum longissimum', 
    'Bulbophyllum_beccarii', 
    'Bulbophyllum_dearei', 
    'Coelogyne_pandurata', 
    'Dendrobium pulchellum', 
    'Grammatophyllum speciosum', 
    'Nepenthes', 
    'Phalaenopsis violacea', 
    'Phalaenopsis_bellina', 
    'Rafflesia', 
    'Renanthera_imschootiana', 
    'Rhododendron', 
    'Rhynchostylis_retusa', 
    'Shorea_smithiana'
]
    
# Load Model A (Original Plant ID) - Try plant_model_v1.keras first, then fallback
model_a = None
model_a_path = None

# Strategy 1: Try plant_model_v1.keras (working retrained model)
if os.path.exists(V1_MODEL_PATH):
    try:
        model_a = tf.keras.models.load_model(V1_MODEL_PATH)
        model_a_path = V1_MODEL_PATH
        print(f"   Model A (Plant ID) loaded successfully from: plant_model_v1.keras")
        print(f"   Model A input shape: {model_a.input_shape}")
        print(f"   Model A output shape: {model_a.output_shape}")
    except Exception as e:
        print(f"   Error loading plant_model_v1.keras: {e}")
        print(f"   Trying fallback model...")
        model_a = None

# Strategy 2: Fallback to mobilenetv2_plant_model.keras if v1 failed
if model_a is None and os.path.exists(BASE_MODEL_PATH):
    try:
        model_a = tf.keras.models.load_model(BASE_MODEL_PATH)
        model_a_path = BASE_MODEL_PATH
        print(f"   Model A (Plant ID) loaded successfully from: mobilenetv2_plant_model.keras")
        print(f"   Model A input shape: {model_a.input_shape}")
        print(f"   Model A output shape: {model_a.output_shape}")
    except Exception as e:
        print(f"   Error loading mobilenetv2_plant_model.keras: {e}")
        model_a = None

# Try mobilenetv2_plant_model_v1.keras 
if model_a is None:
    V1_ALT_MODEL_PATH = os.path.join(MODEL_DIR, 'mobilenetv2_plant_model_v1.keras')
    if os.path.exists(V1_ALT_MODEL_PATH):
        try:
            model_a = tf.keras.models.load_model(V1_ALT_MODEL_PATH)
            model_a_path = V1_ALT_MODEL_PATH
            print(f"   Model A (Plant ID) loaded successfully from: mobilenetv2_plant_model_v1.keras")
            print(f"   Model A input shape: {model_a.input_shape}")
            print(f"   Model A output shape: {model_a.output_shape}")
        except Exception as e:
            print(f"   Error loading mobilenetv2_plant_model_v1.keras: {e}")
            model_a = None

# Strategy 3: Try to find any other plant model
if model_a is None:
    try:
        # Look for files starting with 'plant_model_' or 'mobilenetv2_plant_model_'
        model_files = [f for f in os.listdir(MODEL_DIR) 
                      if (f.startswith('plant_model_') or f.startswith('mobilenetv2_plant_model_')) 
                      and f.endswith('.keras') 
                      and f != 'plant_detector.keras']  # Exclude Model B
        if model_files:
            model_files.sort()
            alt_model_path = os.path.join(MODEL_DIR, model_files[-1])
            try:
                model_a = tf.keras.models.load_model(alt_model_path)
                model_a_path = alt_model_path
                print(f"   Model A (Plant ID) loaded from alternative: {model_files[-1]}")
                print(f"   Model A input shape: {model_a.input_shape}")
                print(f"   Model A output shape: {model_a.output_shape}")
            except Exception as e:
                print(f"   Error loading alternative model: {e}")
                model_a = None
    except Exception as e:
        print(f"   Could not search for alternative models: {e}")

if model_a is None:
    print(f"   ERROR: Model A could not be loaded from any available model file")
    print(f"   Server will start but predictions will fail (503 error)")

# Load Model B (Binary Filter)
try:
    model_b = tf.keras.models.load_model(MODEL_B_PATH)
    print(f"   Model B (Binary Filter) loaded successfully from: {MODEL_B_PATH}")
    print(f"   Model B input shape: {model_b.input_shape}")
    print(f"   Model B output shape: {model_b.output_shape}")
except Exception as e:
    print(f" Error loading Model B: {e}")
    model_b = None

# Display ready message
print("=" * 60)
print("   Server ready to accept requests on http://localhost:5000")
print("   Use POST /predict with base64 image for plant identification (Gated)")
print("=" * 60)

# ============================================================================
# SECTION 4: IMAGE PREPROCESSING FUNCTION
# ============================================================================

def preprocess_image(image_data):
    try:
        # Step 1: Decode base64 string to raw image bytes
        if ',' in image_data:
            image_data = image_data.split(',')[1]

        img_bytes = base64.b64decode(image_data)

        # Step 2: Convert raw bytes to PIL Image object
        img = Image.open(BytesIO(img_bytes))

        # Step 3: Ensure image is in RGB format
        if img.mode != 'RGB':
            img = img.convert('RGB')

        # Step 4: Resize image to model's expected input dimensions
        img = img.resize((224, 224))

        # Step 5: Convert PIL Image to numpy array
        img_array = np.array(img, dtype=np.float32)

        # Step 6: Add batch dimension
        img_array = np.expand_dims(img_array, axis=0)

        # Step 7: Apply MobileNetV2-specific preprocessing
        img_array = tf.keras.applications.mobilenet_v2.preprocess_input(img_array)

        return img_array

    except Exception as e:
        print(f" Error in preprocess_image: {e}")
        raise

# ============================================================================
# SECTION 5: PREDICTION ENDPOINT
# ============================================================================

@app.route('/predict', methods=['POST'])
def predict():
    try:
        # Step 1 & 2: Get JSON data and validate
        data = request.get_json()
        if not data or 'image' not in data:
            return jsonify({'error': 'No image data provided'}), 400

        # Step 3: Check if BOTH models were loaded successfully
        if model_a is None or model_b is None:
            return jsonify({
                'error': 'AI services are unavailable (Models not loaded)'
            }), 503  # Service Unavailable

        # Step 4: Preprocess the base64 image (Input for Model B)
        print("\n" + "=" * 60)
        print(" New prediction request received")
        img_array = preprocess_image(data['image'])
        print(" Image preprocessed successfully")

        # GATING STEP 1: Run Model B (Binary Filter)
        print(f" Running Model B (Binary Filter, shape {model_b.output_shape})...")
        binary_prediction = model_b.predict(img_array, verbose=0)

        # Interpretation of Binary Prediction
        is_plant_threshold = 0.8  # Define confidence threshold (e.g., 80%)

        if binary_prediction.shape[-1] == 1:
            # Assuming sigmoid output where 1 is 'Plant' and 0 is 'Not Plant'
            plant_score = binary_prediction[0][0]
            is_plant = plant_score >= is_plant_threshold
        elif binary_prediction.shape[-1] > 1:
            # Assuming softmax output where index 1 is the 'Plant' class
            plant_score = binary_prediction[0][1]  # Adjust index if needed
            is_plant = np.argmax(binary_prediction[0]) == 1  # Check if 'Plant' is the max class

        plant_confidence = float(plant_score) * 100

        # GATING STEP 2: Decision
        if not is_plant:
            print(f" Gating decision: NOT a plant ({plant_confidence:.1f}% confidence). Aborting Model A.")
            print("=" * 60 + "\n")

            # Return filtered response
            return jsonify({
                'species': 'Not a Plant',
                'confidence': plant_confidence,
                'top_predictions': [],
                'status': 'Filtered by Binary Model'
            })

        # GATING STEP 3: Run Model A (Original Plant ID)
        print(f" Gating decision: IS a plant. Proceeding to Model A.")
        predictions = model_a.predict(img_array, verbose=0)
        predicted_class_idx = np.argmax(predictions[0])
        confidence = float(predictions[0][predicted_class_idx]) * 100

        # Get species name from predicted index
        species = class_labels[predicted_class_idx]

        # Get top 3 predictions for alternative suggestions
        top_3_idx = np.argsort(predictions[0])[-3:][::-1]
        top_predictions = [
            {
                'species': class_labels[idx],
                'confidence': float(predictions[0][idx]) * 100
            }
            for idx in top_3_idx
        ]

        # Build response object
        result = {
            'species': species,
            'confidence': confidence,
            'top_predictions': top_predictions,
            'status': 'success'
        }

        # Log prediction results to console
        print(f" Prediction: {species} ({confidence:.1f}% confidence)")
        top_3_str = ', '.join(["{} ({:.1f}%)".format(p['species'], p['confidence']) for p in top_predictions])
        print(f"   Top 3: {top_3_str}")
        print("=" * 60 + "\n")

        # Return JSON response to backend
        return jsonify(result)

    except Exception as e:
        # Handle any errors during prediction process
        print(f" Error during prediction: {str(e)}")
        traceback.print_exc()
        return jsonify({
            'error': str(e)
        }), 500

@app.route('/health', methods=['GET'])
def health():
    """
    Health Check Endpoint
    """
    both_models_loaded = model_a is not None and model_b is not None
    return jsonify({
        'status': 'healthy' if both_models_loaded else 'partial_failure',
        'model_a_loaded': model_a is not None,
        'model_b_loaded': model_b is not None,
        'num_classes': len(class_labels)
    })

@app.route('/', methods=['GET'])
def home():
    """
    Home/Information Endpoint
    """
    return jsonify({
        'message': 'SmartPlant AI Server - Gated Prediction Pipeline',
        'version': '3.1 (Gated)',
        'model_a_plant_id_loaded': model_a is not None,
        'model_b_binary_filter_loaded': model_b is not None,
        'num_species': len(class_labels),
        'endpoints': {
            '/predict': 'POST - Identify plant (Gated: Model B runs first)',
            '/health': 'GET - Health check and model status',
            '/': 'GET - This information message'
        },
        'preprocessing': 'MobileNetV2 ([-1, 1] range)',
        'framework': 'Flask + TensorFlow 2.16.1'
    })

if __name__ == '__main__':
    """
    Server Startup
    """
    # Running on localhost for development, change to '0.0.0.0' for external access
    app.run(host='localhost', port=5000, debug=True)