"""
============================================================================
GOOGLE IMAGE CRAWLER
============================================================================

PURPOSE:
Downloads plant images from Google Images using the icrawler library.

HOW IT WORKS:
1. Uses multiple search terms to maximize results
2. Custom downloader with duplicate detection
3. Batch downloading with progress tracking
4. Saves metadata CSV with image URLs

ADVANTAGES:
- Access to Google's extensive image database
- Custom naming with zero-padded numbering
- Automatic duplicate prevention
- Stops at exact target count

REQUIREMENTS:
pip install icrawler

USAGE:
1. Update search_terms and save_dir in configuration
2. Run: python googlesearch.py

OUTPUT:
- Images: Bulbophyllum_dearei/Bulbophyllum_dearei_00001.jpg, ...
- Metadata: Bulbophyllum_dearei/metadata.csv

============================================================================
"""

# ============================================================================
# IMPORTS
# ============================================================================

from icrawler.builtin import GoogleImageCrawler  # Google image crawler
from icrawler import ImageDownloader  # Base downloader class for customization
import os  # File and directory operations
import csv  # CSV file handling for metadata
import time  # Add delays between batches

# ============================================================================
# CONFIGURATION
# ============================================================================

# Multiple search terms to maximize image variety
search_terms = [
    "Bulbophyllum dearei",  # Scientific name
    "Bulbophyllum dearei orchid",  # Add "orchid" for more specific results
    "Bulbophyllum dearei flower"  # Focus on flower images
]

target_images = 200  # Total number of images to download
batch_size = 50  # Number of images to download per batch
save_dir = "Bulbophyllum_dearei"  # Output directory for images

# Create output directory if it doesn't exist
os.makedirs(save_dir, exist_ok=True)

# CSV file path for storing image URLs and metadata
csv_file = os.path.join(save_dir, "metadata.csv")

# ============================================================================
# DATA STRUCTURES FOR TRACKING
# ============================================================================

# Set to store unique image URLs (prevents downloading duplicates)
image_urls = set()

# ============================================================================
# CSV FILE SETUP
# ============================================================================

# Check if CSV file already exists
csv_exists = os.path.isfile(csv_file)

# Open CSV file in append mode (preserves existing data if any)
csv_file_handle = open(csv_file, "a", newline="", encoding="utf-8")
csv_writer = csv.writer(csv_file_handle)  # Create CSV writer object

# Write header row if file is new or empty
if not csv_exists or os.stat(csv_file).st_size == 0:
    csv_writer.writerow(["image_url"])  # Single column for image URLs

# ============================================================================
# CUSTOM DOWNLOADER CLASS
# ============================================================================

class StopAtTargetDownloader(ImageDownloader):
    """
    Custom image downloader that:
    1. Stops at exact target count
    2. Generates sequential filenames with zero-padding
    3. Prevents duplicate downloads
    4. Records URLs to CSV
    """
    
    def get_filename(self, task, default_ext):
        """
        Generates sequential filename: Bulbophyllum_dearei_00001.jpg, etc.
        
        Args:
            task: Download task information
            default_ext: File extension (jpg, png, etc.)
            
        Returns:
            Formatted filename with zero-padded number
        """
        # Count existing files with matching prefix to determine next number
        existing_files = os.listdir(save_dir)
        count = sum(1 for f in existing_files 
                   if f.startswith("Bulbophyllum_dearei_") and f.endswith(f".{default_ext}"))
        # Return filename with zero-padded number (e.g., Bulbophyllum_dearei_00001.jpg)
        return f"Bulbophyllum_dearei_{count + 1:05d}.{default_ext}"

    def download(self, task, default_ext, timeout=5, max_retry=3, **kwargs):
        """
        Custom download method with duplicate checking and target limit.
        
        Args:
            task: Download task containing image URL
            default_ext: Default file extension
            timeout: Download timeout in seconds (default: 5)
            max_retry: Maximum retry attempts (default: 3)
            
        Returns:
            True if download successful, False otherwise
        """
        # Stop downloading if target reached
        if len(image_urls) >= target_images:
            self.signal.set()  # Signal crawler to stop
            return False
        
        # Skip duplicate URLs
        if task['file_url'] in image_urls:
            return False  # Already downloaded this URL
        
        # Call parent class download method
        result = super().download(task, default_ext, timeout, max_retry, **kwargs)
        
        # If download successful, record URL
        if result:
            image_urls.add(task['file_url'])  # Add to set of downloaded URLs
            csv_writer.writerow([task['file_url']])  # Write URL to CSV
            csv_file_handle.flush()  # Ensure data is written to disk immediately
        
        # Check if target reached after this download
        if len(image_urls) >= target_images:
            self.signal.set()  # Signal crawler to stop
        
        return result

# ============================================================================
# BATCH DOWNLOAD FUNCTION
# ============================================================================

def download_batch(batch_size):
    """
    Downloads a batch of images using Google Image Crawler.
    
    Args:
        batch_size: Number of images to attempt downloading
    """
    # Initialize Google Image Crawler with custom downloader
    crawler = GoogleImageCrawler(
        storage={"root_dir": save_dir},  # Directory to save images
        downloader_cls=StopAtTargetDownloader  # Use our custom downloader class
    )
    
    # Start crawling Google Images
    crawler.crawl(
        keyword=search_terms,  # List of search terms to try
        max_num=batch_size * 2,  # Request 2x batch size (accounts for failures)
        min_size=(200, 200),  # Minimum image dimensions (200x200 pixels)
        file_idx_offset=len(image_urls),  # Start numbering from current count
        filters=None  # Disable license filtering to get more results
    )


# ============================================================================
# MAIN DOWNLOAD LOOP
# ============================================================================

max_attempts = 10  # Maximum retry attempts if no new images found
attempts = 0  # Counter for consecutive failed attempts

# Continue downloading until target reached or max attempts exceeded
while len(image_urls) < target_images and attempts < max_attempts:
    before = len(image_urls)  # Count before this batch
    remaining = target_images - before  # Images still needed
    current_batch = min(batch_size, remaining)  # Don't request more than needed
    
    # Display progress
    print(f"Downloading images {before+1} to {before+current_batch}...")
    download_batch(current_batch)  # Download the batch
    
    after = len(image_urls)  # Count after this batch
    print(f"Progress: {after}/{target_images}")
    
    # Check if any new images were downloaded
    if after == before:
        attempts += 1  # Increment failed attempt counter
    else:
        attempts = 0  # Reset counter if progress made
    
    # Wait 2 seconds before next batch (avoid rate limiting)
    time.sleep(2)


# ============================================================================
# CLEANUP
# ============================================================================

# Close CSV file to ensure all data is saved
csv_file_handle.close()

# Display final summary
print(f"Download complete: {len(image_urls)} unique images saved in {save_dir}")
print(f"CSV saved at {csv_file}")