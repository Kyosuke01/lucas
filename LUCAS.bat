@echo off
setlocal
title LUCAS - Demarrage
chcp 65001 >nul 2>&1

REM ── Definition des couleurs ANSI ─────────────────────────────────────────────
for /F "tokens=1 delims=#" %%a in ('"prompt #$E# & echo on & for %%b in (1) do rem"') do set "ESC=%%a"
set "CYAN=%ESC%[96m"
set "GRAY=%ESC%[90m"
set "WHITE=%ESC%[97m"
set "RESET=%ESC%[0m"

REM ── Activation ANSI (Windows 10+) ──────────────────────────────────────────
reg add HKCU\Console /v VirtualTerminalLevel /t REG_DWORD /d 1 /f >nul 2>&1

REM ── Verification Python ─────────────────────────────────────────────────────
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo   [ERREUR] Python introuvable.
    echo   Telecharge-le : https://www.python.org/downloads/
    echo   Coche "Add Python to PATH" lors de l'installation !
    start https://www.python.org/downloads/
    echo.
    pause
    exit /b 1
)

REM ── ASCII Art ────────────────────────────────────────────────────────────────
echo.
echo %CYAN% ██╗     ██╗   ██╗ ██████╗ █████╗ ███████╗%RESET%
echo %CYAN% ██║     ██║   ██║██╔════╝██╔══██╗██╔════╝%RESET%
echo %CYAN% ██║     ██║   ██║██║     ███████║███████╗%RESET%
echo %CYAN% ██║     ██║   ██║██║     ██╔══██║╚════██║%RESET%
echo %CYAN% ███████╗╚██████╔╝╚██████╗██║  ██║███████║%RESET%
echo %CYAN% ╚══════╝ ╚═════╝  ╚═════╝╚═╝  ╚═╝╚══════╝%RESET%
echo.

REM ── Salutation selon l'heure ─────────────────────────────────────────────────
for /f "tokens=1 delims=:" %%H in ("%time%") do set /a HOUR=1%%H - 100
if %HOUR% LSS 12 (set "GREET=Bonjour"
) else if %HOUR% LSS 18 (set "GREET=Bon apres-midi"
) else (set "GREET=Bonsoir"
)

echo %WHITE% %GREET% ! Demarrage de l'installer LUCAS...%RESET%
echo %GRAY% ────────────────────────────────────%RESET%
echo.

REM ── Lancement de l'installer ─────────────────────────────────────────────────
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8
set PYTHONUTF8=1
python installer.py

REM ── Au revoir ────────────────────────────────────────────────────────────────
echo.
echo %CYAN% Au revoir ! A bientot.%RESET%
echo.
pause
exit /b 0
