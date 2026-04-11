# flake8: noqa: E501
# ruff: noqa: E501
import os
import platform
import queue
import re
import secrets
import subprocess
import threading
import time
import webbrowser
from pathlib import Path

# ──────────────────────────────────────────────────────────────
# Global state for logging
# ──────────────────────────────────────────────────────────────
log_queue = queue.Queue()
action_done = threading.Event()
action_result = {"ok": False}


def _log(msg):
    # Support for step milestones in logs
    log_queue.put(msg)


def get_ram_info():
    """Get total RAM in GB."""
    try:
        # Fallback order: wmic -> powershell -> 0.0
        if platform.system().lower() == "windows":
            # Try wmic first
            try:
                r = subprocess.run(
                    ["wmic", "computersystem", "get", "totalphysicalmemory", "/value"],
                    capture_output=True,
                    text=True,
                    timeout=3,
                )
                for line in r.stdout.splitlines():
                    if "TotalPhysicalMemory" in line:
                        v = line.split("=")[1].strip()
                        if v.isdigit():
                            return round(int(v) / (1024**3), 1)
            except Exception:
                pass

            # Try powershell
            try:
                r = subprocess.run(
                    [
                        "powershell",
                        "-command",
                        "(Get-CimInstance Win32_PhysicalMemory | Measure-Object -Property Capacity -Sum).Sum",
                    ],
                    capture_output=True,
                    text=True,
                    timeout=4,
                )
                v = r.stdout.strip()
                if v.isdigit():
                    return round(int(v) / (1024**3), 1)
            except Exception:
                pass
        else:
            # Linux /macOS
            if Path("/proc/meminfo").exists():
                with open("/proc/meminfo", "r") as f:
                    for line in f:
                        if "MemTotal" in line:
                            kb = int(line.split()[1])
                            return round(kb / (1024**2), 1)
    except Exception:
        pass
    return 0.0


# ──────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────


def greeting():
    h = time.localtime().tm_hour
    if h < 12:
        return "Bonjour"
    elif h < 18:
        return "Bon après-midi"
    else:
        return "Bonsoir"


def gen_secret(n=32):
    return secrets.token_hex(n)


def find_docker():
    import shutil

    is_win = platform.system().lower() == "windows"
    candidates = ("docker", "docker.exe") if is_win else ("docker",)
    for cmd in candidates:
        if not shutil.which(cmd):
            continue
        try:
            kwargs = {"capture_output": True, "timeout": 2}
            if is_win:
                kwargs["creationflags"] = 0x08000000
            r = subprocess.run([cmd, "--version"], **kwargs)
            if r.returncode == 0:
                return True
        except Exception:
            pass
    return False


def check_container_status(name):
    """Check if a docker container is running."""
    try:
        is_win = platform.system().lower() == "windows"
        kwargs = {"capture_output": True, "timeout": 1.5}
        if is_win:
            kwargs["creationflags"] = 0x08000000
        r = subprocess.run(
            ["docker", "inspect", "-f", "{{.State.Running}}", name], **kwargs
        )
        return r.stdout.decode().strip() == "true"
    except (subprocess.TimeoutExpired, Exception):
        return False


