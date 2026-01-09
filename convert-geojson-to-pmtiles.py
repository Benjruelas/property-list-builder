#!/usr/bin/env python3
"""
Convert GeoJSON to PMTiles via MBTiles
Requires: tippecanoe (for GeoJSON->MBTiles) and pmtiles Python library
"""

import sys
import os
import subprocess
import sqlite3
import json
from pathlib import Path

try:
    from pmtiles.writer import Writer
    from pmtiles.tile import TileType, Compression
except ImportError:
    print("Error: pmtiles library not installed. Install with: pip install pmtiles")
    sys.exit(1)


def convert_geojson_to_mbtiles(geojson_path, mbtiles_path):
    """Convert GeoJSON to MBTiles using tippecanoe"""
    print(f"Converting GeoJSON to MBTiles...")
    print(f"  Input: {geojson_path}")
    print(f"  Output: {mbtiles_path}")
    
    # Check if tippecanoe is available
    try:
        subprocess.run(['tippecanoe', '--version'], check=True, capture_output=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("Error: tippecanoe not found. Install with: brew install tippecanoe")
        print("  Or download from: https://github.com/felt/tippecanoe")
        sys.exit(1)
    
    # Run tippecanoe
    cmd = [
        'tippecanoe',
        '--output', str(mbtiles_path),
        '--force',
        '--layer=parcels',
        '--minimum-zoom=10',
        '--maximum-zoom=14',
        '--drop-densest-as-needed',
        '--extend-zooms-if-still-dropping',
        '--no-feature-limit',
        '--no-tile-size-limit',
        str(geojson_path)
    ]
    
    print(f"Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode != 0:
        print(f"Error running tippecanoe:")
        print(result.stderr)
        sys.exit(1)
    
    if not os.path.exists(mbtiles_path):
        print(f"Error: MBTiles file not created: {mbtiles_path}")
        sys.exit(1)
    
    size_mb = os.path.getsize(mbtiles_path) / 1024 / 1024
    print(f"✓ MBTiles created: {mbtiles_path} ({size_mb:.2f} MB)")


def convert_geojson_to_pmtiles_direct(geojson_path, pmtiles_path):
    """Try to convert GeoJSON directly to PMTiles using tippecanoe (if supported)"""
    # Check if tippecanoe supports direct PMTiles output
    try:
        result = subprocess.run(['tippecanoe', '--version'], capture_output=True, text=True)
        # Try direct conversion
        cmd = [
            'tippecanoe',
            '--output', str(pmtiles_path),
            '--force',
            '--layer=parcels',
            '--minimum-zoom=10',
            '--maximum-zoom=14',
            '--drop-densest-as-needed',
            '--extend-zooms-if-still-dropping',
            '--no-feature-limit',
            '--no-tile-size-limit',
            str(geojson_path)
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0 and os.path.exists(pmtiles_path):
            size_mb = os.path.getsize(pmtiles_path) / 1024 / 1024
            print(f"✓ PMTiles created directly: {pmtiles_path} ({size_mb:.2f} MB)")
            return True
    except:
        pass
    return False


def convert_mbtiles_to_pmtiles(mbtiles_path, pmtiles_path):
    """Convert MBTiles to PMTiles"""
    print(f"\nConverting MBTiles to PMTiles...")
    print(f"  Input: {mbtiles_path}")
    print(f"  Output: {pmtiles_path}")
    
    # Open MBTiles database
    conn = sqlite3.connect(mbtiles_path)
    cursor = conn.cursor()
    
    # Get metadata
    cursor.execute("SELECT name, value FROM metadata")
    metadata = dict(cursor.fetchall())
    
    # Get tile data
    cursor.execute("""
        SELECT zoom_level, tile_column, tile_row, tile_data 
        FROM tiles 
        ORDER BY zoom_level, tile_column, tile_row
    """)
    tiles = cursor.fetchall()
    
    if not tiles:
        print("Error: No tiles found in MBTiles file")
        conn.close()
        sys.exit(1)
    
    print(f"Found {len(tiles)} tiles")
    
    # Calculate min/max zoom from tiles
    min_zoom = min(t[0] for t in tiles)
    max_zoom = max(t[0] for t in tiles)
    print(f"Zoom range: {min_zoom}-{max_zoom}")
    
    # Create PMTiles file
    with open(pmtiles_path, 'wb') as f:
        writer = Writer(f)
        
        # Write tiles
        tile_count = 0
        for zoom, x, y_xyz, tile_data in tiles:
            # Convert Y from XYZ to TMS (PMTiles uses TMS)
            y_tms = (2 ** zoom) - 1 - y_xyz
            
            # Write tile
            writer.write_tile(zoom, x, y_tms, tile_data)
            tile_count += 1
            
            if tile_count % 1000 == 0:
                print(f"  Written {tile_count}/{len(tiles)} tiles...", end='\r')
        
        print(f"  Written {tile_count}/{len(tiles)} tiles")
        
        # Prepare metadata
        pmtiles_metadata = {
            "name": metadata.get("name", "Parcel Boundaries"),
            "description": metadata.get("description", "Parcel boundaries from GeoJSON"),
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
        
        # Finalize with metadata
        writer.finalize(pmtiles_metadata)
    
    conn.close()
    
    size_mb = os.path.getsize(pmtiles_path) / 1024 / 1024
    print(f"✓ PMTiles created: {pmtiles_path} ({size_mb:.2f} MB)")


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 convert-geojson-to-pmtiles.py <geojson-file> [output-dir]")
        print("\nExample:")
        print("  python3 convert-geojson-to-pmtiles.py tarrant-county.geojson")
        sys.exit(1)
    
    geojson_path = Path(sys.argv[1])
    output_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("./pmtiles_output")
    
    if not geojson_path.exists():
        print(f"Error: GeoJSON file not found: {geojson_path}")
        sys.exit(1)
    
    # Create output directory
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Determine county name from filename
    county_name = geojson_path.stem.replace('-county', '')
    
    # File paths
    pmtiles_path = output_dir / f"{county_name}-county.pmtiles"
    
    # Try direct conversion first (if tippecanoe supports it)
    if not convert_geojson_to_pmtiles_direct(geojson_path, pmtiles_path):
        # Fallback: GeoJSON -> MBTiles -> PMTiles
        print("\nDirect PMTiles conversion not supported, using MBTiles intermediate step...")
        mbtiles_path = output_dir / f"{county_name}-county.mbtiles"
        convert_geojson_to_mbtiles(geojson_path, mbtiles_path)
        convert_mbtiles_to_pmtiles(mbtiles_path, pmtiles_path)
    
    print(f"\n✓ Conversion complete!")
    print(f"\nUpload {pmtiles_path.name} to Vercel Blob Storage")
    print(f"  URL pattern: https://c26a6qe6znzs7fed.public.blob.vercel-storage.com/{pmtiles_path.name}")


if __name__ == "__main__":
    main()

