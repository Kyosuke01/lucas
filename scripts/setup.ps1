if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error "Docker is not installed."; exit 1
}

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "[OK] .env created from .env.example"
}

$envContent = Get-Content ".env" -Raw
if ($envContent -match "change_me") {
    $secret = python -c "import secrets; print(secrets.token_hex(32))"
    $envContent = $envContent -replace "WEBUI_SECRET_KEY=.*", "WEBUI_SECRET_KEY=$secret"
    Set-Content ".env" $envContent
    Write-Host "[OK] WEBUI_SECRET_KEY generated"
}

Write-Host ""
Write-Host "Select your hardware profile:"
Write-Host "  1) Lite     - 1B-3B  (low-end PC, no GPU)"
Write-Host "  2) Standard - 7B     (modern PC, daily use)"
Write-Host "  3) Plus     - 13B    (32GB RAM, advanced use)"
Write-Host "  4) Pro      - 70B+   (powerful homelab)"
$choice = Read-Host "Choice [1-4, default: 2]"

$model = switch ($choice) {
    "1" { "llama3.2:1b" }
    "3" { "llama3:13b" }
    "4" { "llama3:70b" }
    default { "llama3.2:3b" }
}

$envContent = Get-Content ".env" -Raw
$envContent = $envContent -replace "OLLAMA_DEFAULT_MODEL=.*", "OLLAMA_DEFAULT_MODEL=$model"
Set-Content ".env" $envContent
Write-Host "[OK] Model set to: $model"

Write-Host ""
Write-Host "[DONE] Setup complete. Run ./scripts/start.ps1 to start LUCAS."