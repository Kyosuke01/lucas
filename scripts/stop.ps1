# =============================================================
# LUCAS — Stop (Windows / PowerShell)
# =============================================================

Write-Host "[LUCAS] Stopping all services..."
docker compose down
Write-Host "[OK] LUCAS stopped."
