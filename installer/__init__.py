"""
LUCAS Installer Package
This package contains the modular components of the LUCAS dashboard:
- logic: Docker and model management
- ui: HTML/CSS/JS interface
- server: HTTP API handlers
- main: Application entry point
"""

from .main import start_installer

__version__ = "1.5.1"
__author__ = "Kyosuke01"

__all__ = ["start_installer"]