def list_ollama_models():
    try:
        r = subprocess.run(
            ["docker", "exec", "lucas-ollama", "ollama", "list"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if r.returncode == 0:
            lines = r.stdout.strip().split("\n")[1:]  # Skip header
            models = []
            for line in lines:
                parts = line.split()
                if parts:
                    models.append(parts[0])
            return models
    except Exception:
        pass
    return []


def get_models_space():
    """Get total space used by Ollama models."""
    try:
        r = subprocess.run(
            ["docker", "exec", "lucas-ollama", "du", "-sh", "/root/.ollama/models"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if r.returncode == 0:
            # Output is like "4.5G\t/path"
            size_str = r.stdout.strip().split()[0]
            return size_str
    except Exception:
        pass
    return "0 B"


def get_about_info():
    """Get comprehensive About information."""
    import installer

    models = list_ollama_models()
    space = get_models_space()
    ram = get_ram_info()

    # Get Python version
    python_v = platform.python_version()

    # Get Docker version
    docker_v = "—"
    try:
        r = subprocess.run(
            ["docker", "--version"], capture_output=True, text=True, timeout=2
        )
        if r.returncode == 0:
            # Extract version like "Docker version 24.0.0"
            docker_v = r.stdout.strip().replace("Docker version ", "")
    except Exception:
        pass

    # Check container status
    ollama_status = "Inactif"
    webui_status = "Inactif"
    try:
        if check_container_status("lucas-ollama"):
            ollama_status = "✓ Actif"
        if check_container_status("lucas-open-webui"):
            webui_status = "✓ Actif"
    except Exception:
        pass

    return {
        "version": installer.__version__,
        "models_count": len(models),
        "models_space": space,
        "ram_total": f"{ram} GB",
        "python": python_v,
        "docker": docker_v,
        "ollama_status": ollama_status,
        "webui_status": webui_status,
    }


def write_env(params):
    root = Path(__file__).parent.parent
    env_example = root / ".env.example"
    env_file = root / ".env"
    content = env_example.read_text(encoding="utf-8") if env_example.exists() else ""
    replacements = {
        "WEBUI_SECRET_KEY": gen_secret(),
        "OLLAMA_DEFAULT_MODEL": params.get("source") or "llama3.1:8b",
    }
    for key, value in replacements.items():
        pattern = rf"^{key}=.*$"
        if re.search(pattern, content, flags=re.MULTILINE):
            content = re.sub(pattern, f'{key}="{value}"', content, flags=re.MULTILINE)
        else:
            content += f'\n{key}="{value}"'
    env_file.write_text(content, encoding="utf-8")


def run_docker_compose(action, extra_params=None):
    """Run docker compose commands directly without external scripts."""
    if extra_params is None:
        extra_params = {}
    is_win = platform.system().lower() == "windows"
    compose_cmd = ["docker", "compose"]
    root = Path(__file__).parent.parent

    if action == "start":
        _log("[LUCAS] 🚀 Démarrage des services LUCAS...")
        _log("[LUCAS] ⏳ Initialisation de Docker Compose...")
        cmd = compose_cmd + ["up", "-d"]
    elif action == "stop":
        _log("[LUCAS] 🛑 Arrêt des services LUCAS...")
        _log("[LUCAS] ⏳ Fermeture des conteneurs...")
        cmd = compose_cmd + ["down"]
    elif action == "install":
        _log("[LUCAS] 📦 Installation initiale des services...")
        _log("[LUCAS] ⏳ Démarrage d'Ollama...")
        cmd = compose_cmd + ["up", "-d", "ollama"]
    else:
        return False

    try:
        kwargs = {
            "stdout": subprocess.PIPE,
            "stderr": subprocess.STDOUT,
            "text": True,
            "cwd": str(root),
        }
        if is_win:
            kwargs["creationflags"] = 0x08000000

        process = subprocess.Popen(cmd, **kwargs)
        for line in process.stdout:
            line_stripped = line.rstrip()
            if line_stripped:
                _log(line_stripped)
        process.wait()

        if action == "start" and process.returncode == 0:
            _log("[LUCAS] ✅ Services démarrés avec succès !")
            _log("[LUCAS] 📍 Open WebUI : http://localhost:8080")
        elif action == "stop" and process.returncode == 0:
            _log("[LUCAS] ✅ Services arrêtés avec succès !")
        elif action == "install" and process.returncode == 0:
            _log("[LUCAS] ✅ Ollama démarré avec succès !")

        if action == "install" and process.returncode == 0:
            target_model = extra_params.get("source") or ""
            if target_model:
                _log(f"[LUCAS] 📥 Téléchargement du modèle {target_model}...")
                pull_cmd = [
                    "docker",
                    "exec",
                    "lucas-ollama",
                    "ollama",
                    "pull",
                    target_model,
                ]
                p2 = subprocess.Popen(pull_cmd, **kwargs)
                for line in p2.stdout:
                    line_stripped = line.rstrip()
                    if line_stripped:
                        _log(line_stripped)
                p2.wait()
                tag = extra_params.get("target") or "lucas:standard"
                _log(f"[LUCAS] 🏷️ Configuration de l'alias {tag}...")
                subprocess.run(
                    [
                        "docker",
                        "exec",
                        "lucas-ollama",
                        "ollama",
                        "cp",
                        target_model,
                        tag,
                    ],
                    capture_output=True,
                )
                if p2.returncode == 0:
                    _log("[LUCAS] ✅ Modèle configuré avec succès !")
                return p2.returncode == 0
            else:
                _log(
                    "[LUCAS] ℹ️ Aucun modèle sélectionné — installation des services uniquement."
                )
                # Lancer aussi open-webui maintenant que ollama est up
                _log("[LUCAS] ⏳ Démarrage d'Open WebUI et du cœur LUCAS...")
                cmd2 = compose_cmd + ["up", "-d"]
                p2 = subprocess.Popen(
                    cmd2,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    cwd=str(root),
                )
                for line in p2.stdout:
                    line_stripped = line.rstrip()
                    if line_stripped:
                        _log(line_stripped)
                p2.wait()
                if p2.returncode == 0:
                    _log("[LUCAS] ✅ Installation terminée avec succès !")
                return p2.returncode == 0

        if process.returncode != 0:
            _log(f"[LUCAS] ❌ Erreur ({action}). Code retour : {process.returncode}")

        return process.returncode == 0
    except Exception as e:
        _log(f"[LUCAS] ❌ Erreur critique : {e}")
        return False


def install_docker_windows():
    _log("[INFO] Vérification de winget...")
    try:
        r = subprocess.run(["winget", "--version"], capture_output=True, timeout=5)
        if r.returncode != 0:
            raise FileNotFoundError
    except Exception:
        _log(
            "[ERROR] winget introuvable. Ouvre https://www.docker.com/products/docker-desktop/ pour installer Docker manuellement."
        )
        webbrowser.open("https://www.docker.com/products/docker-desktop/")
        return False

    _log("[INFO] Lancement de l'installation Docker Desktop via winget...")
    _log("[INFO] Une fenêtre UAC (administrateur) va apparaître, accepte-la.")
    try:
        process = subprocess.Popen(
            [
                "winget",
                "install",
                "-e",
                "--id",
                "Docker.DockerDesktop",
                "--silent",
                "--accept-package-agreements",
                "--accept-source-agreements",
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        for line in process.stdout:
            if line.rstrip():
                _log(line.rstrip())
        process.wait()
        if process.returncode == 0:
            _log("[OK] Docker Desktop installé !")
            return True
        else:
            _log("[ERROR] Échec. Code : " + str(process.returncode))
            webbrowser.open("https://www.docker.com/products/docker-desktop/")
            return False
    except Exception as e:
        _log(f"[ERROR] {e}")
        return False


def install_docker_mac():
    brew_ok = False
    try:
        r = subprocess.run(["brew", "--version"], capture_output=True, timeout=5)
        brew_ok = r.returncode == 0
    except Exception:
        pass

    if brew_ok:
        _log("[INFO] Homebrew détecté, installation de Docker Desktop...")
        process = subprocess.Popen(
            ["brew", "install", "--cask", "docker"],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        for line in process.stdout:
            if line.rstrip():
                _log(line.rstrip())
        process.wait()
        if process.returncode == 0:
            _log("[OK] Docker Desktop installé via Homebrew !")
            return True

    webbrowser.open("https://www.docker.com/products/docker-desktop/")
    return False


def install_docker_linux():
    _log("[INFO] Installation de Docker Engine sur Linux...")
    try:
        process = subprocess.Popen(
            ["bash", "-c", "curl -fsSL https://get.docker.com | sudo sh"],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        for line in process.stdout:
            if line.rstrip():
                _log(line.rstrip())
        process.wait()
        if process.returncode == 0:
            subprocess.run(
                ["sudo", "usermod", "-aG", "docker", os.getenv("USER", "user")],
                capture_output=True,
            )
            subprocess.run(
                ["sudo", "systemctl", "enable", "--now", "docker"], capture_output=True
            )
            _log("[OK] Docker installé !")
            return True
        else:
            return False
    except Exception as e:
        _log(f"[ERROR] {e}")
        return False
