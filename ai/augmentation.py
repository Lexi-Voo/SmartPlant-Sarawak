# Import required libraries
import os  # For file and directory operations
import re  # For regular expression pattern matching
import random  # For random transformations during augmentation
import shutil  # For copying directory trees
from PIL import Image, ImageEnhance, ImageOps  # For image manipulation and enhancement
from tqdm import tqdm  # For progress bars

# ===============================
#  Configuration Settings
# ===============================
# Source directory containing original plant images
ORIGINAL_DATASET_DIR = r"dataset_test\Vanda_dearei"  # directory with the original images. change accordingly
# Output directory for augmented dataset
AUGMENTED_DIR = r"dataset_test_augmented"
# Target number of images per class after augmentation
TARGET_COUNT = 200
# Standard image size for model training (width, height)
IMG_SIZE = (224, 224)
# Image format for saving augmented images
SAVE_FORMAT = "JPEG"

# ===============================
#  Dataset Copy Function
# ===============================
def copy_dataset(src_dir, dst_dir):
    """
    Creates a copy of the original dataset to preserve the originals.
    Skips copying if destination already exists.
    """
    # Check if destination directory already exists
    if os.path.exists(dst_dir):
        print(f"  '{dst_dir}' already exists — using existing copy.")
        return
    # Copy entire directory tree from source to destination
    print(f" Copying dataset from '{src_dir}' to '{dst_dir}'...")
    shutil.copytree(src_dir, dst_dir)
    print(" Copy complete!\n")

# ===============================
#  Image Augmentation Function
# ===============================
def random_augment(img):
    """
    Applies random augmentation transformations to an image.
    This increases dataset diversity and helps prevent overfitting.
    """
    # Horizontal and vertical flips (50% chance each)
    if random.random() < 0.5:
        img = ImageOps.mirror(img)  # Flip image horizontally
    if random.random() < 0.5:
        img = ImageOps.flip(img)  # Flip image vertically

    # Major rotations: 90°, 180°, or 270° (70% chance)
    if random.random() < 0.7:
        img = img.rotate(random.choice([90, 180, 270]))

    # Slight rotation between -15° and +15° for added diversity (50% chance)
    if random.random() < 0.5:
        img = img.rotate(random.randint(-15, 15))

    # Brightness adjustment: 0.8x to 1.2x (60% chance)
    if random.random() < 0.6:
        img = ImageEnhance.Brightness(img).enhance(random.uniform(0.8, 1.2))
    
    # Contrast adjustment: 0.7x to 1.5x (60% chance)
    if random.random() < 0.6:
        img = ImageEnhance.Contrast(img).enhance(random.uniform(0.7, 1.5))
    
    # Sharpness adjustment: 0.6x to 1.6x (60% chance)
    if random.random() < 0.6:
        img = ImageEnhance.Sharpness(img).enhance(random.uniform(0.6, 1.6))

    # Small translation (shift) up to 10 pixels in x and y directions (30% chance)
    if random.random() < 0.3:
        xshift = random.randint(-10, 10)  # Horizontal shift
        yshift = random.randint(-10, 10)  # Vertical shift
        img = img.transform(img.size, Image.AFFINE, (1, 0, xshift, 0, 1, yshift))

    return img

# ===============================
#  Utility Functions
# ===============================
def jpg_count(folder):
    """
    Counts the number of JPG files in a folder.
    """
    return len([f for f in os.listdir(folder) if f.lower().endswith(".jpg")])

def get_prefix_and_last_number(class_dir):
    """
    Extracts the naming prefix and highest number from existing image files.
    This ensures new augmented images follow the same naming convention.
    Expected format: prefix_12345.jpg
    """
    # Regular expression to match image filename pattern (e.g., Rose_00001.jpg)
    pattern = re.compile(r"^([A-Za-z_]+)_(\d+)\.jpg$")
    max_num = 0  # Track the highest number found
    # Use directory name as default prefix
    prefix = os.path.basename(class_dir)
    
    # Scan all files in directory to find prefix and highest number
    for f in os.listdir(class_dir):
        match = pattern.match(f)
        if match:
            # Extract prefix (e.g., "Rose")
            prefix = match.group(1)
            # Extract number (e.g., 1 from Rose_00001.jpg)
            num = int(match.group(2))
            # Update max number if current is higher
            if num > max_num:
                max_num = num
    return prefix, max_num

