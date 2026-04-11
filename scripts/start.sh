#!/bin/bash
# =============================================================
# LUCAS — Start (Linux / macOS)
# =============================================================
set -e

if [ ! -f ".env" ]; then
  echo "[ERROR] .env not found. Run ./scripts/setup.sh first."
  exit 1
fi

echo "[LUCAS] Starting all services..."
if ! docker compose up -d; then
  echo "[ERROR] Failed to start LUCAS. Check: docker ps -a && docker logs lucas-ollama"
  exit 1
fi

echo ""
echo "[OK] LUCAS is running!"
echo "  Open WebUI  : http://localhost:8080"
echo "  LUCAS Core  : http://localhost:8000/docs"