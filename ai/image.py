"""
============================================================================
INATURALIST IMAGE SCRAPER
============================================================================

PURPOSE:
Downloads plant images from iNaturalist API for training dataset collection.

HOW IT WORKS:
1. Queries iNaturalist API for specific plant taxon ID
2. Downloads high-quality images (original size)
3. Saves images with consistent naming (Plant_00001.jpg, Plant_00002.jpg, ...)
4. Creates metadata CSV with URLs and attribution

USAGE:
1. Find taxon ID from iNaturalist.org
2. Update taxon_id and folder name below
3. Run: python image.py

OUTPUT:
- Images: Vanda_dearei/Vanda_dearei_00001.jpg, ...
- Metadata: Vanda_dearei/metadata.csv

REQUIREMENTS:
pip install requests

============================================================================
"""

# ============================================================================
# IMPORTS
# ============================================================================

import requests  # HTTP library for API calls and image downloads
import os  # File and directory operations
import csv  # CSV file reading/writing for metadata

# ============================================================================
# CONFIGURATION
# ============================================================================

taxon_id = 923118  # iNaturalist taxon ID number (unique identifier for plant species)
                  # Find taxon ID at: https://www.inaturalist.org/taxa/<species_name>
base_url = "https://api.inaturalist.org/v1/observations"  # iNaturalist API endpoint
folder = "Vanda_dearei"  # Output folder name (should match species name)
max_images = 200  # Maximum number of images to download per species

# ============================================================================
# SETUP
# ============================================================================

# Create output folder if it doesn't exist
os.makedirs(folder, exist_ok=True)  # exist_ok=True: Don't error if folder already exists

# CSV metadata file to track image sources and attribution (for licensing compliance)
csv_file = os.path.join(folder, "metadata.csv")  # Path to metadata CSV file

# Write CSV header row
with open(csv_file, mode="w", newline="", encoding="utf-8") as f:  # Open in write mode
    writer = csv.writer(f)  # Create CSV writer object
    writer.writerow(["filename", "image_url", "author"])  # Column headers: file, URL, photographer

# ============================================================================
# DOWNLOAD LOOP (Pagination)
# ============================================================================

# Pagination settings for API requests
page = 1  # Start from page 1 (API uses 1-indexed pages)
per_page = 100  # Request 100 observations per page (API maximum)
downloaded = 0  # Counter for successfully downloaded images

# Continue downloading until we reach max_images limit
while downloaded < max_images:
    print(f"Fetching page {page}...")
    
    # Prepare API request parameters
    params = {
        "taxon_id": taxon_id,  # Filter by specific plant species
        "photos": "true",  # Only get observations with photos
        "page": page,  # Current page number
        "per_page": per_page  # Results per page
    }
    
    # Make API request and parse JSON response
    response = requests.get(base_url, params=params).json()
    results = response.get("results", [])  # Extract observations array

    # Check if any results returned
    if not results:
        print("No more results found — stopping.")
        break  # Exit loop if no more data available

    # Process each observation on this page
    for obs in results:
        # Stop if we've reached target number of images
        if downloaded >= max_images:
            break

        # Extract photographer username for attribution
        user = obs.get("user", {}).get("login", "UnknownUser")
        
        # Get all photos associated with this observation (some have multiple)
        photos = obs.get("photos", [])

        # Download each photo from this observation
        for photo in photos:
            # Check limit again (in case observation has multiple photos)
            if downloaded >= max_images:
                break

            # Get photo URL
            url = photo.get("url")
            if not url:  # Skip if no URL available
                continue

            # Replace "square" with "original" to get full-resolution image
            # iNaturalist URLs: .../square.jpg -> .../original.jpg
            original_url = url.replace("square", "original")

            # Generate filename with zero-padded numbering for consistent sorting
            file_number = str(downloaded + 1).zfill(5)  # e.g., "00001"
            file_name = f"{folder}/Vanda_dearei_{file_number}.jpg"  # e.g., "Vanda_dearei/Vanda_dearei_00001.jpg"

            try:
                # Download image with 10-second timeout
                img_data = requests.get(original_url, timeout=10).content
                
                # Write binary image data to file
                with open(file_name, "wb") as f:
                    f.write(img_data)

                # Save metadata to CSV (for attribution and URL tracking)
                with open(csv_file, mode="a", newline="", encoding="utf-8") as f:
                    writer = csv.writer(f)
                    writer.writerow([file_name, original_url, user])  # Record filename, URL, and photographer

                downloaded += 1  # Increment success counter
                print(f"Downloaded ({downloaded}): {file_name}")

            except Exception as e:
                # Handle download errors (timeout, connection issues, invalid images)
                print(f"Failed {original_url}: {e}")

    page += 1  # Move to next page for more results

# ============================================================================
# COMPLETION MESSAGE
# ============================================================================

print("===================================")
print(f"Finished downloading!")
print(f"Total images saved: {downloaded}")