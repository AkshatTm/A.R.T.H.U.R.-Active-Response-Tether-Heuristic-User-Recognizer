# Setup Guide

| Field | Value |
|-------|-------|
| **Product** | A.R.T.H.U.R. |
| **Platforms** | Windows 10+, macOS 12+, Ubuntu 20.04+ |
| **Last Updated** | 2026-04-17 |

---

## 1. Prerequisites

### 1.1 Required Software

| Software | Version | Download | Verification |
|----------|---------|----------|-------------|
| **Python** | 3.10+ | [python.org](https://python.org/downloads/) | `python --version` |
| **Node.js** | 20 LTS+ | [nodejs.org](https://nodejs.org/) | `node --version` |
| **npm** | Bundled | Included with Node.js | `npm --version` |
| **Git** | Latest | [git-scm.com](https://git-scm.com/) | `git --version` |
| **Google Chrome** | 91+ | [chrome.google.com](https://www.google.com/chrome/) | `chrome://version` |

### 1.2 Hardware Requirements

| Component | Required | Recommended |
|-----------|----------|-------------|
| **Webcam** | Any USB or built-in laptop camera | 720p integrated webcam |
| **Bluetooth** | Not required (bypass available) | BLE 4.0+ adapter |
| **RAM** | 4 GB | 8 GB |
| **CPU** | Dual-core x86_64 | Quad-core |
| **Disk** | ~500 MB (dependencies) | 1 GB |

---

## 2. Installation

### 2.1 Clone the Repository

```bash
git clone https://github.com/AkshatTm/Sentry-AI.git
cd Sentry-AI
```

### 2.2 Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv .venv

# Activate — Windows PowerShell
.venv\Scripts\Activate.ps1

# Activate — Windows CMD
.venv\Scripts\activate.bat

# Activate — macOS / Linux
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

**Expected output:** All packages install without errors. `mediapipe` and `opencv-python` may take a moment to download (~100 MB total). `bleak` installs the cross-platform BLE library.

### 2.3 Frontend Setup

```bash
cd frontend

# Install Node.js dependencies
npm install
```

**Expected output:** All packages resolve. `framer-motion` and `lucide-react` are the largest.

---

## 3. Running the Application

### 3.1 Start the Backend

```bash
cd backend

# Activate virtual environment (if not already active)
# Windows: .venv\Scripts\Activate.ps1
# macOS/Linux: source .venv/bin/activate

python main.py
```

**Alternative (Windows PowerShell):** Use the launcher script to avoid stderr NativeCommandError:

```powershell
cd backend
.\start_backend.ps1
```

**Expected console output:**

```
HH:MM:SS  INFO      arthur.main  ============================================================
HH:MM:SS  INFO      arthur.main    A.R.T.H.U.R. AI Sensory Engine — Starting Up
HH:MM:SS  INFO      arthur.main  ============================================================
HH:MM:SS  INFO      arthur.main  Vision thread launched
HH:MM:SS  INFO      arthur.main  BLE tether service initialised
INFO:     Uvicorn running on http://0.0.0.0:8000
HH:MM:SS  INFO      arthur.vision  Camera 0 opened successfully
```

**Verify:** Open a browser or new terminal and check the health endpoint:

```bash
# PowerShell
Invoke-WebRequest http://localhost:8000/health | Select-Object -ExpandProperty Content

# curl
curl http://localhost:8000/health
```

Expected: `{"status":"ok","service":"A.R.T.H.U.R.","engine":{...},"vision_thread_alive":true,...}`

### 3.2 Start the Frontend

```bash
cd frontend
npm run dev
```

**Expected console output:**

```
▶ Next.js 14.x.x
- Local: http://localhost:3000
```

Open `http://localhost:3000` in Google Chrome.

### 3.3 Quick Verification Checklist

| # | Check | Expected Result |
|---|-------|----|
| 1 | Navigate to `http://localhost:3000` | GradientMesh animated login page with glassmorphism card |
| 2 | Enter any password and submit | 800ms animation → "ACCESS GRANTED" → redirect to `/setup` |
| 3 | `/setup` page loads | BLE setup wizard with backend-driven device scanning |
| 4 | Scan and pair a BLE device (or click "Skip" if bypassed) | Device paired → redirect to `/dashboard` |
| 5 | Dashboard loads | TopBar visible with "S" lettermark and status dots |
| 6 | WebSocket dot (TopBar) | Green dot in status cluster |
| 7 | Look at webcam | Face count reflected in Eye dot (green = 1 face) |
| 8 | Hold colored object to camera center | Background glow shifts color within ~2s |

---

## 4. Configuration

### 4.1 Environment Variables

| Variable | Where | Default | Description |
|----------|-------|---------|-------------|
| `SENTRY_DEBUG` | Backend | Not set | Set to `1` to enable OpenCV debug overlay showing face bounding boxes, ROI rectangle, FPS counter, and dominant color swatch |
| `NEXT_PUBLIC_BLE_BYPASS` | Frontend | Not set | Set to `true` to disable Bluetooth proximity tether (for development and demos without BLE hardware) |

### 4.2 Backend with Debug Overlay

```powershell
# Windows PowerShell
$env:SENTRY_DEBUG = "1"
python main.py

# macOS / Linux
SENTRY_DEBUG=1 python main.py
```

The debug overlay opens an OpenCV window showing:
- Green rectangles around detected faces
- Yellow rectangle marking the 100×100px color sampling ROI
- FPS counter in the top-left corner
- Dominant color swatch in the bottom-left corner

Press `q` in the debug window to exit.

### 4.3 Frontend with BLE Bypass

```powershell
# Windows PowerShell
$env:NEXT_PUBLIC_BLE_BYPASS = "true"
npm run dev

# macOS / Linux
NEXT_PUBLIC_BLE_BYPASS=true npm run dev
```

When bypassed, the Bluetooth tether is disabled and the UI security state depends only on the camera sensor. The initial state will be BLURRED instead of LOCKED. The `/setup` page can be skipped.

---

## 5. Bluetooth Setup

> **This section is only required if you want to use the Bluetooth proximity tether feature.** If you don't have BLE hardware, use the `NEXT_PUBLIC_BLE_BYPASS=true` environment variable instead.

### 5.1 Backend-Driven BLE (Default)

As of v2.0.0, BLE is handled entirely by the Python backend using the **Bleak** library. No browser extensions or Chrome flags are required for BLE functionality.

**How it works:**
1. Navigate to `/setup` after logging in
2. Click **Scan for devices** — the backend scans using Bleak
3. Available BLE and classic Bluetooth devices are listed
4. Select your device — the backend saves the config to `ble_config.json`
5. On subsequent backend restarts, the device auto-connects — no user action needed

### 5.2 Supported Device Types

| Type | Examples | How It Works |
|------|----------|-------------|
| **Classic Bluetooth** | Earbuds, headphones, speakers | Backend lists OS-paired devices; monitors via periodic scanning |
| **BLE (Low Energy)** | Fitness bands, BLE beacons | Backend uses Bleak scanner to discover and monitor RSSI |

### 5.3 BLE Config Persistence

Paired device info is saved to `backend/ble_config.json`:

```json
{
  "mac": "90:A0:BE:8A:24:66",
  "name": "Nirvana Crystl",
  "tx_power": -59,
  "path_loss_n": 2.0,
  "device_type": "classic"
}
```

To unpair: send `POST /bluetooth/unpair` or delete `ble_config.json` and restart the backend.

### 5.4 RSSI Behavior

| RSSI Range | Distance (approx.) | State |
|-----------|-------------------|-------|
| > -70 dBm | < 2 meters | SECURE (if face count = 1) |
| ≤ -70 dBm | > 2 meters | LOCKED |
| No signal for 10s | Out of range | LOCKED |

---

## 6. Network Configuration

### 6.1 Default Ports

| Service | Port | Protocol |
|---------|------|----------|
| Backend (FastAPI) | `8000` | HTTP / WebSocket |
| Frontend (Next.js) | `3000` | HTTP |

### 6.2 CORS

The backend accepts cross-origin requests from `http://localhost:3000` only. If you change the frontend port, update the `allow_origins` list in `backend/main.py`.

### 6.3 WebSocket

The frontend connects to `ws://localhost:8000/ws`. This URL is hardcoded in `useSecuritySocket.ts`. For deployment to a different host, update the `WS_URL` constant.

### 6.4 BLE REST API

The frontend calls BLE endpoints at `http://localhost:8000/bluetooth/*`. This base URL is defined as `API_BASE` in `useProximityTether.ts` and `setup/page.tsx`.

---

## 7. Troubleshooting

### 7.1 Backend Issues

| Problem | Symptom | Solution |
|---------|---------|----------|
| **Camera not found** | `camera_unavailable` in health check | Ensure webcam is connected and not in use by another application. Check `cv2.VideoCapture(0)` in Python REPL |
| **MediaPipe import error** | `ImportError: mediapipe` | Verify Python 3.10+. Reinstall: `pip install mediapipe --force-reinstall` |
| **Port 8000 in use** | `Address already in use` | Kill the process: `netstat -ano \| findstr :8000` → `taskkill /PID <pid> /F` (Windows) |
| **Module not found** | `ModuleNotFoundError` | Ensure virtual environment is activated. Run `pip install -r requirements.txt` |
| **BLE scan returns empty** | No devices found | Ensure Bluetooth adapter is enabled. On Windows, check Bluetooth settings are on |
| **Bleak import error** | `ImportError: bleak` | Install: `pip install bleak>=0.21.0` |
| **PowerShell stderr error** | NativeCommandError from uvicorn | Use `.\start_backend.ps1` launcher script instead of `python main.py` |

### 7.2 Frontend Issues

| Problem | Symptom | Solution |
|---------|---------|----------|
| **WebSocket won't connect** | Muted WS dot in TopBar status cluster | Ensure backend is running on port 8000. Check browser console for errors |
| **Login loop** | Redirects back to `/` after login | Clear sessionStorage: DevTools → Application → Session Storage → Clear. Or: `sessionStorage.setItem('sentry_auth','1')` in console |
| **Setup loop** | Redirects to `/setup` after pairing | Set `sessionStorage.setItem('sentry_ble_paired','1')` in console |
| **Type errors on build** | `tsc` errors | Run `npm install` to ensure all type definitions are installed |
| **Port 3000 in use** | `EADDRINUSE` | Kill the process or use `npm run dev -- -p 3001` |
| **Fonts not loading** | Satoshi not rendering | Check internet connection (Fontshare CDN). Space Grotesk and IBM Plex Mono load via Next.js `next/font` |

### 7.3 Integration Issues

| Problem | Symptom | Solution |
|---------|---------|----------|
| **CORS errors** | Console shows blocked cross-origin request | Backend must be on `localhost:8000`, frontend on `localhost:3000` |
| **Stale face count** | Face count stuck at old value | Backend vision thread may have crashed. Restart: `python main.py` |
| **Chameleon not updating** | Color doesn't change | Ensure colored object is in center of frame (100×100px ROI). Check `dominant_color` in health endpoint |
| **BLE shows disconnected** | Red BLE dot despite device nearby | Check `GET /bluetooth/status` for backend BLE state. May need to re-pair |
| **Auto-logout fires** | Logged out after 8 seconds | BLE device lost signal briefly. Ensure device stays within ~2m range |

---

## 8. Development Workflow

### 8.1 Running Both Services

For development, run the backend and frontend in separate terminal windows:

**Terminal 1 (Backend):**
```bash
cd backend
.venv\Scripts\Activate.ps1   # Windows
python main.py
```

**Terminal 2 (Frontend):**
```bash
cd frontend
npm run dev
```

### 8.2 Frontend Type Checking

```bash
cd frontend
npx tsc --noEmit
```

### 8.3 Frontend Linting

```bash
cd frontend
npm run lint
```

### 8.4 Application Routes

The application has the following routes with a linear auth flow:

| Route | Purpose | Guard |
|-------|---------|-------|
| `/` | Login page (GradientMesh + glassmorphism card) | None |
| `/setup` | BLE device pairing wizard (backend-driven) | `useSetupGuard()` — requires auth |
| `/dashboard` | Master dashboard with all security subsystems | `useAuthGuard()` — requires auth + BLE |

---

## 9. Production Considerations

> A.R.T.H.U.R. is currently designed for local development and demo use. The following changes would be required for production deployment:

| Area | Current | Production Requirement |
|------|---------|----------------------|
| WebSocket | `ws://` (unencrypted) | `wss://` with TLS termination |
| Authentication | sessionStorage demo auth (two-key) | OAuth 2.0 / SAML / enterprise SSO |
| BLE | `localhost` backend Bleak | Same (Bleak works in production) |
| CORS | `localhost:3000` only | Configure for production domain |
| Backend host | `0.0.0.0:8000` | Reverse proxy (nginx) with SSL |
| Logging | Console stdout | Structured logging to monitoring platform |
| Process management | Manual `python main.py` | systemd / Docker / PM2 |
| BLE config | `ble_config.json` on disk | Encrypted config or environment variable |
