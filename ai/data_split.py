# Import required libraries
import os  # For file and directory operations
import random  # For shuffling images randomly
import shutil  # For file operations (imported but not used)
from PIL import Image  # For image loading, conversion, and resizing
from tqdm import tqdm  # For progress bars during processing

# -----------------------------
#  CONFIGURATION
# -----------------------------
# Source directory containing class folders with plant images
DATASET_DIR = "plant_dataset"   # folder with your 5 class folders
# Output directory where split dataset will be saved
OUTPUT_DIR = "dataset_split1"  # output directory
# Standard image dimensions for model training (width, height)
IMG_SIZE = (224, 224)
# Ratio of data to use for training (70%)
TRAIN_RATIO = 0.7
# Ratio of data to use for validation (15%)
VAL_RATIO = 0.15
# Ratio of data to use for testing (15%)
TEST_RATIO = 0.15

# Validate that all ratios sum to 1.0 (100%)
assert abs(TRAIN_RATIO + VAL_RATIO + TEST_RATIO - 1.0) < 1e-6, "Ratios must sum to 1."

# -----------------------------
#  CREATE OUTPUT STRUCTURE
# -----------------------------
# Define the three data splits needed for machine learning
splits = ["train", "val", "test"]

# Create directory structure: OUTPUT_DIR/split/class_name/
# This creates train/, val/, and test/ folders, each containing subfolders for each class
for split in splits:
    # Iterate through each class folder in the source dataset
    for cls in os.listdir(DATASET_DIR):
        # Create the full directory path (e.g., dataset_split1/train/Rose/)
        # exist_ok=True prevents errors if directory already exists
        os.makedirs(os.path.join(OUTPUT_DIR, split, cls), exist_ok=True)

# -----------------------------
#  PROCESS EACH CLASS
# -----------------------------
# Loop through each class folder in the dataset
for cls in os.listdir(DATASET_DIR):
    # Construct the full path to the class directory
    class_path = os.path.join(DATASET_DIR, cls)
    # Skip if not a directory (ignore files in the dataset root)
    if not os.path.isdir(class_path):
        continue

    # Collect all valid image files from the class folder
    images = [f for f in os.listdir(class_path) if f.lower().endswith(('.jpg', '.jpeg', '.png', '.avif', '.webp'))]
    # Randomly shuffle images to ensure random distribution across splits
    random.shuffle(images)

    # Calculate split indices based on the defined ratios
    total = len(images)
    train_end = int(total * TRAIN_RATIO)  # End index for training set (70%)
    val_end = int(total * (TRAIN_RATIO + VAL_RATIO))  # End index for validation set (85%)

    # Split the shuffled images into train, validation, and test sets
    split_dict = {
        "train": images[:train_end],  # First 70% for training
        "val": images[train_end:val_end],  # Next 15% for validation
        "test": images[val_end:]  # Last 15% for testing
    }

    print(f"\nProcessing class '{cls}' ({total} images):")

    # Process each split (train, val, test) for this class
    for split, split_images in split_dict.items():
        # Process each image in this split with a progress bar
        for img_name in tqdm(split_images, desc=f"{split.upper()} - {cls}"):
            # Construct source path (original image location)
            src_path = os.path.join(class_path, img_name)
            # Construct destination path (e.g., dataset_split1/train/Rose/image.jpg)
            # Convert all images to .jpg extension for consistency
            dst_path = os.path.join(OUTPUT_DIR, split, cls, os.path.splitext(img_name)[0] + ".jpg")

            try:
                # Open, convert, resize, and save the image
                with Image.open(src_path) as img:
                    # Convert to RGB format (removes alpha channel if present)
                    img = img.convert("RGB")
                    # Resize to standard dimensions for model training
                    img = img.resize(IMG_SIZE)
                    # Save as JPEG with high quality (95%)
                    img.save(dst_path, "JPEG", quality=95)
            except Exception as e:
                # Skip problematic images and continue processing
                print(f"Skipping {img_name}: {e}")
                continue

# Print completion message
print("\nDataset successfully split and resized to 224x224!")
