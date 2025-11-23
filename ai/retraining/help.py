import mysql.connector
import os
import random
from datetime import datetime
from PIL import Image
import io

# ----------------------------
# CONFIG
# ----------------------------
DB_CONFIG = {
    "host": "localhost",
    "user": "root",
    "password": "",
    "database": "smartplantctip"
}

BASE_DIR = os.path.dirname(os.path.abspath(__file__))  # root folder of unzipped zip
# Updated paths to match actual project structure: ai/retraining/app/
IMAGE_FOLDER = os.path.join(BASE_DIR, "app", "uploads")
SPECIES_ID = 18
USER_ID = 1
FEEDBACK_COUNT = 95  # total feedback rows

# Compression settings
MAX_WIDTH = 800
MAX_HEIGHT = 800
JPEG_QUALITY = 50  # 1–100

# ----------------------------
# CONNECT TO DATABASE
# ----------------------------
try:
    db = mysql.connector.connect(**DB_CONFIG)
    cursor = db.cursor()
    print("Database connection successful")
except Exception as e:
    print(f"Database connection failed: {e}")
    exit(1)

# ----------------------------
# DYNAMIC DATASET INSERT
# ----------------------------
RETRAIN_DIR = os.path.join(BASE_DIR, "app", "retrain", "merged_datasets")
# Check for v1 subdirectory (common structure)
RETRAIN_DIR_V1 = os.path.join(RETRAIN_DIR, "v1")
if os.path.exists(RETRAIN_DIR_V1):
    RETRAIN_DIR = RETRAIN_DIR_V1

# Create directory if it doesn't exist
os.makedirs(RETRAIN_DIR, exist_ok=True)

# Check if directory exists and has files
if not os.path.exists(RETRAIN_DIR):
    print(f"Warning: RETRAIN_DIR does not exist: {RETRAIN_DIR}")
    print("   Creating directory...")
    os.makedirs(RETRAIN_DIR, exist_ok=True)

try:
    dataset_files = [f for f in os.listdir(RETRAIN_DIR) if os.path.isfile(os.path.join(RETRAIN_DIR, f))]
    # Count total images in subdirectories if it's a directory structure
    total_images = 0
    if dataset_files:
        # If files are in root, count them
        total_images = len(dataset_files)
    else:
        # Count images in subdirectories (class folders)
        for root, dirs, files in os.walk(RETRAIN_DIR):
            total_images += len([f for f in files if f.lower().endswith(('.jpg', '.jpeg', '.png'))])
except Exception as e:
    print(f"Warning: Could not read RETRAIN_DIR: {e}")
    dataset_files = []
    total_images = 0

dataset_path = RETRAIN_DIR.replace("\\", "/")
dataset_name = f"MergedDataset_v1"
dataset_version = 1
created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

# Check if dataset already exists, if so get its ID, otherwise insert
try:
    cursor.execute(
        """
        SELECT dataset_id FROM dataset_registry
        WHERE dataset_name = %s AND dataset_version = %s
        """,
        (dataset_name, dataset_version)
    )
    result = cursor.fetchone()
    if result:
        dataset_id = result[0]
        # Update the existing entry with current data
        cursor.execute(
            """
            UPDATE dataset_registry
            SET total_images = %s, dataset_path = %s
            WHERE dataset_id = %s
            """,
            (total_images, dataset_path, dataset_id)
        )
        db.commit()
        print(f"Updated existing dataset_registry entry (dataset_id={dataset_id})")
    else:
        cursor.execute(
            """
            INSERT INTO dataset_registry
            (dataset_name, dataset_version, total_images, created_at, dataset_path)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (dataset_name, dataset_version, total_images, created_at, dataset_path)
        )
        dataset_id = cursor.lastrowid
        db.commit()
        print(f"Inserted dataset_registry entry (dataset_id={dataset_id})")
except Exception as e:
    print(f"Failed to insert/update dataset_registry: {e}")
    db.rollback()
    dataset_id = None

# ----------------------------
# DYNAMIC MODEL INSERT
# ----------------------------
MODEL_DIR = os.path.join(BASE_DIR, "app", "model")
os.makedirs(MODEL_DIR, exist_ok=True)

try:
    model_files = [f for f in os.listdir(MODEL_DIR) if f.endswith(".keras")]
    if not model_files:
        print(f"Warning: No .keras model files found in {MODEL_DIR}")
        model_id = None
    else:
        model_file = max(model_files, key=lambda f: os.path.getmtime(os.path.join(MODEL_DIR, f)))
        model_path = os.path.join(MODEL_DIR, model_file).replace("\\", "/")
        model_name = os.path.splitext(model_file)[0]
        # Extract version from filename if it exists (e.g., mobilenetv2_plant_model_v1.keras -> v1)
        if "_v" in model_name:
            version_part = model_name.split("_v")[-1]
            model_version = f"v{version_part}" if version_part.isdigit() else "v1"
        else:
            model_version = "v1"
        trained_on = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        val_accuracy = 0.87
        is_active = 1

        if dataset_id:
            cursor.execute(
                """
                INSERT INTO model_registry
                (model_name, model_version, dataset_id, trained_on, val_accuracy, is_active, model_path)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (model_name, model_version, dataset_id, trained_on, val_accuracy, is_active, model_path)
            )
            model_id = cursor.lastrowid
            db.commit()
            print(f"Inserted model_registry entry (model_id={model_id})")
        else:
            print("Skipping model_registry insert (no dataset_id)")
            model_id = None
