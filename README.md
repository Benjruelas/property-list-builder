# Property List Builder

A mobile webapp for selecting parcels on a map and building an exportable list of addresses.

## Features

- Interactive map with parcel boundaries
- Current location detection
- Click parcels to view details
- PMTiles-based efficient parcel loading
- Only loads tiles needed for current viewport

## Setup

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

The app will be available at `http://localhost:3000`

### Building

```bash
npm run build
```

## PMTiles Setup

This project uses PMTiles for efficient parcel data loading. See [README_PMTILES.md](./README_PMTILES.md) for conversion instructions.

### Quick Start

1. Convert your GeoJSON to PMTiles:
   ```bash
   python3 convert-geojson-to-pmtiles.py tarrant-county.geojson
   ```

2. Upload the `.pmtiles` file to Vercel Blob Storage

3. Name it: `{county-name}-county.pmtiles` (e.g., `tarrant-county.pmtiles`)

4. Make it public

The app will automatically load the PMTiles for the user's current county.

## Project Structure

```
├── api/
│   └── parcels.js          # API route to get PMTiles URL
├── src/
│   ├── components/
│   │   ├── PMTilesParcelLayer.jsx  # PMTiles rendering component
│   │   └── ParcelLayer.jsx         # Legacy GeoJSON layer (not used)
│   ├── utils/
│   │   ├── geoUtils.js     # Geographic utilities
│   │   └── parcelLoader.js # PMTiles URL loader
│   └── App.jsx             # Main app component
└── convert-geojson-to-pmtiles.py  # Conversion script
```

## Deployment

Deploy to Vercel:

```bash
vercel
```

Make sure to:
- Set up Vercel Blob Storage
- Upload PMTiles files with correct naming convention
- Make blobs public

## License

MIT
