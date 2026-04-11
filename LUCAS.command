#!/usr/bin/env bash
cd "$(dirname "$0")" || exit 1

CYAN='\033[0;96m'
GREEN='\033[0;32m'
RED='\033[0;31m'
GRAY='\033[0;90m'
WHITE='\033[1;97m'
NC='\033[0m'

cleanup() {
  echo ""
  echo -e "${CYAN}  Au revoir ! A bientot.${NC}"
  echo ""
  exit 0
}
trap cleanup INT TERM

echo ""
echo -e "${CYAN} ██╗     ██╗   ██╗ ██████╗ █████╗ ███████╗${NC}"
echo -e "${CYAN} ██║     ██║   ██║██╔════╝██╔══██╗██╔════╝${NC}"
echo -e "${CYAN} ██║     ██║   ██║██║     ███████║███████╗${NC}"
echo -e "${CYAN} ██║     ██║   ██║██║     ██╔══██║╚════██║${NC}"
echo -e "${CYAN} ███████╗╚██████╔╝╚██████╗██║  ██║███████║${NC}"
echo -e "${CYAN} ╚══════╝ ╚═════╝  ╚═════╝╚═╝  ╚═╝╚══════╝${NC}"
echo ""

hour=$(date +%H)
if   [ "$hour" -lt 12 ]; then greet="Bonjour"
elif [ "$hour" -lt 18 ]; then greet="Bon apres-midi"
else                          greet="Bonsoir"
fi
echo -e "${WHITE}  ${greet} ! Demarrage de l'installer LUCAS...${NC}"
echo -e "${GRAY}  ────────────────────────────────────${NC}"
echo ""

PYTHON=""
for cmd in python3 python; do
  if command -v "$cmd" >/dev/null 2>&1; then PYTHON="$cmd"; break; fi
done

if [ -z "$PYTHON" ]; then
  echo -e "${RED}  [ERREUR] Python 3 introuvable.${NC}"
  echo "  Installe Python : https://www.python.org/downloads/"
  if [[ "$OSTYPE" == "darwin"* ]]; then open "https://www.python.org/downloads/"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "https://www.python.org/downloads/"; fi
  read -r -p "  Appuie sur Entree pour quitter..." _
  exit 1
fi

echo -e "  ${GREEN}[OK]${NC} $($PYTHON --version)"
echo ""
"$PYTHON" installer.py
cleanup
