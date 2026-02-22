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
- Mapbox account (free) - [Sign up here](https://account.mapbox.com/auth/signup/)

### Installation

```bash
npm install
```

### Environment Variables

Create a `.env.local` file in the project root:

```bash
# Mapbox (for map tiles)
VITE_MAPBOX_ACCESS_TOKEN=your_mapbox_access_token_here

# Firebase Authentication (see FIREBASE_SETUP.md for setup instructions)
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

**Getting your Mapbox Access Token:**
1. Sign up for a free Mapbox account at [mapbox.com](https://www.mapbox.com/)
2. Go to your [Account page](https://account.mapbox.com/)
3. Scroll to "Access tokens"
4. Copy your **Default Public Token** (starts with `pk.`)
5. Add it to `.env.local` as shown above

**Mapbox Free Tier:**
- 100,000 geocoding requests per month
- No credit card required
- Perfect for development and small-scale production use

**Skip Tracing API:**
Skip tracing functionality is currently disabled by default. To enable skip tracing:
- **SkipSherpa**: See `SKIPSHERPA_SETUP.md` for setup instructions (disabled by default)
- **Tracerfy**: Set `TRACERFY_API_KEY` and `USE_TRACERFY=true` in environment variables (disabled by default)

**Firebase Authentication:**
See [FIREBASE_SETUP.md](./FIREBASE_SETUP.md) for detailed setup instructions for email/password and Google authentication.

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
