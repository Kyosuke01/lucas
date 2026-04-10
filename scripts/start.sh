#!/usr/bin/env bash
set -euo pipefail

echo "🚀 Démarrage de LUCAS..."
docker compose up -d
echo ""
echo "✅ LUCAS est démarré !"
echo "👉 Interface : http://localhost:${LUCAS_DASHBOARD_PORT:-3000}"
