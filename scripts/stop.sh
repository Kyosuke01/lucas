#!/bin/bash
# =============================================================
# LUCAS — Stop (Linux / macOS)
# =============================================================
set -e

echo "[LUCAS] Stopping all services..."
docker compose down
echo "[OK] LUCAS stopped."
