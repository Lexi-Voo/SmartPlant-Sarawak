# ============================================================================
# SECTION 1: IMPORTS & ENV
# ============================================================================
import os
import shutil
import uuid
import sys
import mysql.connector
from datetime import datetime
import collections

# Load environment variables from .env file (if exists)
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# Suppress verbose TF logging (INFO). Keep warnings/errors visible.
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"

from tensorflow.keras.preprocessing import image_dataset_from_directory
from tensorflow.keras.applications import MobileNetV2
from tensorflow.keras.applications.mobilenet_v2 import preprocess_input
from tensorflow.keras.models import Sequential, load_model
from tensorflow.keras.layers import Dense, GlobalAveragePooling2D, Dropout
from tensorflow.keras.optimizers import Adam
from tensorflow.keras import layers
from tensorflow.keras.callbacks import EarlyStopping, ModelCheckpoint

# ============================================================================
# SECTION 2: PATHS & CONFIGURATION
# ============================================================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# original curated dataset (train/val/test)
DATASET_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "..", "dataset_split"))
UPLOADS_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "uploads"))

# where models are stored
MODEL_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "model"))
os.makedirs(MODEL_DIR, exist_ok=True)

# where versioned merged datasets will be stored (we keep them)
MERGED_ROOT = os.path.join(BASE_DIR, "merged_datasets")
os.makedirs(MERGED_ROOT, exist_ok=True)

# path to class labels txt (updated per run)
LABEL_PATH = os.path.join(MODEL_DIR, "class_labels.txt")

# Training hyperparameters (tweak for production)
IMG_SIZE = (224, 224)
BATCH_SIZE = 8
EPOCHS = 12   
VALIDATION_SPLIT = 0.2   

# Minimum number of verified images required to trigger retrain
MIN_VERIFIED_IMAGES = 200

# ============================================================================
# SECTION 3: DATABASE CONNECTION
# ============================================================================
# Get database configuration from environment variables or use defaults
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_USER = os.getenv("DB_USER", "root")
DB_PASS = os.getenv("DB_PASS", "")
DB_NAME = os.getenv("DB_NAME", "SmartPlantCTIP")
DB_PORT = int(os.getenv("DB_PORT", "3306"))

db = mysql.connector.connect(
    host=DB_HOST,
    user=DB_USER,
    password=DB_PASS,
    database=DB_NAME,
    port=DB_PORT
)
cursor = db.cursor()
print(f"Connected to database: {DB_NAME} at {DB_HOST}:{DB_PORT}")

# ============================================================================
# SECTION 4: LOAD PREVIOUS CLASS LABELS
# ============================================================================
previous_class_names = []
if os.path.exists(LABEL_PATH):
    with open(LABEL_PATH, "r", encoding="utf-8") as f:
        previous_class_names = [line.strip() for line in f.readlines() if line.strip()]

print(f"Previous model had {len(previous_class_names)} known species")

# ============================================================================
# SECTION 5: CREATE NEW MERGED DATASET VERSION (DO NOT DELETE OLD ONES)
#  - will copy known classes from base train + add verified uploads
# ============================================================================
# determine next dataset_version
cursor.execute("SELECT dataset_version FROM dataset_registry ORDER BY dataset_id DESC LIMIT 1")
row = cursor.fetchone()
next_dataset_version = (row[0] + 1) if row and row[0] else 1
dataset_version_name = f"v{next_dataset_version}"

# create versioned folder 
MERGED_DIR = os.path.join(MERGED_ROOT, dataset_version_name)
os.makedirs(MERGED_DIR, exist_ok=True)
print(f" Creating/using merged dataset folder: {MERGED_DIR}")

# Step 1: copy base dataset (only classes known to previous model) into this version folder
train_base_dir = os.path.join(DATASET_DIR, "train")
if os.path.exists(train_base_dir):
    for class_name in os.listdir(train_base_dir):
        if not previous_class_names or class_name in previous_class_names:
            src = os.path.join(train_base_dir, class_name)
            dst = os.path.join(MERGED_DIR, class_name)
            os.makedirs(dst, exist_ok=True)
            for fname in os.listdir(src):
                src_path = os.path.join(src, fname)
                dst_path = os.path.join(dst, f"{uuid.uuid4().hex}_{fname}")
                shutil.copy(src_path, dst_path)

cursor.execute("""
    SELECT pi.plant_image_id, pc.species, pi.image_data
    FROM plant_images pi
    INNER JOIN ai_predictions ap
        ON pi.plant_image_id = ap.plant_image_id
    INNER JOIN plant_classifications pc
        ON ap.plant_classification_id = pc.plant_classification_id
    LEFT JOIN prediction_feedback pf
        ON ap.prediction_id = pf.prediction_id
    WHERE pf.confirmed_status = 'Verified'
       OR pf.feedback_id IS NULL
""")
rows = cursor.fetchall()
verified_count = len(rows)

