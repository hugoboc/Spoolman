# Deploy custom Spoolman nfcIntegration image to Raspberry Pi.
# Runs the full pipeline: fix line endings -> build -> scp -> load -> restart.

param(
    [string]$PiHost  = "192.168.0.3",
    [string]$PiUser  = "pi",
    [string]$Image   = "hugoboc/spoolman:nfcIntegration",
    [string]$TarFile = "spoolman-nfcIntegration-armv7.tar"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = $PSScriptRoot
$TarPath  = Join-Path $RepoRoot $TarFile

Write-Host ""
Write-Host "=== Spoolman Pi Deploy ===" -ForegroundColor Cyan
Write-Host "Pi         : $PiUser@$PiHost"
Write-Host "Image      : $Image"
Write-Host "Output tar : $TarPath"
Write-Host ""

# ---------------------------------------------------------------------------
# Step 1: Fix line endings in entrypoint.sh
# ---------------------------------------------------------------------------
Write-Host "[1/4] Fixing line endings in entrypoint.sh..." -ForegroundColor Yellow
$entrypoint = Join-Path $RepoRoot "entrypoint.sh"
(Get-Content $entrypoint -Raw).Replace("`r`n", "`n") | Set-Content $entrypoint -NoNewline
Write-Host "      Done." -ForegroundColor Green

# ---------------------------------------------------------------------------
# Step 2: Build ARMv7 image and export to tar
# ---------------------------------------------------------------------------
Write-Host "[2/4] Building ARMv7 image (this may take a while)..." -ForegroundColor Yellow
Push-Location $RepoRoot
try {
    docker buildx build `
        --platform linux/arm/v7 `
        -t $Image `
        --output "type=docker,dest=$TarPath" `
        .
    if ($LASTEXITCODE -ne 0) { throw "docker buildx build failed (exit $LASTEXITCODE)" }
} finally {
    Pop-Location
}
Write-Host "      Done. $('{0:N0}' -f ((Get-Item $TarPath).Length / 1MB)) MB written to $TarPath" -ForegroundColor Green

# ---------------------------------------------------------------------------
# Step 3: Copy tar to Pi
# ---------------------------------------------------------------------------
Write-Host "[3/4] Copying tar to $PiUser@${PiHost}:/home/$PiUser/ ..." -ForegroundColor Yellow
scp $TarPath "${PiUser}@${PiHost}:/home/$PiUser/"
if ($LASTEXITCODE -ne 0) { throw "scp failed (exit $LASTEXITCODE)" }
Write-Host "      Done." -ForegroundColor Green

# ---------------------------------------------------------------------------
# Step 4: Load image and restart container on Pi
# ---------------------------------------------------------------------------
Write-Host "[4/4] Loading image and restarting Spoolman on Pi..." -ForegroundColor Yellow
$remoteCmd = @"
set -e
echo '--- Loading image ---'
docker load -i /home/$PiUser/$TarFile
echo '--- Restarting container ---'
cd ~/spoolman
docker-compose down
docker-compose up -d
echo '--- Logs (last 30 lines) ---'
docker logs spoolman --tail=30
echo '--- Done ---'
"@
$remoteCmd = $remoteCmd -replace "`r`n", "`n"
ssh "${PiUser}@${PiHost}" $remoteCmd
if ($LASTEXITCODE -ne 0) { throw "SSH remote commands failed (exit $LASTEXITCODE)" }
Write-Host "      Done." -ForegroundColor Green

Write-Host ""
Write-Host "=== Deploy complete ===" -ForegroundColor Cyan
Write-Host "Open: http://${PiHost}:7912"
Write-Host ""
