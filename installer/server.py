# flake8: noqa: E501
# ruff: noqa: E501
import http.server
import json
import platform
import socketserver
import subprocess
import threading
import time
from urllib.parse import urlparse

from .logic import (
    _log,
    action_done,
    action_result,
    check_container_status,
    find_docker,
    get_about_info,
    get_ram_info,
    greeting,
    install_docker_linux,
    install_docker_mac,
    install_docker_windows,
    list_ollama_models,
    log_queue,
    run_docker_compose,
    write_env,
)
from .ui import HTML


class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    pass


class LucasHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        """Log HTTP requests"""
        _log(f"[HTTP] {self.address_string()} - {format % args}")

    def handle(self):
        """Handle requests, ignoring connection errors gracefully"""
        try:
            http.server.BaseHTTPRequestHandler.handle(self)
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
            # Client disconnected - this is normal, ignore
            pass
        except Exception as e:
            _log(
                f"[SERVER] Unexpected error in handle: {type(e).__name__}: {str(e)[:100]}"
            )

    def do_GET(self):
        p = urlparse(self.path).path
        _log(f"[SERVER] GET {p}")

        try:
            if p == "/stream":
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("Cache-Control", "no-cache")
                self.send_header("Connection", "keep-alive")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                try:
                    while True:
                        if not log_queue.empty():
                            msg = log_queue.get()
                            self.wfile.write(
                                f"data: {json.dumps({'type': 'log', 'line': msg})}\n\n".encode()
                            )
                            self.wfile.flush()
                        if action_done.is_set():
                            action_done.clear()
                            self.wfile.write(
                                f"data: {json.dumps({'type': 'done', 'ok': action_result['ok']})}\n\n".encode()
                            )
                            self.wfile.flush()
                        time.sleep(0.1)
                except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
                    pass
                except Exception:
                    pass

            elif p == "/api/info":
                _log("[SERVER] /api/info called")
                try:
                    env_exists = (self.server.root_path / ".env").exists()
                except Exception:
                    env_exists = False

                # Get actual container status
                docker_ok = find_docker()
                ollama_ok = False
                webui_ok = False

                if docker_ok and env_exists:
                    ollama_ok = check_container_status("lucas-ollama")
                    webui_ok = check_container_status("lucas-open-webui")

                result = {
                    "greeting": greeting(),
                    "python": platform.python_version(),
                    "docker": docker_ok,
                    "env_exists": env_exists,
                    "ollama": ollama_ok,
                    "webui": webui_ok,
                }

                _log("[SERVER] Sending /api/info response")
                self._json(result)

            elif p == "/api/hardware":
                self._json({"ram": get_ram_info()})

            elif p == "/api/models/status":
                installed = list_ollama_models()
                self._json({"models": installed})

            elif p == "/api/open_webui":
                self._json({"ok": True})

            elif p == "/api/about":
                about = get_about_info()
                self._json(about)

            else:
                _log("[SERVER] GET / - serving HTML")
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                full_html = HTML.replace("__PORT__", str(self.server.server_address[1]))
                _log(f"[SERVER] Sending HTML ({len(full_html)} bytes)")
                self.wfile.write(full_html.encode("utf-8"))
                _log("[SERVER] HTML sent")

        except Exception as e:
            _log(f"[SERVER] ERROR in do_GET: {type(e).__name__}: {e}")
            try:
                self.send_error(500, f"Error: {str(e)}")
            except Exception:
                pass

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        data = json.loads(body) if body else {}
        p = urlparse(self.path).path

        if p == "/api/install":
            write_env(data)
            _log("✅ Fichier .env créé")

            def _run():
                _log("[LUCAS] 🔄 Installation en cours...")
                ok = run_docker_compose("install", extra_params=data)
                if ok:
                    _log("[LUCAS] ✅ Services démarrés avec succès !")
                    _log(
                        "[LUCAS] 🌐 Ouvrez http://localhost:8080 pour créer votre compte administrateur."
                    )
                else:
                    _log("❌ Erreur pendant l'installation.")
                action_result["ok"] = ok
                action_done.set()

            threading.Thread(target=_run, daemon=True).start()
            self._json({"ok": True})

        elif p == "/api/start":

            def _run():
                _log("[LUCAS] 🚀 Démarrage des services...")
                _log("[LUCAS] ⏳ Initialisation...")
                ok = run_docker_compose("start")
                action_result["ok"] = ok
                if ok:
                    _log("[LUCAS] ✅ Services démarrés !")
                    _log("[LUCAS] 🌐 Vérification des conteneurs...")
                    time.sleep(2)
                    if check_container_status("lucas-ollama"):
                        _log("[LUCAS] ✅ Ollama prêt")
                    if check_container_status("lucas-open-webui"):
                        _log("[LUCAS] ✅ Open WebUI prêt")
                    _log("[LUCAS] 🎉 LUCAS opérationnel !")
                else:
                    _log("❌ Erreur au démarrage.")
                action_done.set()

            threading.Thread(target=_run, daemon=True).start()
            self._json({"ok": True})

        elif p == "/api/stop":

            def _run():
                _log("[LUCAS] 🛑 Arrêt des services...")
                ok = run_docker_compose("stop")
                action_result["ok"] = ok
                if ok:
                    _log("[LUCAS] ✅ Services arrêtés")
                else:
                    _log("❌ Erreur à l'arrêt.")
                action_done.set()

            threading.Thread(target=_run, daemon=True).start()
            self._json({"ok": True})

        elif p == "/api/install_docker":

            def _run():
                system = platform.system().lower()
                if system == "windows":
                    ok = install_docker_windows()
                elif system == "darwin":
                    ok = install_docker_mac()
                else:
                    ok = install_docker_linux()
                action_result["ok"] = ok
                action_done.set()

            threading.Thread(target=_run, daemon=True).start()
            self._json({"ok": True})

        elif p == "/api/check_docker":
            env_exists = (self.server.root_path / ".env").exists()
            ollama_ok = check_container_status("lucas-ollama")
            webui_ok = check_container_status("lucas-open-webui")
            self._json(
                {
                    "docker": find_docker(),
                    "env_exists": env_exists,
                    "ollama": ollama_ok,
                    "webui": webui_ok,
                }
            )

        elif p == "/api/models/action":
            action = data.get("action")
            target = data.get("target")
            source = data.get("source")

            def _parse_ollama_progress(line):
                """Parse une ligne ollama pull pour extraire le pourcentage."""
                import re

                # Format: "pulling 1a6cb4d6c4ad 83% ▕████████▏ 2.1GB/2.5GB 0B/s"
                match = re.search(
                    r"(\d+)%\s+[▁▂▃▄▅▆▇█▉▊▋▌▍▎▏▕]*\s+(\d+\.?\d*[KMG]B)/(\d+\.?\d*[KMG]B)",
                    line,
                )
                if match:
                    percent = int(match.group(1))
                    current = match.group(2)
                    total = match.group(3)
                    return (percent, f"{current}/{total}")
                return None

            def _format_progress_bar(percent):
                """Génère une barre de progression stylisée."""
                width = 30
                filled = int(width * percent / 100)
                bar = "█" * filled + "░" * (width - filled)
                return f"[{bar}] {percent}%"

            def _run():
                if action == "install":
                    _log(f"[LUCAS] 📥 Téléchargement de {source}...")
                    _log(
                        "[LUCAS] ⏳ Cela peut prendre quelques minutes selon la taille du modèle"
                    )
                    try:
                        import urllib.request

                        req = urllib.request.Request(
                            "http://localhost:11434/api/pull",
                            data=json.dumps({"name": source, "stream": True}).encode(),
                            headers={"Content-Type": "application/json"},
                            method="POST",
                        )
                        last_logged_percent = -1
                        with urllib.request.urlopen(req, timeout=600) as resp:
                            for raw_line in resp:
                                raw_line = raw_line.strip()
                                if not raw_line:
                                    continue
                                try:
                                    d = json.loads(raw_line.decode())
                                except Exception:
                                    continue

                                status = d.get("status", "")
                                total = d.get("total", 0)
                                completed = d.get("completed", 0)

                                if total and completed:
                                    percent = int(completed / total * 100)
                                    if percent - last_logged_percent >= 5:
                                        bar = _format_progress_bar(percent)
                                        _log(
                                            f"[LUCAS] 📊 {bar} | {completed // 1024 // 1024}MB/{total // 1024 // 1024}MB"
                                        )
                                        last_logged_percent = percent
                                elif status and status not in ("", "success"):
                                    _log(f"[LUCAS] ⚙️  {status}")

                        _log(f"[LUCAS] 📊 {_format_progress_bar(100)}")
                        _log(f"[LUCAS] ✅ {source} téléchargé et prêt !")
                        _log("[LUCAS] 🎉 Installation complète !")
                        action_result["ok"] = True

                    except Exception as e:
                        _log(f"[LUCAS] ❌ Erreur : {str(e)[:150]}")
                        action_result["ok"] = False
                elif action == "delete":
                    _log(f"[LUCAS] 🗑️  Suppression de {target}...")
                    try:
                        # Lancer la suppression
                        process = subprocess.Popen(
                            ["docker", "exec", "lucas-ollama", "ollama", "rm", target],
                            stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE,
                            text=True,
                            bufsize=1,
                        )

                        # Lancer un thread de monitoring
                        def delete_monitor():
                            elapsed = 0
                            while process.poll() is None:
                                elapsed += 1
                                if elapsed % 2 == 0:
                                    _log(
                                        f"[LUCAS] ⏳ Suppression en cours ({elapsed}s)..."
                                    )
                                time.sleep(1)

                        delete_thread = threading.Thread(
                            target=delete_monitor, daemon=True
                        )
                        delete_thread.start()

                        # Lire la sortie
                        stdout_lines = []
                        stderr_lines = []
                        for line in process.stdout:
                            line = line.rstrip()
                            if line and line.strip():
                                stdout_lines.append(line)
                        for line in process.stderr:
                            line = line.rstrip()
                            if line and line.strip():
                                stderr_lines.append(line)

                        process.wait()
                        returncode = process.returncode

                        if returncode == 0:
                            _log(f"[LUCAS] ✅ Modèle {target} supprimé des références")
                            # Nettoyer aussi les caches - UNIQUEMENT pour ce modèle
                            _log("[LUCAS] 🧹 Nettoyage des fichiers en cache...")
                            # Remplacer les : par / dans le nom du modèle pour construire le chemin correct
                            model_path = target.replace(":", "/")
                            clean_cmd = f"rm -rf /root/.ollama/models/manifests/registry.ollama.ai/library/{model_path}/"
                            subprocess.run(
                                [
                                    "docker",
                                    "exec",
                                    "lucas-ollama",
                                    "bash",
                                    "-c",
                                    clean_cmd,
                                ],
                                capture_output=True,
                                timeout=10,
                            )
                            _log("[LUCAS] ✅ Nettoyage terminé")
                            _log("[LUCAS] 🎉 Suppression complète !")
                            action_result["ok"] = True
                        else:
                            _log(f"[LUCAS] ❌ Erreur suppression (code {returncode})")
                            if stderr_lines:
                                for line in stderr_lines[-3:]:
                                    _log(f"[LUCAS] {line}")
                            _log("[LUCAS] ⚠️  Le modèle a peut-être déjà été supprimé")
                            action_result["ok"] = True
                    except Exception as e:
                        _log(f"[LUCAS] ❌ Exception suppression : {str(e)[:150]}")
                        action_result["ok"] = False

                action_done.set()

            action_result["ok"] = False
            threading.Thread(target=_run, daemon=True).start()
            self._json({"ok": True})
        else:
            self._json({"error": "not found"}, 404)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def _json(self, data, code=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
