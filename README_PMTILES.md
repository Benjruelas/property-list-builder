# PMTiles Conversion Guide

This project uses PMTiles format for efficient parcel data loading. PMTiles is a tiled vector format that allows loading only the tiles needed for the current viewport, dramatically reducing memory usage.

## Prerequisites

1. **tippecanoe**: For converting GeoJSON to MBTiles
   ```bash
   # macOS
   brew install tippecanoe
   
   # Or download from: https://github.com/felt/tippecanoe
   ```

2. **Python 3** with `pmtiles` library:
   ```bash
   pip install pmtiles
   ```

## Conversion Process

### Step 1: Convert GeoJSON to PMTiles

Use the provided Python script:

```bash
python3 convert-geojson-to-pmtiles.py <geojson-file> [output-dir]
```

Example:
```bash
python3 convert-geojson-to-pmtiles.py tarrant-county.geojson
```

This will:
1. Convert GeoJSON → MBTiles (using tippecanoe)
2. Convert MBTiles → PMTiles (using Python pmtiles library)
3. Output: `pmtiles_output/tarrant-county.pmtiles`

### Step 2: Upload to Vercel Blob Storage

1. Go to your Vercel project dashboard
2. Navigate to Storage → Blob
3. Upload the `.pmtiles` file
4. Make it public
5. Note the URL pattern: `https://c26a6qe6znzs7fed.public.blob.vercel-storage.com/tarrant-county.pmtiles`

### Step 3: File Naming Convention

The PMTiles file must be named: `{county-name}-county.pmtiles`

Examples:
- `tarrant-county.pmtiles`
- `dallas-county.pmtiles`
- `denton-county.pmtiles`

## How It Works

1. **Client-side**: The app requests the PMTiles URL from the API route (`/api/parcels?county=tarrant`)
2. **API route**: Returns the PMTiles URL for the requested county
3. **PMTilesParcelLayer**: Loads only the tiles needed for the current viewport
4. **Efficient**: Only loads tiles at zoom levels 10-14, and only for the visible area

## Benefits

- **Memory efficient**: Only loads tiles in viewport
- **Fast**: Tiles are pre-rendered and optimized
- **Scalable**: Can handle very large datasets
- **No server-side filtering**: All filtering happens client-side via tile loading

## Troubleshooting

### "PMTiles file not found"
- Ensure the file is uploaded to Vercel Blob Storage
- Check the file name matches: `{county}-county.pmtiles`
- Verify the blob is set to public

### "No parcels visible"
- Check browser console for errors
- Verify PMTiles file was created correctly
- Ensure zoom level is between 10-14 (parcels only load at these zoom levels)

### Conversion fails
- Ensure tippecanoe is installed: `tippecanoe --version`
- Ensure Python pmtiles library is installed: `pip install pmtiles`
- Check that GeoJSON file is valid

