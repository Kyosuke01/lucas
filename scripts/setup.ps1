# =============================================================
# LUCAS -- Setup (Windows / PowerShell)
# =============================================================

# 1. Verifier Docker
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error "[ERROR] Docker is not installed. Install it from https://www.docker.com/ and retry."
    exit 1
}

# 2. Verifier Python
$pythonCmd = $null
foreach ($cmd in @("python", "python3")) {
    if (Get-Command $cmd -ErrorAction SilentlyContinue) {
        $pythonCmd = $cmd; break
    }
}

# 3. Creer .env si absent
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "[OK] .env created from .env.example"
}

# 4. Generer WEBUI_SECRET_KEY si necessaire
$envContent = Get-Content ".env" -Raw
if ($envContent -match "change_me_with_a_random_string") {
    if ($pythonCmd) {
        $secret = & $pythonCmd -c "import secrets; print(secrets.token_hex(32))"
    } else {
        $secret = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 64 | ForEach-Object { [char]$_ })
    }
    $envContent = $envContent -replace "WEBUI_SECRET_KEY=.*", "WEBUI_SECRET_KEY=$secret"
    Set-Content ".env" $envContent
    Write-Host "[OK] WEBUI_SECRET_KEY generated"
}

# 5. Generer le mot de passe admin si necessaire
$envContent = Get-Content ".env" -Raw
if ($envContent -match "change_me_admin_password") {
    if ($pythonCmd) {
        $adminPass = & $pythonCmd -c "import secrets, string; print(''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(16)))"
    } else {
        $adminPass = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 16 | ForEach-Object { [char]$_ })
    }
    $envContent = $envContent -replace "WEBUI_ADMIN_PASSWORD=.*", "WEBUI_ADMIN_PASSWORD=$adminPass"
    Set-Content ".env" $envContent
}

# 6. Choisir le profil materiel
Write-Host ""
Write-Host "Select your hardware profile:"
Write-Host "  1) Lite     - 1B   (low-end PC, no GPU, 8GB RAM)"
Write-Host "  2) Standard - 8B   (modern PC, daily use, 16GB RAM)  [default]"
Write-Host "  3) Plus     - 13B  (32GB RAM, advanced use)"
Write-Host "  4) Pro      - 70B+ (powerful homelab, 64GB+ RAM)"
$choice = Read-Host "Choice [1-4, default: 2]"

$model = switch ($choice) {
    "1" { "llama3.2:1b" }
    "3" { "llama3:13b" }
    "4" { "llama3:70b" }
    default { "llama3.1:8b" }
}

# 7. Verifier si un modele est deja configure
$envContent = Get-Content ".env" -Raw
$currentModel = ""
if ($envContent -match "OLLAMA_DEFAULT_MODEL=([^\s#]+)") {
    $currentModel = $Matches[1].Trim()
}

$skipDownload = $false

if ($currentModel -eq $model) {
    Write-Host ""
    Write-Host "[INFO] Model $model is already configured."
    $confirm = Read-Host "Re-download it anyway (useful to fix a broken model)? [y/N]"
    if ($confirm -notmatch "^[Yy]$") {
        Write-Host "[SKIP] Keeping current model. No download."
        $skipDownload = $true
    }
} elseif ($currentModel -ne "" -and $currentModel -ne "change_me") {
    Write-Host ""
    Write-Host "[WARN] Current model is: $currentModel"
    $confirm = Read-Host "Replace with $model ? [y/N]"
    if ($confirm -notmatch "^[Yy]$") {
        Write-Host "[SKIP] Model unchanged. Keeping $currentModel"
        $model = $currentModel
        $skipDownload = $true
    }
}

# 8. Ecrire le modele dans .env
$envContent = Get-Content ".env" -Raw
$envContent = $envContent -replace "OLLAMA_DEFAULT_MODEL=.*", "OLLAMA_DEFAULT_MODEL=$model"
Set-Content ".env" $envContent
Write-Host "[OK] Model set to: $model"

# 9. Demarrer Ollama et telecharger le modele si necessaire
if (-not $skipDownload) {
    Write-Host ""
    Write-Host "[LUCAS] Starting Ollama container..."
    docker compose up -d ollama

    Write-Host "[LUCAS] Waiting for Ollama to be ready (up to 30s)..."
    $ready = $false
    for ($i = 0; $i -lt 15; $i++) {
        try {
            Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -UseBasicParsing -ErrorAction Stop | Out-Null
            $ready = $true; break
        } catch {
            Start-Sleep -Seconds 2
        }
    }

    if (-not $ready) {
        Write-Error "[ERROR] Ollama did not start in time. Check 'docker logs lucas-ollama'."
        exit 1
    }

    Write-Host "[LUCAS] Downloading model $model (this may take a few minutes)..."
    docker exec lucas-ollama ollama pull $model
    Write-Host "[OK] Model downloaded."
}

# 10. Lire les infos de connexion
$envContent = Get-Content ".env" -Raw
$adminEmail = ""
$adminPassFinal = ""
if ($envContent -match "WEBUI_ADMIN_EMAIL=([^\s#]+)") { $adminEmail = $Matches[1].Trim() }
if ($envContent -match "WEBUI_ADMIN_PASSWORD=([^\s#]+)") { $adminPassFinal = $Matches[1].Trim() }

# 11. Affichage final
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "   LUCAS - Setup complete!" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Run LUCAS  :  " -NoNewline; Write-Host "./scripts/start.ps1" -ForegroundColor Yellow
Write-Host ""
Write-Host "  --- Admin credentials (save these!) ---" -ForegroundColor Magenta
Write-Host "  URL        :  " -NoNewline; Write-Host "http://localhost:8080" -ForegroundColor Green
Write-Host "  Email      :  " -NoNewline; Write-Host "$adminEmail" -ForegroundColor White
Write-Host "  Password   :  " -NoNewline; Write-Host "$adminPassFinal" -ForegroundColor White
Write-Host ""
Write-Host "  /!\ Change your password after first login!" -ForegroundColor Red
Write-Host "============================================" -ForegroundColor Cyan