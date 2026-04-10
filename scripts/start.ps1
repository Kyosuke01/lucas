if (-not (Test-Path ".env")) {
    Write-Error ".env not found. Run ./scripts/setup.ps1 first."; exit 1
}

Write-Host "[LUCAS] Starting..."
docker compose up -d --build
Write-Host "[OK] LUCAS is running"
Write-Host "Open WebUI : http://localhost:8080"
Write-Host "LUCAS Core : http://localhost:8000/docs"