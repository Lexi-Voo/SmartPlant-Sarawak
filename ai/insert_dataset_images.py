"""
============================================================================
INSERT DATASET IMAGES INTO DATABASE
============================================================================

PURPOSE:
Inserts all images from the AI training dataset (train/test/val folders) 
into the plant_images table in the database.

FEATURES:
- Reads images from ai/retraining/dataset_split/train/, test/, and val/
- Maps species folder names to plant_classification_id
- Compresses images to reduce storage (800x800 max, JPEG quality 50)
- Inserts images as BLOB into plant_images table
- Marks images with retrained=1 flag
- Uses user_id=1 (admin) as the uploader

USAGE:
python insert_dataset_images.py

CONFIGURATION:
- DB_CONFIG: Database connection settings
- DATASET_BASE_DIR: Base directory for dataset folders
- MAX_WIDTH/MAX_HEIGHT: Image compression settings
- JPEG_QUALITY: Compression quality (1-100)
============================================================================
"""

import mysql.connector
import os
import sys
from PIL import Image
import io
from datetime import datetime

# ============================================================================
# CONFIGURATION
# ============================================================================

DB_CONFIG = {
    "host": "localhost",
    "user": "root",
    "password": "",
    "database": "smartplantctip"
}

# Base directory for dataset (relative to this script)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATASET_BASE_DIR = os.path.join(SCRIPT_DIR, "dataset_split")

# Image compression settings
MAX_WIDTH = 800
MAX_HEIGHT = 800
JPEG_QUALITY = 50  # 1-100, lower = smaller file size

# User ID to assign to all uploaded images (1 = admin)
USER_ID = 1

# ============================================================================
# SPECIES NAME MAPPING
# ============================================================================

def normalize_species_name(folder_name):
    """
    Normalize species folder name to match database species names.
    Handles variations like 'Grammatophyllum_speciosum_d4f1d8' -> 'Grammatophyllum_speciosum'
    """
    # Remove trailing hash/identifier if present (e.g., _d4f1d8)
    if '_' in folder_name:
        parts = folder_name.split('_')
        # Try to match known species patterns
        # If it looks like it has a hash suffix, try without it
        if len(parts) > 2 and len(parts[-1]) == 6 and parts[-1].isalnum():
            # Likely a hash suffix, try without it
            test_name = '_'.join(parts[:-1])
            return test_name
    return folder_name

# ============================================================================
# DATABASE CONNECTION
# ============================================================================

def get_db_connection():
    """Create and return database connection"""
    try:
        db = mysql.connector.connect(**DB_CONFIG)
        print("[OK] Database connection successful")
        return db
    except Exception as e:
        print(f"[ERROR] Database connection failed: {e}")
        exit(1)

def get_species_mapping(db):
    """
    Get mapping of species names to plant_classification_id from database
    Returns: dict {species_name: plant_classification_id}
    """
    cursor = db.cursor()
    cursor.execute("SELECT plant_classification_id, species FROM plant_classifications")
    results = cursor.fetchall()
    mapping = {row[1]: row[0] for row in results}
    cursor.close()
    print(f"[OK] Loaded {len(mapping)} species from database")
    return mapping

# ============================================================================
# IMAGE PROCESSING
# ============================================================================

def process_image(img_path):
    """
    Load, compress, and convert image to BLOB
    Returns: (image_blob, image_size, mime_type) or None if error
    """
    try:
        with Image.open(img_path) as img:
            # Convert to RGB if needed (handles RGBA, P, etc.)
            if img.mode != 'RGB':
                img = img.convert('RGB')
            
            # Resize/compress image
            img.thumbnail((MAX_WIDTH, MAX_HEIGHT), Image.Resampling.LANCZOS)
            
            # Convert to JPEG bytes
            buffer = io.BytesIO()
            img.save(buffer, format='JPEG', quality=JPEG_QUALITY, optimize=True)
            img_blob = buffer.getvalue()
            img_size = len(img_blob)
            
            return img_blob, img_size, 'image/jpeg'
    except Exception as e:
        print(f"  [WARNING] Failed to process {os.path.basename(img_path)}: {e}")
        return None

# ============================================================================
# DATASET SCANNING
# ============================================================================