except Exception as e:
    print(f"Failed to insert model_registry: {e}")
    db.rollback()
    model_id = None

# ----------------------------
# INSERT ALL IMAGES (COMPRESSED)
# ----------------------------
os.makedirs(IMAGE_FOLDER, exist_ok=True)

try:
    image_files = sorted([f for f in os.listdir(IMAGE_FOLDER) 
                         if f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp'))])
    plant_image_ids = []

    if not image_files:
        print(f"Warning: No image files found in {IMAGE_FOLDER}")
    else:
        for img_file in image_files:
            img_path = os.path.join(IMAGE_FOLDER, img_file)
            if not os.path.isfile(img_path):
                continue

            try:
                with Image.open(img_path) as img:
                    img = img.convert("RGB")
                    img.thumbnail((MAX_WIDTH, MAX_HEIGHT))
                    buffer = io.BytesIO()
                    img.save(buffer, format="JPEG", quality=JPEG_QUALITY)
                    img_blob = buffer.getvalue()
                    img_size = len(img_blob)

                cursor.execute(
                    """
                    INSERT INTO plant_images (user_id, image_data, image_size)
                    VALUES (%s, %s, %s)
                    """,
                    (USER_ID, img_blob, img_size)
                )
                plant_image_ids.append(cursor.lastrowid)
            except Exception as e:
                print(f"Warning: Failed to process image {img_file}: {e}")
                continue

        db.commit()
        print(f"Inserted {len(plant_image_ids)} compressed plant_images.")
except Exception as e:
    print(f"Failed to insert images: {e}")
    db.rollback()
    plant_image_ids = []

# ----------------------------
# INSERT AI PREDICTIONS (model_id dynamic)
# ----------------------------
prediction_ids = []

if not plant_image_ids:
    print("Warning: No plant images to create predictions for")
elif not model_id:
    print("Warning: No model_id available, skipping predictions")
else:
    for pid in plant_image_ids:
        confidence = round(random.uniform(0.85, 0.99), 2)
        try:
            cursor.execute(
                """
                INSERT INTO ai_predictions
                (plant_image_id, user_id, plant_classification_id, confidence_score, model_id)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (pid, USER_ID, SPECIES_ID, confidence, model_id)
            )
            prediction_ids.append(cursor.lastrowid)
        except Exception as e:
            print(f"Warning: Failed to insert prediction for image {pid}: {e}")
            continue

    db.commit()
    print(f"Inserted {len(prediction_ids)} ai_predictions with model_id={model_id}.")

# ----------------------------
# INSERT FEEDBACK FOR RANDOM PREDICTIONS
# ----------------------------
if not prediction_ids:
    print("Warning: No predictions to create feedback for")
else:
    feedback_count = min(FEEDBACK_COUNT, len(prediction_ids))
    feedback_sample = random.sample(prediction_ids, feedback_count)

    for pred_id in feedback_sample:
        try:
            cursor.execute(
                """
                INSERT INTO prediction_feedback
                (prediction_id, user_id, initial_status, confirmed_status, feedback)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (pred_id, USER_ID, "Verified", "Verified", f"Feedback for prediction {pred_id}")
            )
        except Exception as e:
            print(f"Warning: Failed to insert feedback for prediction {pred_id}: {e}")
            continue

    db.commit()
    print(f"Inserted {len(feedback_sample)} feedback rows.")

# ----------------------------
# UPDATE TOP 10 FEEDBACK STATUS
# Step 1: All rows Verified
# Step 2: Top 10, pick 5 flagged randomly, add reviewed_by=3, reviewed_at=now
# ----------------------------
try:
    cursor.execute("SELECT feedback_id FROM prediction_feedback ORDER BY feedback_id ASC LIMIT 10")
    top_10_ids = [row[0] for row in cursor.fetchall()]
    
    if top_10_ids:
        flagged_count = min(5, len(top_10_ids))
        flagged_ids = random.sample(top_10_ids, flagged_count)

        for fid in top_10_ids:
            status = "Flagged" if fid in flagged_ids else "Verified"
            confirmed_status = None if fid in flagged_ids else "Verified"
            feedback_text = f"Review feedback for {fid}"
            reviewed_by = 3
            reviewed_at = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

            cursor.execute(
                """
                UPDATE prediction_feedback
                SET initial_status=%s,
                    confirmed_status=%s,
                    feedback=%s,
                    reviewed_by=%s,
                    reviewed_at=%s
                WHERE feedback_id=%s
                """,
                (status, confirmed_status, feedback_text, reviewed_by, reviewed_at, fid)
            )

        db.commit()
        print(f"Updated {len(top_10_ids)} feedback rows with random Flagged status and review info.")
    else:
        print("Warning: No feedback rows found to update")
except Exception as e:
    print(f"Failed to update feedback rows: {e}")
    db.rollback()

# ----------------------------
# CLEANUP
# ----------------------------
cursor.close()
db.close()

print("\n Helper script complete: dataset, model, images, predictions, and feedback inserted dynamically!")