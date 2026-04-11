#!/bin/bash
# =============================================================
# LUCAS -- Setup (Linux / macOS)
# =============================================================
set -e

# 1. Verifier Docker
if ! command -v docker &>/dev/null; then
  echo "[ERROR] Docker is not installed. Install it from https://www.docker.com/ and retry."
  exit 1
fi

# 2. Creer .env si absent
if [ ! -f ".env" ]; then
  cp .env.example .env
  echo "[OK] .env created from .env.example"
fi

# 3. Generer WEBUI_SECRET_KEY si necessaire
if grep -q "change_me_with_a_random_string" .env; then
  if command -v python3 &>/dev/null; then
    SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")
  elif command -v python &>/dev/null; then
    SECRET=$(python -c "import secrets; print(secrets.token_hex(32))")
  else
    SECRET=$(openssl rand -hex 32 2>/dev/null || cat /dev/urandom | tr -dc 'a-f0-9' | head -c 64)
  fi
  sed -i.bak "s/WEBUI_SECRET_KEY=.*/WEBUI_SECRET_KEY=$SECRET/" .env && rm -f .env.bak
  echo "[OK] WEBUI_SECRET_KEY generated"
fi

# 4. Generer le mot de passe admin si necessaire
if grep -q "change_me_admin_password" .env; then
  if command -v python3 &>/dev/null; then
    ADMIN_PASS=$(python3 -c "import secrets, string; print(''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(16)))")
  elif command -v python &>/dev/null; then
    ADMIN_PASS=$(python -c "import secrets, string; print(''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(16)))")
  else
    ADMIN_PASS=$(openssl rand -base64 12 | tr -dc 'a-zA-Z0-9' | head -c 16)
  fi
  sed -i.bak "s/WEBUI_ADMIN_PASSWORD=.*/WEBUI_ADMIN_PASSWORD=$ADMIN_PASS/" .env && rm -f .env.bak
fi

# 5. Choisir le profil materiel
echo ""
echo "Select your hardware profile:"
echo "  1) Lite     - 1B   (low-end PC, no GPU, 8GB RAM)"
echo "  2) Standard - 8B   (modern PC, daily use, 16GB RAM)  [default]"
echo "  3) Plus     - 13B  (32GB RAM, advanced use)"
echo "  4) Pro      - 70B+ (powerful homelab, 64GB+ RAM)"
read -rp "Choice [1-4, default: 2]: " CHOICE

case "$CHOICE" in
  1) MODEL="llama3.2:1b" ;;
  3) MODEL="llama3:13b" ;;
  4) MODEL="llama3:70b" ;;
  *) MODEL="llama3.1:8b" ;;
esac

# 6. Verifier si un modele est deja configure
CURRENT_MODEL=$(grep "^OLLAMA_DEFAULT_MODEL=" .env | cut -d'=' -f2 | cut -d'#' -f1 | tr -d '[:space:]')
SKIP_DOWNLOAD=false

if [ "$CURRENT_MODEL" = "$MODEL" ]; then
  echo ""
  echo "[INFO] Model $MODEL is already configured."
  read -rp "Re-download it anyway (useful to fix a broken model)? [y/N]: " CONFIRM
  if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo "[SKIP] Keeping current model. No download."
    SKIP_DOWNLOAD=true
  fi
elif [ -n "$CURRENT_MODEL" ] && [ "$CURRENT_MODEL" != "change_me" ]; then
  echo ""
  echo "[WARN] Current model is: $CURRENT_MODEL"
  read -rp "Replace with $MODEL? [y/N]: " CONFIRM
  if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo "[SKIP] Model unchanged. Keeping $CURRENT_MODEL"
    MODEL="$CURRENT_MODEL"
    SKIP_DOWNLOAD=true
  fi
fi

# 7. Ecrire le modele dans .env
sed -i.bak "s/OLLAMA_DEFAULT_MODEL=.*/OLLAMA_DEFAULT_MODEL=$MODEL/" .env && rm -f .env.bak
echo "[OK] Model set to: $MODEL"

# 8. Demarrer Ollama et telecharger le modele si necessaire
if [ "$SKIP_DOWNLOAD" = false ]; then
  echo ""
  echo "[LUCAS] Starting Ollama container..."
  docker compose up -d ollama

  echo "[LUCAS] Waiting for Ollama to be ready (up to 30s)..."
  READY=false
  for i in $(seq 1 15); do
    if curl -sf http://localhost:11434/api/tags >/dev/null 2>&1; then
      READY=true
      break
    fi
    sleep 2
  done

  if [ "$READY" = false ]; then
    echo "[ERROR] Ollama did not start in time. Check 'docker logs lucas-ollama'."
    exit 1
  fi

  echo "[LUCAS] Downloading model $MODEL (this may take a few minutes)..."
  docker exec lucas-ollama ollama pull "$MODEL"
  echo "[OK] Model downloaded."
fi

# 9. Lire les infos de connexion
ADMIN_EMAIL=$(grep "^WEBUI_ADMIN_EMAIL=" .env | cut -d'=' -f2 | cut -d'#' -f1 | tr -d '[:space:]')
ADMIN_PASS_FINAL=$(grep "^WEBUI_ADMIN_PASSWORD=" .env | cut -d'=' -f2 | cut -d'#' -f1 | tr -d '[:space:]')

# 10. Affichage final
echo ""
echo -e "\033[36m============================================\033[0m"
echo -e "\033[36m   LUCAS - Setup complete!\033[0m"
echo -e "\033[36m============================================\033[0m"
echo ""
echo -e "  Run LUCAS  :  \033[33m./scripts/start.sh\033[0m"
echo ""
echo -e "  \033[35m--- Admin credentials (save these!) ---\033[0m"
echo -e "  URL        :  \033[32mhttp://localhost:8080\033[0m"
echo -e "  Email      :  \033[97m$ADMIN_EMAIL\033[0m"
echo -e "  Password   :  \033[97m$ADMIN_PASS_FINAL\033[0m"
echo ""
echo -e "  \033[31m/!\ Change your password after first login!\033[0m"
echo -e "\033[36m============================================\033[0m"