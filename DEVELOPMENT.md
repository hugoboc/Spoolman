# Development Guide

## Prerequisites

- **Python 3.12** (via WSL/Ubuntu) with the project's `.venv` already created
- **Node.js 20+** on Windows
- **WSL2** (Ubuntu) — the Python virtualenv uses Linux binaries and must run inside WSL

---

## Running in Dev Mode

You need two terminals running simultaneously.

### Terminal 1 — Backend (run inside WSL)

```bash
wsl
cd /mnt/d/00_Coding_Projects/Spoolman
source .venv/bin/activate
SPOOLMAN_CORS_ORIGIN=http://localhost:5173,http://192.168.0.x:5173 uvicorn spoolman.main:app --host 0.0.0.0 --reload
```

- Replace `192.168.0.x` with your actual LAN IP (run `ipconfig` in PowerShell to find it)
- API available directly at `http://localhost:8000`
- `--host 0.0.0.0` binds to all network interfaces so phones/devices on the LAN can reach it
- Auto-reloads on Python file changes

### Terminal 2 — Frontend (run in PowerShell)

```powershell
cd d:\00_Coding_Projects\Spoolman\client
$env:VITE_APIURL = "/api/v1"
$env:VITE_DEV_API_TARGET = "http://127.0.0.1:8000"
npm run dev -- --host 0.0.0.0
```

- Replace `192.168.0.x` with your actual LAN IP
- UI available at `http://192.168.0.x:5173` from any device on the LAN
- Browser API calls go to the Vite dev server at `/api/v1`, which proxies them to the WSL backend at `http://127.0.0.1:8000`
- `--host 0.0.0.0` exposes the Vite dev server on all interfaces
- Hot-reloads on TypeScript/CSS file changes

---

## Running Tests

### Unit tests (no Docker required)

```bash
# Inside WSL with venv activated
python -m pytest tests/ -v
```

### Integration tests (requires Docker)

Integration tests spin up Spoolman + a test runner in Docker against a real database.

```bash
# Run against SQLite only (fastest)
python tests_integration/run.py sqlite

# Run against all supported databases
python tests_integration/run.py
```

Supported targets: `sqlite`, `postgres`, `mariadb`, `cockroachdb`.

### Frontend build check

```powershell
cd d:\00_Coding_Projects\Spoolman\client
npm run build
```

---

## Setting Up the Python Virtualenv (first time)

If `.venv` doesn't exist yet, create it inside WSL:

```bash
wsl
cd /mnt/d/00_Coding_Projects/Spoolman
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

## Installing Frontend Dependencies (first time)

```powershell
cd d:\00_Coding_Projects\Spoolman\client
npm install
```
