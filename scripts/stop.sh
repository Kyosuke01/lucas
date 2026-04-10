#!/usr/bin/env bash
set -euo pipefail

echo "🛑 Arrêt de LUCAS..."
docker compose down
echo "✅ LUCAS arrêté."
