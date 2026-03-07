#!/bin/bash
set -euo pipefail

ARCH=$(uname -m)
LATEST=$(curl -sL https://api.github.com/repos/tomer-van-cohen/airport/releases/latest | grep tag_name | cut -d'"' -f4)
URL="https://github.com/tomer-van-cohen/airport/releases/download/${LATEST}/Airport-${ARCH}.tar.gz"

echo "Installing Airport ${LATEST} for ${ARCH}..."
curl -sL "$URL" | tar xz -C /tmp/
mv /tmp/Airport.app /Applications/Airport.app
mkdir -p /usr/local/bin
ln -sf /Applications/Airport.app/Contents/Resources/bin/airport /usr/local/bin/airport
echo "Airport installed. Run: open /Applications/Airport.app"
