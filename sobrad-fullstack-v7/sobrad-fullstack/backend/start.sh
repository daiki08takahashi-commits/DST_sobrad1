#!/bin/bash
set -e
cd "$(dirname "$0")"

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python was not found on this computer."
  echo "Please install it from https://www.python.org/downloads/ then run this file again."
  exit 1
fi

if [ ! -d venv ]; then
  echo "Setting up the backend for the first time, this can take a minute..."
  python3 -m venv venv
fi

source venv/bin/activate

echo "Installing/checking dependencies..."
pip install -r requirements.txt

echo ""
echo "Starting the SOBRAD backend at http://localhost:8000"
echo "Leave this window open while you use the app. Press Ctrl+C to stop it."
echo ""
uvicorn app.main:app --host 0.0.0.0 --port 8000