# Check if merged dataset already has images (from base dataset copy above)
merged_dataset_has_images = False
if os.path.exists(MERGED_DIR):
    total_merged_images = 0
    for root, dirs, files in os.walk(MERGED_DIR):
        total_merged_images += len([f for f in files if f.lower().endswith(('.jpg', '.jpeg', '.png'))])
    if total_merged_images > 0:
        merged_dataset_has_images = True
        print(f"Found existing merged dataset with {total_merged_images} images")

if verified_count < MIN_VERIFIED_IMAGES and not merged_dataset_has_images:
    print(f"Only {verified_count} verified/new images found. Retraining skipped (minimum {MIN_VERIFIED_IMAGES}).")
    print(f"No existing merged dataset found. Add verified images or lower MIN_VERIFIED_IMAGES threshold.")
    # nothing changed on DB, close and exit cleanly
    cursor.close()
    db.close()
    sys.exit(0)
elif verified_count < MIN_VERIFIED_IMAGES and merged_dataset_has_images:
    print(f"Only {verified_count} verified/new images found (minimum {MIN_VERIFIED_IMAGES}).")
    print(f"However, existing merged dataset found with images. Continuing with retraining using existing dataset...")

# write verified images into dataset folder
for plant_image_id, species, image_blob in rows:
    species_dir = os.path.join(MERGED_DIR, species)
    os.makedirs(species_dir, exist_ok=True)
    image_path = os.path.join(species_dir, f"{uuid.uuid4().hex}.jpg")
    with open(image_path, "wb") as g:
        g.write(image_blob)


# ============================================================================
# REGISTER THE MERGED DATASET IN dataset_registry
# ============================================================================
# count files
total_images = 0
for _, _, files in os.walk(MERGED_DIR):
    total_images += len(files)

# insert dataset_registry record
cursor.execute("""
    INSERT INTO dataset_registry
    (dataset_name, dataset_version, total_images, dataset_path, created_at)
    VALUES (%s, %s, %s, %s, %s)
""", (
    f"MergedDataset_{dataset_version_name}",
    next_dataset_version,
    total_images,
    MERGED_DIR,
    datetime.now().strftime("%Y-%m-%d %H:%M:%S")
))
db.commit()

# retrieve dataset_id (last inserted)
dataset_id = cursor.lastrowid

# ============================================================================
# SECTION 6: LOAD MERGED DATASET (train/validation split)
# ============================================================================
raw_train_ds = image_dataset_from_directory(
    MERGED_DIR,
    image_size=IMG_SIZE,
    batch_size=BATCH_SIZE,
    shuffle=True,
    validation_split=VALIDATION_SPLIT,
    subset="training",
    seed=42
)
val_ds = image_dataset_from_directory(
    MERGED_DIR,
    image_size=IMG_SIZE,
    batch_size=BATCH_SIZE,
    shuffle=True,
    validation_split=VALIDATION_SPLIT,
    subset="validation",
    seed=42
)

class_names = raw_train_ds.class_names
num_classes = len(class_names)
print(f"Detected {num_classes} classes in merged dataset")

# ============================================================================
# SECTION 7: CLASS BALANCING (compute class counts & weights)
# ============================================================================
def get_class_counts(ds):
    cnt = collections.Counter()
    for _, labels in ds.unbatch():
        cnt[int(labels.numpy())] += 1
    return cnt

class_counts = get_class_counts(raw_train_ds)
total_samples = sum(class_counts.values())
class_weights = {i: total_samples / (num_classes * count) for i, count in class_counts.items()}


# ============================================================================
# SECTION 8: UPDATE LABELS AND DETECT NEW CLASSES
# ============================================================================
cursor.execute("SELECT species FROM plant_classifications")
all_db_species = [r[0] for r in cursor.fetchall()]

current_classes = raw_train_ds.class_names
new_classes = [c for c in current_classes if c not in previous_class_names]
has_new_class = len(new_classes) > 0

if has_new_class:
    print(f"New classes detected: {new_classes} ")
else:
    print("No new classes detected ")

# update label file (merged view of previous labels, DB species and current classes)
updated_labels = sorted(set(previous_class_names + all_db_species + current_classes))
with open(LABEL_PATH, "w", encoding="utf-8") as f:
    f.write("\n".join(updated_labels))

