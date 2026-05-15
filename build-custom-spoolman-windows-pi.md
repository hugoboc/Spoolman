# Build and Deploy Custom Spoolman `nfcIntegration` Image for Raspberry Pi 3

This guide documents the working process to build your custom Spoolman fork/branch on a Windows PC and run it on a Raspberry Pi 3 Model B+ running Klipper/Mainsail.

Target setup:

- Windows PC builds the Docker image.
- Image target architecture: `linux/arm/v7`
- Raspberry Pi loads and runs the image.
- Spoolman runs on: `http://<PI_IP>:7912`
- Docker image name: `hugoboc/spoolman:nfcIntegration`

---

## 1. Why this process is needed

The official Spoolman image works on the Pi because it is already pre-built and published.

Your custom fork needs to be built first. The Klipper Pi is running an older Raspberry Pi OS / Docker setup, so it cannot build the current Spoolman Dockerfile locally because the Dockerfile uses newer BuildKit syntax such as:

```dockerfile
RUN --mount=...
```

The solution is:

1. Build the ARMv7 image on the Windows PC.
2. Export it as a `.tar` file.
3. Copy it to the Pi.
4. Load it into Docker on the Pi.
5. Run it with `docker-compose`.

---

## 2. Required Dockerfile change

Replace the top client build stage of the Dockerfile with this:

```dockerfile
FROM node:20-bookworm-slim AS client-builder

WORKDIR /home/app/spoolman/client

COPY client/package*.json ./
RUN npm install --legacy-peer-deps

COPY client ./

ENV VITE_APIURL=/api/v1
RUN npm run build
```

Keep the rest of the Dockerfile unchanged.

Important details:

- `node:20-bookworm-slim` is used because the client declares Node 20.
- `npm install --legacy-peer-deps` is used because `npm ci` failed due to `package.json` and `package-lock.json` being out of sync.
- `ENV VITE_APIURL=/api/v1` is required, otherwise the browser shows:

```text
Missing API URL
App was built without an API URL.
```

---

## 3. Optional: fix Linux line endings

On Windows, make sure `entrypoint.sh` uses Linux LF line endings.

Run in PowerShell from the Spoolman repo folder:

```powershell
cd D:\00_Coding_Projects\Spoolman

(Get-Content .\entrypoint.sh -Raw).Replace("`r`n", "`n") | Set-Content .\entrypoint.sh -NoNewline
```

This prevents errors like:

```text
standard_init_linux.go:207: exec user process caused "no such file or directory"
```

---

## 4. Build ARMv7 image on Windows PC

Open PowerShell:

```powershell
cd D:\00_Coding_Projects\Spoolman
```

Build and export the image directly to a tar file:

```powershell
docker buildx build `
  --platform linux/arm/v7 `
  -t hugoboc/spoolman:nfcIntegration `
  --output type=docker,dest=spoolman-nfcIntegration-armv7.tar `
  .
```

The final `.` is required. It means “use the current folder as the Docker build context”.

Expected output file:

```text
D:\00_Coding_Projects\Spoolman\spoolman-nfcIntegration-armv7.tar
```

---

## 5. Copy the image to the Raspberry Pi

From Windows PowerShell:

```powershell
scp .\spoolman-nfcIntegration-armv7.tar pi@192.168.0.3:/home/pi/
```

Replace `192.168.0.3` with your Pi IP if different.

To check the Pi IP on the Pi:

```bash
hostname -I
```

---

## 6. Load the image on the Raspberry Pi

SSH into the Pi, then run:

```bash
cd ~

docker load -i spoolman-nfcIntegration-armv7.tar
```

Verify the image exists:

```bash
docker images | grep spoolman
```

Expected:

```text
hugoboc/spoolman   nfcIntegration
```

Check architecture:

```bash
docker image inspect hugoboc/spoolman:nfcIntegration | grep -E '"Architecture"|"Os"'
```

Expected for Raspberry Pi 3 32-bit:

```text
"Architecture": "arm",
"Os": "linux",
```

---

## 7. Docker Compose file on the Pi

Edit the Spoolman compose file:

```bash
nano ~/spoolman/docker-compose.yml
```

Use this:

```yaml
version: '3'

services:
  spoolman:
    image: hugoboc/spoolman:nfcIntegration
    container_name: spoolman
    restart: unless-stopped

    # Required for older Raspberry Pi OS / Docker versions
    security_opt:
      - seccomp=unconfined

    ports:
      - "7912:8000"

    volumes:
      - ./data:/home/app/.local/share/spoolman

    environment:
      - TZ=Europe/Berlin
