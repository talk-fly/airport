#!/bin/bash
# Build and install a local production Airport.app to /Applications.
# Usage: npm run install-local
set -e

cd "$(dirname "$0")/.."

# Ensure dependencies are installed
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install --legacy-peer-deps
fi

echo "Building Airport..."
npx electron-forge package

ARCH=$(uname -m)
PACKAGED="out/Airport-darwin-${ARCH}/Airport.app"

if [ ! -d "$PACKAGED" ]; then
  echo "Error: Package not found at $PACKAGED"
  exit 1
fi

# Copy hooks to stable location for prod
mkdir -p ~/.airport/hooks
cp hooks/*.sh ~/.airport/hooks/
chmod +x ~/.airport/hooks/*.sh
echo "Copied hooks to ~/.airport/hooks/"

# Quit running Airport (prod), install, launch
osascript -e 'quit app "Airport"' 2>/dev/null || true
sleep 1

rm -rf /Applications/Airport.app
cp -R "$PACKAGED" /Applications/Airport.app
echo "Installed to /Applications/Airport.app"

# Re-run hook setup pointing to stable prod paths
AIRPORT_DEV="" node scripts/setup-hooks.mjs
echo "Done! Launching Airport..."
open /Applications/Airport.app