# ============================================================================
# SECTION 9: DATA AUGMENTATION & PREPROCESSING
# ============================================================================
data_augmentation = Sequential([
    layers.RandomFlip("horizontal"),
    layers.RandomRotation(0.1),
    layers.RandomZoom(0.1),
])
train_ds = raw_train_ds.map(lambda x, y: (preprocess_input(data_augmentation(x)), y))
val_ds = val_ds.map(lambda x, y: (preprocess_input(x), y))

# ============================================================================
# SECTION 10: BUILD OR LOAD MODEL (robust)
#  - load existing model only if final Dense layer size matches num_classes
# ============================================================================
existing_models = [f for f in os.listdir(MODEL_DIR) if f.endswith(".keras")]
existing_models.sort()
latest_model_path = os.path.join(MODEL_DIR, existing_models[-1]) if existing_models else None

load_existing_model = False
if latest_model_path:
    try:
        temp_model = load_model(latest_model_path, compile=False)
        # last Dense output units (works for Sequential where last layer is Dense)
        old_num_classes = temp_model.layers[-1].units

        if old_num_classes == num_classes and not has_new_class:
            model = temp_model
            model.layers[0].trainable = True
            load_existing_model = True
            print(f"Loaded existing model for incremental retraining (classes match: {num_classes})")
        else:
            print(f"Model Building")
    except Exception as e:
        print(f"Building new model")

if not load_existing_model:
    # build fresh model (MobileNetV2 + GAP + Dropout + Dense(num_classes))
    base_model = MobileNetV2(input_shape=IMG_SIZE + (3,), include_top=False, weights="imagenet")
    base_model.trainable = True
    model = Sequential([
        base_model,
        GlobalAveragePooling2D(),
        Dropout(0.3),
        Dense(num_classes, activation="softmax")
    ])
    print(f"Built new model for {num_classes} classes")

# ============================================================================
# SECTION 11: COMPILE & TRAIN
# ============================================================================
model.compile(
    optimizer=Adam(learning_rate=1e-4),
    loss="sparse_categorical_crossentropy",
    metrics=["accuracy"]
)

# compute next model version
cursor.execute("SELECT model_version FROM model_registry ORDER BY model_id DESC LIMIT 1")
row = cursor.fetchone()
version_int = int(row[0].replace("v", "")) + 1 if row and row[0] else 1
version_name = f"v{version_int}"

# callbacks: save best checkpoint for this version
checkpoint_path = os.path.join(MODEL_DIR, f"mobilenetv2_plant_model_{version_name}.keras")
callbacks = [
    EarlyStopping(monitor="val_loss", patience=3, restore_best_weights=True),
    ModelCheckpoint(checkpoint_path, monitor="val_accuracy", save_best_only=True)
]

print(f"Training model version {version_name}")
history = model.fit(
    train_ds,
    validation_data=val_ds,
    epochs=EPOCHS,
    class_weight=class_weights,
    callbacks=callbacks
)

# final val_accuracy (last epoch)
val_accuracy = float(history.history["val_accuracy"][-1])
print(f"New Model val_accuracy: {val_accuracy:.2%}")

# ============================================================================
# SECTION 12: SAVE MODEL & UPDATE DATABASE (model_registry links to dataset_id)
# ============================================================================
model_filename = f"mobilenetv2_plant_model_{version_name}.keras"
model_path = os.path.join(MODEL_DIR, model_filename)
model.save(model_path)
print(f"Saved final model: {model_filename}")

# deactivate older models
cursor.execute("UPDATE model_registry SET is_active = 0")

# insert model_registry record and link dataset_id
cursor.execute("""
    INSERT INTO model_registry
    (model_name, model_version, model_path, trained_on, val_accuracy, is_active, dataset_id)
    VALUES (%s, %s, %s, %s, %s, %s, %s)
""", (
    f"MobileNetV2_Plant_Model_{version_name}",
    version_name,
    model_path,
    datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    val_accuracy,
    1,
    dataset_id
))
db.commit()
print(f"model_registry updated (model_version={version_name}, dataset_id={dataset_id})")

# mark retrained images (set retrained=1 for those used)
if rows:
    # rows = list of tuples (plant_image_id, species, image_data)
    retrain_ids = [str(r[0]) for r in rows if r and r[0] is not None]
    if retrain_ids:
        id_list_str = ",".join(retrain_ids)
        update_q = f"UPDATE plant_images SET retrained = 1 WHERE plant_image_id IN ({id_list_str})"
        cursor.execute(update_q)
        db.commit()

# ============================================================================
# SECTION 13: CLEANUP (DO NOT DELETE merged dataset; we keep versioned datasets)
# ============================================================================
# close DB connections
cursor.close()
db.close()

print("\nRETRAINING PRODUCTION COMPLETE!")
print(f"Saved dataset: {MERGED_DIR}")
print(f"Saved model:   {model_path}")