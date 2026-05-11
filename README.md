<div align="center">

# A.R.T.H.U.R.

### Active Response Tether & Heuristic User Recognizer

### AI-Powered Zero-Trust Physical Endpoint Security

[![Python 3.10+](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)](https://python.org)
[![Next.js 14](https://img.shields.io/badge/Next.js-14-000000?logo=next.js)](https://nextjs.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100%2B-009688?logo=fastapi)](https://fastapi.tiangolo.com)
[![MediaPipe](https://img.shields.io/badge/MediaPipe-Face%20Detection-4285F4?logo=google)](https://mediapipe.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**A.R.T.H.U.R.** is a proactive, edge-compute endpoint security system that continuously verifies the physical security of a workspace using computer vision, Bluetooth proximity tethering, and adaptive UI obfuscation — all processed locally with zero cloud dependency.

[Quick Start](#quick-start) · [Architecture](#architecture) · [Features](#features) · [Documentation](#documentation) · [Demo](#demo-mode)

</div>

---

## Overview

Traditional endpoint security relies on software perimeters — VPNs, firewalls, and session timeouts. A.R.T.H.U.R. addresses the **physical zero-trust gap**: shoulder surfing, device abandonment, and unauthorized screen viewing.

The system fuses three independent security signals into a deterministic state machine:

| Signal | Technology | Threat Mitigated |
|--------|-----------|-----------------|
| **Face Detection** | MediaPipe + OpenCV | Shoulder surfing (multiple faces), user absence (zero faces) |
| **Proximity Tether** | Python Bleak BLE (backend-driven) | Device abandonment (user walks away) |
| **Chameleon UI** | K-Means color extraction | Visual clearance feedback via ambient color theming |

## Architecture

```
┌─────────────────────────────┐     WebSocket (10 Hz)     ┌──────────────────────────────┐
│     Python Backend          │ ──────────────────────►   │      Next.js Frontend        │
│                             │  JSON sensor + BLE payload │                              │
│  ┌────────────────────────┐ │                            │  ┌────────────────────────┐  │
│  │ Vision Thread (daemon) │ │                            │  │ useSecuritySocket()    │  │
│  │  • MediaPipe faces     │ │                            │  │ useProximityTether()   │  │
│  │  • K-Means color       │ │                            │  │ useSecurityState()     │  │
│  └──────────┬─────────────┘ │  REST (scan/pair/unpair)   │  │ useBleAutoLogout()     │  │
│             │ mutex          │ ◄────────────────────────  │  └──────────┬─────────────┘  │
│  ┌──────────▼─────────────┐ │                            │             │                │
│  │ ThreadSafeState        │ │                            │  ┌──────────▼─────────────┐  │
│  └──────────┬─────────────┘ │                            │  │ Security State Machine │  │
│             │                │                            │  │ SECURE/BLURRED/LOCKED  │  │
│  ┌──────────▼─────────────┐ │                            │  └────────────────────────┘  │
│  │ FastAPI /ws broadcaster│ │                            │  ┌────────────────────────┐  │
│  └────────────────────────┘ │                            │  │ GlassOverlay + Lock    │  │
│  ┌────────────────────────┐ │                            │  │ ChameleonWrapper       │  │
│  │ BLETetherService       │ │                            │  │ TiltCard + NumberFlip  │  │
│  │  • Bleak scan/pair     │ │                            │  │ GradientMesh           │  │
│  │  • RSSI monitoring     │ │                            │  └────────────────────────┘  │
│  └────────────────────────┘ │                            │                              │
└─────────────────────────────┘                            └──────────────────────────────┘
```

## Features

### Active Obfuscation (Camera)
Real-time face counting via MediaPipe. If **zero or more than one** face appears in the frame, the UI instantly applies a cryptographic blur (`blur(24px) + grayscale(80%)`) to all sensitive content.

### Hardware Proximity Tether (Bluetooth)
The **Python backend** manages BLE proximity via the Bleak library. It scans, pairs, and continuously monitors RSSI of a paired Bluetooth device (earbuds, smartwatch, phone). If the device RSSI drops below the threshold (~2 m range), the session hard-locks. Device config is persisted to `ble_config.json` for automatic reconnection on restart.

### Chameleon UI (Adaptive Theming)
Extracts the dominant color from a center-frame ROI using MiniBatchKMeans clustering. CSS custom properties update at 60 fps via Framer Motion value tunnelling — zero React re-renders.

### 3D Interactive Dashboard
The redesigned dashboard features **TiltCard** 3D mouse-tracked perspective cards, **NumberFlip** animated metric values, and a **Catppuccin-inspired** code panel with syntax highlighting. Typography uses Satoshi (display), Space Grotesk (body), and IBM Plex Mono (code).

### Presentation Mode
Keyboard shortcuts (`Ctrl+Shift+L/B/S/0`) override sensor-driven state for live demos. A subtle presenter-only toast confirms the active override.

### BLE Auto-Logout Watchdog
When a paired BLE device disconnects, an 8-second grace-period countdown begins. If the device doesn't reconnect within that window, the session is automatically cleared and the user is logged out.

## Quick Start

### Prerequisites

- **Python 3.10+** with `pip`
- **Node.js 20 LTS+** with `npm`
- **Webcam** (built-in laptop camera or USB)
- **Google Chrome 91+** (for UI and Web Bluetooth fallback)
- **Bluetooth adapter** (optional — backend handles BLE via Bleak)

### Backend

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
python main.py
```

The backend starts at `http://localhost:8000` with:
- WebSocket endpoint at `ws://localhost:8000/ws`
- BLE REST API at `/bluetooth/scan`, `/bluetooth/pair`, `/bluetooth/status`, `/bluetooth/unpair`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend starts at `http://localhost:3000`.

> **No Bluetooth hardware?** Start the frontend with the BLE bypass:
> ```bash
> # Windows PowerShell
> $env:NEXT_PUBLIC_BLE_BYPASS="true"; npm run dev
>
> # macOS / Linux
> NEXT_PUBLIC_BLE_BYPASS=true npm run dev
> ```

### Verify the Stack

| Check | How | Expected |
|-------|-----|----------|
| Backend health | `GET http://localhost:8000/health` | `{"status": "ok", ...}` |
| BLE status | `GET http://localhost:8000/bluetooth/status` | `{"connected": false, ...}` |
| WebSocket data | Open `/dashboard` → watch TopBar | Green WS dot, live face count |
| Camera | Look at webcam | Face count = `1` in TopBar |
| Chameleon | Hold colored object to camera | Background glow shifts to match |

## Routes

| Path | Description |
|------|-------------|
| `/` | Login page (glassmorphism card, GradientMesh background, session auth) |
| `/setup` | BLE device pairing wizard (backend-driven scan + pair) |
| `/dashboard` | Master integrated dashboard with all security subsystems |

### Authentication Flow

```
Login (/) → BLE Setup (/setup) → Dashboard (/dashboard)
```

Two session keys are managed via `sessionStorage`:
- `sentry_auth` — set on successful login
- `sentry_ble_paired` — set after BLE device is confirmed on `/setup`

The dashboard requires **both** keys. Missing auth redirects to `/`, missing BLE redirects to `/setup`.

## Demo Mode

During presentations, use keyboard shortcuts to override live sensor state:

| Shortcut | Result |
|----------|--------|
| `Ctrl + Shift + L` | Force **LOCKED** (full lock screen) |
| `Ctrl + Shift + B` | Force **BLURRED** (privacy blur) |
| `Ctrl + Shift + S` | Force **SECURE** (clear dashboard) |
| `Ctrl + Shift + 0` | Release override (sensors resume) |

## Project Structure

```
SentryOS_Project/
├── backend/
│   ├── main.py                  # FastAPI app, WebSocket broadcaster, BLE REST endpoints
│   ├── models.py                # SensorPayload dataclass, ThreadSafeState (mutex)
│   ├── vision_thread.py         # Camera capture loop, frame orchestrator
│   ├── vision_tracker.py        # MediaPipe face detection wrapper
│   ├── color_extractor.py       # ROI → K-Means → HEX color
│   ├── ble_tether.py            # BLE proximity tether service (Bleak)
│   ├── ble_config.py            # BLE device config persistence (JSON)
│   ├── ble_config.json          # Persisted paired device config
│   ├── start_backend.ps1        # PowerShell launcher (avoids stderr issues)
│   └── requirements.txt         # Python dependencies (incl. bleak)
│
├── frontend/
│   └── src/
│       ├── app/
│       │   ├── page.tsx              # Login page (GradientMesh + glassmorphism)
│       │   ├── layout.tsx            # Root layout (Space Grotesk + IBM Plex Mono)
│       │   ├── globals.css           # Design token system + CSS utilities
│       │   ├── setup/page.tsx        # BLE setup wizard (backend-driven)
│       │   └── dashboard/page.tsx    # Master dashboard (TiltCard + NumberFlip)
│       ├── components/
│       │   ├── ChameleonWrapper.tsx   # CSS variable injection engine
│       │   ├── GlassOverlay.tsx       # Security blur/lock filter
│       │   ├── LockScreen.tsx         # Full-screen BLE lock overlay
│       │   ├── GradientMesh.tsx       # Animated 3-color gradient mesh background
│       │   ├── TiltCard.tsx           # 3D mouse-tracked perspective tilt card
│       │   └── NumberFlip.tsx         # Animated number entrance component
│       ├── context/
│       │   └── PresentationModeContext.tsx  # Keyboard override engine
│       ├── hooks/
│       │   ├── useSecuritySocket.ts   # WebSocket client (camera + BLE data)
│       │   ├── useProximityTether.ts  # BLE REST actions (scan/pair/unpair)
│       │   ├── useSecurityState.ts    # Security state machine
│       │   ├── useBleAutoLogout.ts    # BLE disconnect auto-logout watchdog
│       │   └── useAuthGuard.ts        # Two-key session route guard
│       └── types/
│           └── bluetooth.d.ts         # Web Bluetooth TS augmentations
│
├── PRD.md                        # Product Requirements Document
├── Design.md                     # System Architecture & Design
├── TECH_STACK.md                 # Technology Stack Reference
├── state.md                      # Project Status & Changelog
├── API_REFERENCE.md              # WebSocket, REST & BLE API Reference
├── SETUP_GUIDE.md                # Detailed Setup & Configuration
├── CONTRIBUTING.md               # Contribution Guidelines
└── README.md                     # This file
```

## Documentation

| Document | Description |
|----------|-------------|
| [Product Requirements](PRD.md) | Problem statement, feature specifications, acceptance criteria |
| [Architecture & Design](Design.md) | System design, concurrency model, state machine, data flow |
| [Tech Stack](TECH_STACK.md) | Technology choices with rationale |
| [Project Status](state.md) | Implementation status, changelog, known limitations |
| [API Reference](API_REFERENCE.md) | WebSocket protocol, REST endpoints, BLE API, data contracts |
| [Setup Guide](SETUP_GUIDE.md) | Detailed installation, configuration, and troubleshooting |
| [Contributing](CONTRIBUTING.md) | Code standards, PR workflow, development guidelines |

## Security Model

A.R.T.H.U.R. follows a **fail-closed** security posture:

- **No Bluetooth device** → LOCKED (not BLURRED)
- **Camera failure** → BLURRED (not SECURE)
- **WebSocket disconnect** → BLURRED (not SECURE)
- **Zero faces detected** → BLURRED (user absent)
- **Multiple faces** → BLURRED (potential shoulder surfer)
- **Exactly one face + BLE in range** → SECURE

All image processing happens **in-memory only**. No frames are saved, recorded, or transmitted. Only integer face counts and HEX color strings leave the vision pipeline.

## License

This project is developed as part of the ML coursework at Lovely Professional University.

---

<div align="center">
  <sub>Built with MediaPipe · FastAPI · Next.js · Framer Motion · Bleak · Satoshi · Space Grotesk</sub>
</div>
