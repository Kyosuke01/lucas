#!/usr/bin/env bash
set -euo pipefail

echo "🤖 LUCAS — Setup"
echo "================="

# Vérification Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker n'est pas installé. Voir: https://docs.docker.com/engine/install/"
    exit 1
fi

if ! docker info &> /dev/null; then
    echo "❌ Docker daemon n'est pas démarré."
    exit 1
fi

echo "✅ Docker détecté"

# Fichier .env
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "✅ Fichier .env créé depuis .env.example"
    echo "📝 Pense à vérifier les valeurs dans .env"
else
    echo "✅ Fichier .env déjà présent"
fi

# Création des dossiers locaux
mkdir -p data logs

echo ""
echo "✅ Setup terminé ! Lance maintenant : ./scripts/start.sh"
