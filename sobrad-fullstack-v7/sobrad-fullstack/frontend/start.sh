#!/bin/bash
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found on this computer."
  echo "Please install it from https://nodejs.org/ then run this file again."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Setting up the frontend for the first time, this can take a minute..."
  npm install
fi

echo ""
echo "Starting the SOBRAD frontend at http://localhost:5173"
echo "Make sure start.sh in the backend folder is already running in another terminal."
echo "Leave this window open while you use the app. Press Ctrl+C to stop it."
echo ""
npm run dev
