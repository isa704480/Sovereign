#!/usr/bin/env sh
# SOVEREIGN CLI installer — macOS / Linux
#   curl -fsSL https://soveregn.xyz/install.sh | sh
set -e

PKG="@islombekrrr/sov-cli"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "SOVEREIGN CLI needs Node.js 20+ (with npm). Install it from https://nodejs.org and run this again."
  exit 1
fi

major=$(node -p 'process.versions.node.split(".")[0]')
if [ "$major" -lt 20 ]; then
  echo "Found Node.js $(node -v) — SOVEREIGN CLI needs 20+. Update from https://nodejs.org"
  exit 1
fi

echo "Installing $PKG ..."
if ! npm install -g "$PKG"; then
  # Linux'da global papka ko'pincha root'ga tegishli.
  echo "Global install needs admin rights — retrying with sudo ..."
  sudo npm install -g "$PKG"
fi

echo ""
echo "Done! Start it with:  sov"