def scan_dataset_folder(folder_path, species_mapping):
    """
    Scan a dataset folder (train/test/val) and return list of images to insert
    Returns: list of (image_path, species_name, plant_classification_id, dataset_type)
    """
    images_to_insert = []
    
    if not os.path.exists(folder_path):
        print(f"  [WARNING] Folder does not exist: {folder_path}")
        return images_to_insert
    
    dataset_type = os.path.basename(folder_path)  # 'train', 'test', or 'val'
    
    # Walk through species folders
    for species_folder in os.listdir(folder_path):
        species_path = os.path.join(folder_path, species_folder)
        
        if not os.path.isdir(species_path):
            continue
        
        # Normalize species name
        normalized_name = normalize_species_name(species_folder)
        
        # Find matching plant_classification_id
        plant_classification_id = None
        if normalized_name in species_mapping:
            plant_classification_id = species_mapping[normalized_name]
        else:
            # Try exact match
            if species_folder in species_mapping:
                plant_classification_id = species_mapping[species_folder]
            else:
                print(f"  [WARNING] Species '{species_folder}' not found in database")
                continue
        
        # Scan for image files
        image_files = [f for f in os.listdir(species_path) 
                      if f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp'))]
        
        for img_file in image_files:
            img_path = os.path.join(species_path, img_file)
            images_to_insert.append((img_path, normalized_name, plant_classification_id, dataset_type))
    
    return images_to_insert

# ============================================================================
# DATABASE INSERTION
# ============================================================================

def insert_images(db, images_to_insert):
    """
    Insert all images into plant_images table
    Returns: (success_count, error_count)
    """
    cursor = db.cursor()
    success_count = 0
    error_count = 0
    
    total = len(images_to_insert)
    print(f"\n[INSERT] Inserting {total} images into database...")
    print("=" * 60)
    
    for idx, (img_path, species_name, plant_classification_id, dataset_type) in enumerate(images_to_insert, 1):
        try:
            # Process image
            result = process_image(img_path)
            if result is None:
                error_count += 1
                continue
            
            img_blob, img_size, mime_type = result
            
            # Insert into database
            cursor.execute(
                """
                INSERT INTO plant_images 
                (user_id, image_data, image_size, mime_type, upload_datetime, retrained)
                VALUES (%s, %s, %s, %s, NOW(), 1)
                """,
                (USER_ID, img_blob, img_size, mime_type)
            )
            
            plant_image_id = cursor.lastrowid
            
            # Optionally create AI prediction entry if plant_classification_id is known
            if plant_classification_id:
                try:
                    cursor.execute(
                        """
                        INSERT INTO ai_predictions
                        (plant_image_id, user_id, plant_classification_id, confidence_score, prediction_time)
                        VALUES (%s, %s, %s, %s, NOW())
                        """,
                        (plant_image_id, USER_ID, plant_classification_id, 100.0)  # 100% confidence for training data
                    )
                except Exception as e:
                    print(f"  [WARNING] Failed to create prediction for image {plant_image_id}: {e}")
            
            success_count += 1
            
            # Progress indicator
            if idx % 50 == 0 or idx == total:
                print(f"  Progress: {idx}/{total} ({success_count} successful, {error_count} errors)")
        
        except Exception as e:
            error_count += 1
            print(f"  [WARNING] Error inserting {os.path.basename(img_path)}: {e}")
            continue
    
    # Commit all changes
    db.commit()
    cursor.close()
    
    return success_count, error_count

# ============================================================================
# MAIN FUNCTION
# ============================================================================

def main():
    print("=" * 60)
    print("DATASET IMAGE INSERTION SCRIPT")
    print("=" * 60)
    print(f"Dataset directory: {DATASET_BASE_DIR}")
    print(f"Image compression: {MAX_WIDTH}x{MAX_HEIGHT}px, JPEG quality {JPEG_QUALITY}")
    print(f"User ID: {USER_ID}")
    print("=" * 60)
    
    # Connect to database
    db = get_db_connection()
    
    # Get species mapping
    species_mapping = get_species_mapping(db)
    
    # Scan all dataset folders
    print(f"\n[SCAN] Scanning dataset folders...")
    all_images = []
    
    for dataset_type in ['train', 'test', 'val']:
        folder_path = os.path.join(DATASET_BASE_DIR, dataset_type)
        images = scan_dataset_folder(folder_path, species_mapping)
        all_images.extend(images)
        print(f"  [OK] {dataset_type}: {len(images)} images found")
    
    total_images = len(all_images)
    print(f"\n[STATS] Total images to insert: {total_images}")
    
    if total_images == 0:
        print("[WARNING] No images found to insert. Exiting.")
        db.close()
        return
    
    # Confirm before proceeding (unless --yes flag is provided)
    auto_confirm = '--yes' in sys.argv or '-y' in sys.argv
    
    if not auto_confirm:
        print("\n[WARNING] This will insert all images into the database.")
        print("   This may take a while and will use significant database storage.")
        try:
            response = input("   Continue? (yes/no): ").strip().lower()
            if response not in ['yes', 'y']:
                print("[CANCELLED] Cancelled by user.")
                db.close()
                return
        except (EOFError, KeyboardInterrupt):
            print("\n[CANCELLED] No input provided. Use --yes flag to auto-confirm.")
            db.close()
            return
    else:
        print("\n[INFO] Auto-confirmation enabled (--yes flag)")
    
    # Insert images
    start_time = datetime.now()
    success_count, error_count = insert_images(db, all_images)
    end_time = datetime.now()
    duration = (end_time - start_time).total_seconds()
    
    # Summary
    print("\n" + "=" * 60)
    print("INSERTION COMPLETE")
    print("=" * 60)
    print(f"[OK] Successfully inserted: {success_count} images")
    print(f"[ERROR] Errors: {error_count} images")
    print(f"[TIME] Time taken: {duration:.2f} seconds")
    print(f"[STATS] Average: {success_count/duration:.2f} images/second" if duration > 0 else "")
    print("=" * 60)
    
    # Close database connection
    db.close()
    print("[OK] Database connection closed")

if __name__ == "__main__":
    main()

