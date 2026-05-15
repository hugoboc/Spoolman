# Start Spoolman in development mode.
# Backend runs in a new window via WSL. Frontend runs in this window.

# Auto-detect LAN IP - skip loopback, link-local, and WSL virtual adapters
$ip = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.InterfaceAlias -notmatch "Loopback|WSL" } |
    Where-Object { $_.IPAddress -notmatch "^(127\.|169\.254\.)" } |
    Select-Object -First 1).IPAddress

if (-not $ip) {
    Write-Warning "Could not detect LAN IP, falling back to localhost"
    $ip = "localhost"
}

Write-Host "Using IP: $ip"

# Convert the script's Windows path to a WSL path (e.g. D:\foo -> /mnt/d/foo)
$drive   = $PSScriptRoot.Substring(0, 1).ToLower()
$wslRoot = "/mnt/$drive" + ($PSScriptRoot.Substring(2) -replace '\\', '/')

# Build the bash command and Base64-encode it so PowerShell doesn't mangle && in the new window
$corsOrigins = "http://localhost:5173,http://${ip}:5173"
$bashCmd = "cd $wslRoot && source .venv/bin/activate && SPOOLMAN_CORS_ORIGIN=${corsOrigins} uvicorn spoolman.main:app --host 0.0.0.0 --reload"
$psCmd   = "wsl bash -c '$bashCmd'"
$encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($psCmd))
Start-Process powershell -ArgumentList "-NoExit", "-EncodedCommand", $encoded

# Run frontend in the current window
Set-Location (Join-Path $PSScriptRoot "client")
$env:VITE_APIURL = "/api/v1"
$env:VITE_DEV_API_TARGET = "http://127.0.0.1:8000"

Write-Host ""
Write-Host "Backend : http://localhost:8000  (opening in new window)"
Write-Host "Frontend: http://${ip}:5173  (starting below)"
Write-Host "API     : /api/v1 -> $env:VITE_DEV_API_TARGET"
Write-Host ""

npm run dev -- --host 0.0.0.0