# ===============================
#  Main Class Processing Function
# ===============================
def process_class(class_dir):
    """
    Processes a single class directory by:
    1. Converting all images to JPG format
    2. Resizing to standard dimensions
    3. Augmenting images if below target count
    """
    # Step 1: Find all valid image files in the directory
    images = [f for f in os.listdir(class_dir)
              if f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp', '.avif'))]

    # Skip processing if no images found
    if not images:
        print(f"No valid images found in '{class_dir}' — skipping.")
        return

    print(f"\nProcessing class folder: {class_dir}")
    print(f"   Found {len(images)} images before processing.")

    # Step 2: Convert all images to JPG format and standardize size
    for img_name in tqdm(images, desc=f"Converting {os.path.basename(class_dir)}", leave=False):
        src_path = os.path.join(class_dir, img_name)
        # Get filename without extension
        base_name = os.path.splitext(img_name)[0]
        # Create new path with .jpg extension
        dst_path = os.path.join(class_dir, base_name + ".jpg")
        try:
            # Open image and process
            with Image.open(src_path) as img:
                # Convert to RGB color mode (removes alpha channel if present)
                img = img.convert("RGB")
                # Resize to standard dimensions for model training
                img = img.resize(IMG_SIZE)
                # Save as JPG with high quality
                img.save(dst_path, SAVE_FORMAT, quality=95)
            # Remove original file if it wasn't already JPG
            if not img_name.lower().endswith(".jpg"):
                os.remove(src_path)
        except Exception as e:
            print(f"Skipping {img_name}: {e}")

    # Step 3: Refresh the list of JPG files after conversion
    images = [f for f in os.listdir(class_dir) if f.lower().endswith(".jpg")]
    current_count = len(images)
    print(f"After conversion: {current_count} JPG images.")

    # Save a copy of original image list before augmentation
    original_images = images.copy()

    # Get the naming prefix and highest number from existing files
    prefix, last_num = get_prefix_and_last_number(class_dir)
    print(f"Using prefix '{prefix}', last number = {last_num:05d}")

    # Step 4: Check if augmentation is needed
    if current_count >= TARGET_COUNT:
        print(f"Enough images ({current_count} >= {TARGET_COUNT}), skipping augmentation.")
        return

    # Step 5: Generate augmented images to reach target count
    print(f"Augmenting {TARGET_COUNT - current_count} images to reach {TARGET_COUNT}...")
    # Initialize progress bar for augmentation
    pbar = tqdm(total=TARGET_COUNT - current_count, desc="Augmenting", leave=False)
    i = 0  # Index for cycling through original images
    next_num = last_num + 1  # Start numbering from the last existing number

    # Loop until target count is reached
    while jpg_count(class_dir) < TARGET_COUNT:
        # Cycle through original images (wraps around when reaching the end)
        img_name = original_images[i % len(original_images)]
        img_path = os.path.join(class_dir, img_name)
        try:
            # Open and prepare image for augmentation
            with Image.open(img_path) as img:
                img = img.convert("RGB").resize(IMG_SIZE)
                # Apply random augmentation transformations
                aug_img = random_augment(img)

                # Generate new filename with incremented number (e.g., Rose_00123.jpg)
                new_name = f"{prefix}_{next_num:05d}.jpg"
                next_num += 1
                # Save the augmented image
                aug_img.save(os.path.join(class_dir, new_name), SAVE_FORMAT, quality=95)
                pbar.update(1)  # Update progress bar
        except Exception as e:
            print(f"Error augmenting {img_name}: {e}")
        i += 1  # Move to next source image

    pbar.close()
    final_count = jpg_count(class_dir)
    print(f"Final count: {final_count} images.\n")

# ===============================
#  Main Execution Block
# ===============================
if __name__ == "__main__":
    print("Starting safe dataset augmentation...\n")

    # Step 1: Copy original dataset to preserve originals
    copy_dataset(ORIGINAL_DATASET_DIR, AUGMENTED_DIR)

    # Step 2: Identify all class directories in the augmented folder
    contents = [os.path.join(AUGMENTED_DIR, d) for d in os.listdir(AUGMENTED_DIR)]
    class_dirs = [d for d in contents if os.path.isdir(d)]

    # Step 3: Process based on dataset structure
    if not class_dirs:
        # Single-class dataset: process the augmented directory directly
        process_class(AUGMENTED_DIR)
    else:
        # Multi-class dataset: process each class subdirectory
        for cdir in class_dirs:
            process_class(cdir)

    # Completion message
    print("\nSafe augmentation complete.")
    print(f"Augmented dataset saved to: {AUGMENTED_DIR}")
