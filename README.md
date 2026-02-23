# SentryOS — Zero-Trust Remote Workspace

A Modular Monolith containing a **Python (FastAPI) backend** and a **Next.js 14 frontend** in a single repository.

## Architecture

```
SentryOS_Project/
├── backend/      # FastAPI · WebSocket · VisionTracker · ColorExtractor
└── frontend/     # Next.js 14 App Router · useSecuritySocket · useProximityTether
```

## Subsystems

| Module | Status | Description |
|---|---|---|
| Security WebSocket | ✅ Phase 1 | Real-time event channel between backend and UI |
| Privacy Blur | ✅ Phase 1 | Overlay triggered by gaze-away events |
| Proximity Tether | ✅ Phase 1 (mock) | BLE device tether; locks workstation on distance |
| Chameleon Theme | ✅ Phase 1 (mock) | Adaptive UI colour from ambient light |
| Vision AI (MediaPipe) | 🔜 Phase 2 | Gaze & attention tracking |
| Color Extractor (OpenCV) | 🔜 Phase 2 | Live ambient colour sampling |
| Web Bluetooth | 🔜 Phase 2 | Real BLE proximity scanning |

## Quick Start

**Backend**
```bash
cd backend
python -m venv .venv
# Windows:   .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python main.py
# → http://localhost:8000
# → ws://localhost:8000/ws
```

**Frontend**
```bash
cd frontend
npm install
npm run dev
# → http://localhost:3000
```

## Routes

| Path | Purpose |
|---|---|
| `/` | Navigation hub |
| `/dashboard` | Live integrated status view |
| `/test/bluetooth` | Isolated proximity tether test |
| `/test/privacy` | Privacy blur test (WebSocket) |
| `/test/chameleon` | Adaptive colour theme test |
