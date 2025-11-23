"""
============================================================================
DUCKDUCKGO IMAGE SCRAPER
============================================================================

PURPOSE:
Downloads plant images from DuckDuckGo for training dataset collection.

HOW IT WORKS:
1. Searches DuckDuckGo for plant images using query terms
2. Downloads images and saves with consistent naming
3. Creates CSV file with image URLs for tracking
4. Includes fallback queries if main search yields insufficient results

ADVANTAGES OVER OTHER SCRAPERS:
- No API key required
- No rate limiting
- Simple to use

REQUIREMENTS:
pip install duckduckgo-search requests pandas

USAGE:
python duckgo.py

============================================================================
"""

# ============================================================================
# IMPORTS
# ============================================================================

import os  # File and directory operations
import time  # Add delays between downloads to avoid rate limiting
import requests  # HTTP library for downloading images
import pandas as pd  # Data manipulation and CSV creation
from ddgs import DDGS  # DuckDuckGo search API wrapper

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def format_label(plant_name, index, ext):
    """
    Format file label as 'PlantName_00001.jpg' with zero-padded numbering.
    
    Args:
        plant_name: Name of the plant species
        index: Current image number
        ext: File extension (jpg, png, etc.)
        
    Returns:
        Formatted filename (e.g., "Rose_00001.jpg")
    """
    # Split plant name into words and remove extra whitespace
    parts = plant_name.strip().split()
    
    # Default to "Plant" if no name provided
    if not parts:
        return f"Plant_{index:05d}.{ext}"
    
    # Capitalize first word (e.g., "Rose")
    first = parts[0].capitalize()
    
    # Join remaining words with underscores and lowercase (e.g., "chinensis")
    rest = "_".join(p.lower() for p in parts[1:])
    
    # Combine parts (e.g., "Rose_chinensis" or just "Rose")
    base = f"{first}_{rest}" if rest else first
    
    # Return formatted filename with zero-padded number (e.g., "Rose_00001.jpg")
    return f"{base}_{index:05d}.{ext}"


# ============================================================================
# MAIN DOWNLOAD FUNCTION
# ============================================================================

def download_plant_images(plant_name, num_images=200, output_dir="plant_images"):
    """
    Downloads plant images from DuckDuckGo and saves them locally.
    
    Args:
        plant_name: Name of the plant species to search for
        num_images: Target number of images to download (default: 200)
        output_dir: Root directory for saving images (default: "plant_images")
        
    Returns:
        Number of images successfully downloaded
    """
    # Create root output directory if it doesn't exist
    os.makedirs(output_dir, exist_ok=True)

    # Create safe directory name from plant name (e.g., "rosa chinensis" -> "rosa_chinensis")
    safe_name = "_".join(plant_name.strip().split()).lower()
    plant_dir = os.path.join(output_dir, safe_name)  # e.g., "plant_images/rosa_chinensis"
    os.makedirs(plant_dir, exist_ok=True)  # Create species-specific folder

    # Initialize tracking variables
    urls, count = [], 0  # urls: list of downloaded URLs, count: number of downloaded images
    print(f"\nSearching for '{plant_name}' images...")

    # Search DuckDuckGo for images
    try:
        with DDGS() as ddgs:  # Create DuckDuckGo search instance
            # Request 3x the target to account for failed downloads
            results = list(ddgs.images(query=plant_name, max_results=num_images * 3))
    except Exception as e:
        print(f"Search failed: {e}")
        return 0  # Return 0 if search fails

    print(f"Found {len(results)} possible results.")

    # Loop through search results and download images
    for result in results:
        # Stop if we've reached the target number of images
        if count >= num_images:
            break

        # Extract image URL from result
        url = result.get("image")
        if not url:  # Skip if no URL found
            continue

        # Determine file extension from URL
        ext = url.split("?")[0].split(".")[-1].lower()  # Remove query params and get extension
        # Validate extension, default to jpg if unsupported
        if ext not in ["jpg", "jpeg", "png", "webp"]:
            ext = "jpg"

        # Generate formatted filename (e.g., "Rose_00001.jpg")
        filename = format_label(plant_name, count + 1, ext)
        filepath = os.path.join(plant_dir, filename)  # Full path to save image

        try:
            # Download image with 10-second timeout
            r = requests.get(url, timeout=10)
            # Check if download was successful and has content
            if r.status_code == 200 and r.content:
                # Write image binary data to file
                with open(filepath, "wb") as f:
                    f.write(r.content)
                # Record URL for CSV tracking
                urls.append({"filename": filename, "url": url})
                count += 1  # Increment successful download counter
                print(f"Downloaded {filename}")
            else:
                print(f"Skipped (invalid response): {url}")
        except Exception as e:
            # Handle download errors (timeout, connection issues, etc.)
            print(f"Failed {url}: {e}")

        # Delay between downloads to avoid rate limiting (1.2 seconds)
        time.sleep(1.2)

    # Save URL metadata to CSV file (preserves image sources even if partial results)
    csv_path = os.path.join(plant_dir, f"{safe_name}_urls.csv")
    pd.DataFrame(urls).to_csv(csv_path, index=False)  # Save without row index column

    # Display completion status
    if count < num_images:
        print(f"\nOnly {count}/{num_images} images found for '{plant_name}'.")
        print(f"Partial results saved in: {plant_dir}")
    else:
        print(f"\nDone! {count} images saved to {plant_dir}")

    print(f"URL list: {csv_path}")
    return count  # Return number of successfully downloaded images


# ============================================================================
# FALLBACK SEARCH FUNCTION
# ============================================================================

def download_with_fallbacks(base_name, num_images=200):
    """
    Attempts multiple search queries if initial search yields insufficient results.
    
    Args:
        base_name: Base plant name to search for
        num_images: Target number of images (default: 200)
        
    Fallback Strategy:
        1. Exact plant name (e.g., "Rafflesia")
        2. Add "plant" suffix (e.g., "Rafflesia plant")
        3. Add "flower" suffix (e.g., "Rafflesia flower")
        4. Add "bloom" suffix (e.g., "Rafflesia bloom")
        5. Add "close-up" suffix (e.g., "Rafflesia close-up")
    """
    # Define fallback search queries in order of preference
    fallbacks = [
        base_name,  # Try exact name first
        f"{base_name} plant",  # Add "plant" for more specific results
        f"{base_name} flower",  # Focus on flower images
        f"{base_name} bloom",  # Alternative floral term
        f"{base_name} close-up",  # Get detailed images
    ]

    # Try each fallback query until successful
    for query in fallbacks:
        print("\n" + "=" * 60)
        print(f"Attempting search with query: '{query}'")
        print("=" * 60)

        # Attempt download with current query
        count = download_plant_images(query, num_images=num_images)
        
        # Check if any images were downloaded
        if count > 0:
            if count >= num_images:
                print(f"Success with '{query}' — {count} images collected.")
            else:
                print(f"'{query}' yielded only {count} images, saved partial results.")
            return  # Exit after first successful query

    # All fallbacks failed
    print("\nNo usable images found in any fallback search.")
    print("Please verify the plant name or try a broader term.")


# ============================================================================
# MAIN EXECUTION
# ============================================================================

if __name__ == "__main__":
    # Prompt user for plant name
    plant = input("Enter plant name to scrape: ").strip()
    # Start download with fallback strategies
    download_with_fallbacks(plant, num_images=200)