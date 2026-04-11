import os
import socket
import sys
import threading
import time
import webbrowser
from pathlib import Path

from .server import LucasHandler, ThreadedTCPServer


def find_free_port():
    with socket.socket() as s:
        s.bind(("", 0))
        return s.getsockname()[1]


def start_installer():
    port = find_free_port()
    root_path = Path(__file__).parent.parent

    ThreadedTCPServer.allow_reuse_address = True
    server = ThreadedTCPServer(("127.0.0.1", port), LucasHandler)
    server.root_path = root_path

    url = f"http://127.0.0.1:{port}"
    print(f"\n  LUCAS Installer -> {url}\n")

    if sys.platform == "win32":
        try:
            import ctypes

            _HandlerType = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_ulong)

            @_HandlerType
            def _ctrl_handler(event):
                print("\n  LUCAS ferm\u00e9.")
                server.shutdown()
                os._exit(0)

            ctypes.windll.kernel32.SetConsoleCtrlHandler(_ctrl_handler, True)
        except Exception:
            pass

    threading.Thread(
        target=lambda: (time.sleep(0.8), webbrowser.open(url)), daemon=True
    ).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  LUCAS ferm\u00e9.")
        server.shutdown()


if __name__ == "__main__":
    start_installer()
