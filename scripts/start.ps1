# =============================================================
# LUCAS — Start (Windows / PowerShell)
# =============================================================

if (-not (Test-Path ".env")) {
    Write-Error "[ERROR] .env not found. Run ./scripts/setup.ps1 first."
    exit 1
}

Write-Host "[LUCAS] Starting all services..."
docker compose up -d
if ($LASTEXITCODE -ne 0) {
    Write-Error "[ERROR] Failed to start LUCAS. Check: docker ps -a && docker logs lucas-ollama"
    exit 1
}

Write-Host ""
Write-Host "[OK] LUCAS is running!"
Write-Host "  Open WebUI  : http://localhost:8080"
Write-Host "  LUCAS Core  : http://localhost:8000/docs"