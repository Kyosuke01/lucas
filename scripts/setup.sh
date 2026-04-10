#!/bin/bash
set -e

if ! command -v docker &> /dev/null; then
  echo "[ERROR] Docker is not installed." && exit 1
fi

if [ ! -f ".env" ]; then
  cp .env.example .env
  echo "[OK] .env created from .env.example"
fi

if grep -q "change_me" .env; then
  SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")
  sed -i "s/WEBUI_SECRET_KEY=.*/WEBUI_SECRET_KEY=$SECRET/" .env
  echo "[OK] WEBUI_SECRET_KEY generated"
fi

echo ""
echo "Select your hardware profile:"
echo "  1) Lite     - 1B-3B  (low-end PC, no GPU)"
echo "  2) Standard - 7B     (modern PC, daily use)"
echo "  3) Plus     - 13B    (32GB RAM, advanced use)"
echo "  4) Pro      - 70B+   (powerful homelab)"
read -p "Choice [1-4, default: 2]: " CHOICE

case $CHOICE in
  1) MODEL="llama3.2:1b" ;;
  3) MODEL="llama3:13b" ;;
  4) MODEL="llama3:70b" ;;
  *) MODEL="llama3.2:3b" ;;
esac

sed -i "s/OLLAMA_DEFAULT_MODEL=.*/OLLAMA_DEFAULT_MODEL=$MODEL/" .env
echo "[OK] Model set to: $MODEL"

echo ""
echo "[DONE] Setup complete. Run ./scripts/start.sh to start LUCAS."