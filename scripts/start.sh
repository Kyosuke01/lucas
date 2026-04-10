#!/bin/bash
set -e

if [ ! -f ".env" ]; then
  echo "[ERROR] .env not found. Run ./scripts/setup.sh first." && exit 1
fi

echo "[LUCAS] Starting..."
docker compose up -d --build
echo "[OK] LUCAS is running"
echo "Open WebUI : http://localhost:8080"
echo "LUCAS Core : http://localhost:8000/docs"