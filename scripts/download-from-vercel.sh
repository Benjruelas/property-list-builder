#!/bin/bash
# Download production source from Vercel
# Requires: VERCEL_TOKEN env var (get from https://vercel.com/account/tokens)
# Optional: VERCEL_TEAM for team accounts
# Run from project root: VERCEL_TOKEN="your-token" ./scripts/download-from-vercel.sh

DEPLOYMENT_ID="dpl_pk9qXmDwjhD6iGkGL9ZXaSeQnF8U"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$PROJECT_ROOT/production-backup"

if [ -z "$VERCEL_TOKEN" ]; then
  echo "Error: Set VERCEL_TOKEN first. Get one at https://vercel.com/account/tokens"
  echo "Example: VERCEL_TOKEN='your-token' $0"
  exit 1
fi

TOOL_DIR="/tmp/get-vercel-source-code"

if [ ! -d "$TOOL_DIR" ]; then
  echo "Cloning get-vercel-source-code..."
  git clone --depth 1 https://github.com/zehfernandes/get-vercel-source-code.git "$TOOL_DIR"
  (cd "$TOOL_DIR" && npm i)
fi

cd "$TOOL_DIR"
node index.js "$DEPLOYMENT_ID" "$DEST"
echo ""
echo "Done. Source saved to $DEST"