```

Save:

```text
CTRL+X
Y
ENTER
```

---

## 8. Start the custom Spoolman image

On the Pi:

```bash
cd ~/spoolman

docker-compose down

sudo chown -R 1000:1000 ~/spoolman/data

docker-compose up -d
```

Check status:

```bash
docker ps
```

Expected port mapping:

```text
0.0.0.0:7912->8000/tcp
```

Check logs:

```bash
docker logs spoolman --tail=100
```

Expected healthy log lines include:

```text
Startup complete.
Uvicorn running on http://0.0.0.0:8000
```

Test locally:

```bash
curl http://localhost:7912
```

Expected: HTML from the Spoolman frontend.

---

## 9. Open Spoolman

From your browser:

```text
http://192.168.0.3:7912
```

Replace `192.168.0.3` with your Pi IP.

---

## 10. Moonraker integration

Edit Moonraker config:

```bash
nano ~/moonraker/moonraker.conf
```

Add:

```ini
[spoolman]
server: http://127.0.0.1:7912
```

Restart Moonraker:

```bash
sudo systemctl restart moonraker
```

Then in Mainsail:

```text
Settings → Integrations → Enable Spoolman
```

---

## 11. Rebuild after code changes

On Windows PC:

```powershell
cd D:\00_Coding_Projects\Spoolman

docker buildx build `
  --platform linux/arm/v7 `
  -t hugoboc/spoolman:nfcIntegration `
  --output type=docker,dest=spoolman-nfcIntegration-armv7.tar `
  .
```

Copy again:

```powershell
scp .\spoolman-nfcIntegration-armv7.tar pi@192.168.0.3:/home/pi/
```

On the Pi:

```bash
cd ~

docker load -i spoolman-nfcIntegration-armv7.tar

cd ~/spoolman

docker-compose down
docker-compose up -d

docker logs spoolman --tail=100
curl http://localhost:7912
```

---

## 12. Useful commands

```bash
# Check running containers
docker ps

# Check all containers
docker ps -a

# View Spoolman logs
docker logs spoolman --tail=100

# Follow logs live
docker logs -f spoolman

# Restart Spoolman
cd ~/spoolman
docker-compose restart

# Stop Spoolman
cd ~/spoolman
docker-compose down

# Start Spoolman
cd ~/spoolman
docker-compose up -d

# Test local access
curl http://localhost:7912

# Check image architecture
docker image inspect hugoboc/spoolman:nfcIntegration | grep -E '"Architecture"|"Os"'
```

---

## 13. Roll back to official Spoolman

Edit:

```bash
nano ~/spoolman/docker-compose.yml
```

Change:

```yaml
image: hugoboc/spoolman:nfcIntegration
```

Back to:

```yaml
image: ghcr.io/donkie/spoolman:latest
```

Then:

```bash
cd ~/spoolman

docker-compose down
docker-compose pull
docker-compose up -d

docker logs spoolman --tail=100
curl http://localhost:7912
```

---

## 14. Known issues and fixes

### `Dockerfile parse error: Unknown flag: mount`

Cause: old Docker on the Pi cannot build modern BuildKit syntax.

Fix: build on Windows PC with Docker Buildx instead.

---

### `Missing API URL`

Cause: frontend was built without `VITE_APIURL`.

Fix: Dockerfile client stage must include:

```dockerfile
ENV VITE_APIURL=/api/v1
RUN npm run build
```

---

### `npm ci can only install packages when package.json and package-lock.json are in sync`

Cause: `package-lock.json` does not match `package.json`.

Fix: use:

```dockerfile
RUN npm install --legacy-peer-deps
```

instead of:

```dockerfile
RUN npm ci
```

---

### `exec user process caused "no such file or directory"`

Cause: usually Windows CRLF line endings in `entrypoint.sh`.

Fix on Windows:

```powershell
(Get-Content .\entrypoint.sh -Raw).Replace("`r`n", "`n") | Set-Content .\entrypoint.sh -NoNewline
```

---

### `PermissionError: [Errno 1] Operation not permitted`

Cause: old Docker/seccomp on Raspberry Pi OS Buster blocks newer Python calls.

Fix: keep this in `docker-compose.yml`:

```yaml
security_opt:
  - seccomp=unconfined
```
