#!/bin/bash

# Script to convert GeoJSON to PMTiles
# Requirements:
# 1. tippecanoe (install via: brew install tippecanoe or https://github.com/felt/tippecanoe)
# 2. Python 3 with pmtiles library (pip install pmtiles)

set -e

# Configuration
GEOJSON_FILE="${1:-tarrant-county.geojson}"
OUTPUT_DIR="${2:-./pmtiles_output}"
COUNTY_NAME=$(basename "$GEOJSON_FILE" .geojson | sed 's/-county$//')

echo "Converting $GEOJSON_FILE to PMTiles..."
echo "County: $COUNTY_NAME"
echo "Output directory: $OUTPUT_DIR"

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Step 1: Convert GeoJSON to MBTiles using tippecanoe
MBTILES_FILE="$OUTPUT_DIR/${COUNTY_NAME}-county.mbtiles"
echo ""
echo "Step 1: Converting GeoJSON to MBTiles..."
echo "This may take several minutes for large files..."

tippecanoe \
  --output="$MBTILES_FILE" \
  --force \
  --layer=parcels \
  --minimum-zoom=10 \
  --maximum-zoom=14 \
  --drop-densest-as-needed \
  --extend-zooms-if-still-dropping \
  --no-feature-limit \
  --no-tile-size-limit \
  "$GEOJSON_FILE"

if [ ! -f "$MBTILES_FILE" ]; then
  echo "Error: Failed to create MBTiles file"
  exit 1
fi

echo "✓ MBTiles created: $MBTILES_FILE"

# Step 2: Convert MBTiles to PMTiles using Python
PMTILES_FILE="$OUTPUT_DIR/${COUNTY_NAME}-county.pmtiles"
echo ""
echo "Step 2: Converting MBTiles to PMTiles..."

python3 << EOF
import sqlite3
import json
from pmtiles.writer import Writer
from pmtiles.tile import TileType, Compression
import zstandard as zstd

# Open MBTiles database
mbtiles_path = "$MBTILES_FILE"
pmtiles_path = "$PMTILES_FILE"

print(f"Reading MBTiles: {mbtiles_path}")

conn = sqlite3.connect(mbtiles_path)
cursor = conn.cursor()

# Get metadata
cursor.execute("SELECT name, value FROM metadata")
metadata = dict(cursor.fetchall())

# Get tile data
cursor.execute("SELECT zoom_level, tile_column, tile_row, tile_data FROM tiles ORDER BY zoom_level, tile_column, tile_row")
tiles = cursor.fetchall()

print(f"Found {len(tiles)} tiles")

# Calculate min/max zoom from tiles
if tiles:
    min_zoom = min(t[0] for t in tiles)
    max_zoom = max(t[0] for t in tiles)
else:
    min_zoom = 10
    max_zoom = 14

print(f"Zoom range: {min_zoom}-{max_zoom}")

# Create PMTiles file
with open(pmtiles_path, 'wb') as f:
    writer = Writer(f)
    
    # Write tiles
    for zoom, x, y_xyz, tile_data in tiles:
        # Convert Y from XYZ to TMS (PMTiles uses TMS)
        y_tms = (2 ** zoom) - 1 - y_xyz
        
        # Write tile
        writer.write_tile(zoom, x, y_tms, tile_data)
    
    # Finalize with metadata
    pmtiles_metadata = {
        "name": metadata.get("name", "$COUNTY_NAME County Parcels"),
        "description": metadata.get("description", "Parcel boundaries"),
        "attribution": metadata.get("attribution", ""),
        "version": "1.0.0",
        "type": "overlay",
        "format": "pbf",
        "bounds": metadata.get("bounds", ""),
        "center": metadata.get("center", ""),
        "minzoom": str(min_zoom),
        "maxzoom": str(max_zoom),
        "vector_layers": [
            {
                "id": "parcels",
                "description": "Parcel boundaries",
                "minzoom": min_zoom,
                "maxzoom": max_zoom
            }
        ]
    }
    
    writer.finalize(pmtiles_metadata)

conn.close()

print(f"✓ PMTiles created: {pmtiles_path}")
print(f"  File size: {os.path.getsize(pmtiles_path) / 1024 / 1024:.2f} MB")
EOF

if [ ! -f "$PMTILES_FILE" ]; then
  echo "Error: Failed to create PMTiles file"
  exit 1
fi

echo ""
echo "✓ Conversion complete!"
echo "  MBTiles: $MBTILES_FILE"
echo "  PMTiles: $PMTILES_FILE"
echo ""
echo "Upload $PMTILES_FILE to Vercel Blob Storage as: ${COUNTY_NAME}-county.pmtiles"

