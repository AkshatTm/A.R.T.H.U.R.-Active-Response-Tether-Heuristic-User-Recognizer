# System Architecture & Design

| Field | Value |
|-------|-------|
| **Product** | A.R.T.H.U.R. |
| **Version** | 2.0.0 |
| **Pattern** | Decoupled Modular Monolith / Edge-Compute AI |
| **Last Updated** | 2026-04-17 |

---

## 1. Architectural Overview

A.R.T.H.U.R. uses a **Decoupled Modular Monolith** architecture. Two independent runtime environments coexist in a single repository, communicating through a local WebSocket channel (push) and REST endpoints (pull):

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              A.R.T.H.U.R. System                                │
│                                                                             │
│  ┌──────────────────────────┐            ┌──────────────────────────────┐   │
│  │   Edge AI Engine         │  WS 10 Hz  │   Zero-Trust Terminal        │   │
│  │   Python / FastAPI       │ ──────────►│   Next.js / React            │   │
│  │                          │   JSON      │                              │   │
│  │  • Camera capture        │            │  • Security state machine    │   │
│  │  • Face detection        │  REST API  │  • Adaptive UI/UX            │   │
│  │  • Color extraction      │ ◄──────────│  • BLE scan/pair UI          │   │
│  │  • BLE tether (Bleak)    │  BLE actions│  • 3D interactive dashboard │   │
│  │  • Health monitoring     │            │  • Presentation mode         │   │
│  └──────────────────────────┘            └──────────────────────────────┘   │
│                                                                             │
│  Integration: WebSocket (ws://localhost:8000/ws) + REST API                │
│  WS Direction: Unidirectional (Server → Client push)                       │
│  WS Rate:     10 Hz (100ms intervals)                                      │
│  REST:        /bluetooth/scan, /bluetooth/pair, /bluetooth/status,         │
│               /bluetooth/unpair, /health                                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.1 Design Rationale

| Decision | Rationale |
|----------|-----------|
| **Separate runtimes** | Python's ML ecosystem (MediaPipe, scikit-learn, OpenCV) and BLE ecosystem (Bleak) have no viable JavaScript equivalents; Next.js provides the richest browser API integration |
| **Local WebSocket** | Sub-10ms latency on localhost; no serialization overhead of REST polling; true push semantics for both camera and BLE data |
| **Backend BLE** | Bleak provides cross-platform BLE access without browser limitations; no Chrome experimental flags required; persistent device config; auto-reconnect on restart |
| **Monorepo** | Single deployment unit; shared documentation; atomic version control |
| **Edge-only processing** | Privacy compliance (no cloud); zero network dependency; deterministic latency |

---

## 2. Module Architecture

### 2.1 Repository Structure

```
SentryOS_Project/
├── backend/                         # Python AI Engine (Port 8000)
│   ├── main.py                      # FastAPI app, lifespan, WS broadcaster, BLE REST, /health
│   ├── models.py                    # SensorPayload, ThreadSafeState (mutex)
│   ├── vision_thread.py             # Camera loop, frame orchestrator, debug overlay
│   ├── vision_tracker.py            # MediaPipe Face Detection wrapper
│   ├── color_extractor.py           # ROI → MiniBatchKMeans → HEX
│   ├── ble_tether.py                # BLE proximity tether service (Bleak scanner/client)
│   ├── ble_config.py                # BLE device config persistence (JSON file)
│   ├── ble_config.json              # Persisted paired device config
│   ├── start_backend.ps1            # PowerShell launcher (avoids stderr NativeCommandError)
│   ├── blaze_face_short_range.tflite # MediaPipe model artifact
│   └── requirements.txt
│
├── frontend/                        # Next.js Terminal (Port 3000)
│   └── src/
│       ├── app/
│       │   ├── page.tsx                         # Login (GradientMesh + glassmorphism)
│       │   ├── layout.tsx                       # Root layout (Space Grotesk + IBM Plex Mono)
│       │   ├── globals.css                      # Design token system + CSS variables
│       │   ├── setup/page.tsx                   # BLE setup wizard (backend-driven)
│       │   └── dashboard/page.tsx               # Master dashboard (TiltCard + NumberFlip)
│       ├── components/
│       │   ├── ChameleonWrapper.tsx             # Motion Value → CSS variable bridge
│       │   ├── GlassOverlay.tsx                 # Security filter (blur/grayscale)
│       │   ├── LockScreen.tsx                   # Full-screen BLE lock overlay
│       │   ├── GradientMesh.tsx                 # Animated 3-color gradient mesh bg
│       │   ├── TiltCard.tsx                     # 3D mouse-tracked perspective tilt
│       │   └── NumberFlip.tsx                   # Animated number entrance
│       ├── context/
│       │   └── PresentationModeContext.tsx      # Keyboard override engine
│       ├── hooks/
│       │   ├── useSecuritySocket.ts             # WebSocket client (camera + BLE data)
│       │   ├── useProximityTether.ts            # BLE REST actions (scan/pair/unpair)
│       │   ├── useSecurityState.ts              # State machine consolidator
│       │   ├── useBleAutoLogout.ts              # BLE disconnect auto-logout watchdog
│       │   └── useAuthGuard.ts                  # Two-key session route guard
│       └── types/
│           └── bluetooth.d.ts                   # Web Bluetooth TS augmentations
│
├── *.md                             # Documentation (root-level)
└── README.md                        # Project overview
```

### 2.2 Module Dependency Graph

```
                    ┌──────────────────────┐
                    │    Dashboard Page     │
                    └──────────┬───────────┘
                               │ uses
            ┌──────────────────┼──────────────────┐
            │                  │                  │
            ▼                  ▼                  ▼
    ┌───────────────┐  ┌──────────────┐  ┌───────────────┐
    │ useAuthGuard  │  │useSecurityState│  │Presentation   │
    │ (2-key guard) │  └──────┬───────┘  │ModeContext    │
    └───────────────┘         │ uses     └───────────────┘
                    ┌─────────┼─────────┐
                    ▼                   ▼
          ┌──────────────────┐  ┌──────────────────┐
          │useSecuritySocket │  │useProximityTether │
          │  (camera + BLE)  │  │  (REST actions)   │
          └────────┬─────────┘  └──────────────────┘
                   │ connects            │ REST calls
                   ▼                     ▼
          ┌──────────────────────────────────────┐
          │         Python Backend                │
          │  ws://…:8000/ws (push)                │
          │  /bluetooth/* (REST)                  │
          │  ┌──────────┐  ┌───────────────────┐  │
          │  │ Vision   │  │ BLETetherService  │  │
          │  │ Thread   │  │ (Bleak)           │  │
          │  └──────────┘  └───────────────────┘  │
          └──────────────────────────────────────┘
```

---

## 3. Backend Architecture

### 3.1 Concurrency Model

The backend employs **thread isolation** to prevent the blocking `cv2.VideoCapture` and MediaPipe inference from stalling the async FastAPI event loop. The BLE tether service uses `asyncio` natively.

```
┌─────────────────────────────────┐          ┌──────────────────────────────┐
│       Vision Thread (daemon)     │          │   Main Thread (uvicorn)       │
│                                  │          │                              │
│  while running:                  │  mutex   │  FastAPI ASGI App            │
│    frame = camera.read()         │ ────────►│    /ws → broadcast loop      │
│    faces = mediapipe(frame)      │  write   │    /health → status probe    │
│    color = kmeans(roi(frame))    │          │    /bluetooth/* → BLE REST   │
│    state.update(faces, color)    │          │                              │
│                                  │          │  BLETetherService (async)    │
│                                  │          │    → RSSI monitoring         │
│                                  │          │    → state.update_ble()      │
│                                  │          │                              │
│                                  │          │  state.get_snapshot()        │
│                                  │          │    └→ shallow dict copy      │
└─────────────────────────────────┘          └──────────────────────────────┘
```

| Thread | Responsibility | Blocking? | I/O |
|--------|---------------|-----------|-----|
| **Vision Thread** (daemon) | Camera read, face detection, color extraction | Yes (synchronous `cv2`) | Camera hardware |
| **Main Thread** (uvicorn) | ASGI event loop, WebSocket broadcast, REST, BLE tether | No (fully async) | Network I/O, BLE (Bleak) |

**Thread Safety:** All reads/writes to `SensorPayload` go through `ThreadSafeState`, which guards internal state with a `threading.Lock`. The lock is held only for shallow copies (dict snapshots), never during I/O or `await` calls, so contention is negligible. BLE state is updated via `state.update_ble()` from the async BLE service.

### 3.2 Vision Pipeline

```
Camera Frame (30 FPS)
    │
    ├─── Every Frame ─────► MediaPipe Face Detection ──► face_count (int)
    │                         (short-range, ≤ 2m)
    │
    └─── Every 1.0s ──────► Center ROI (100×100px) ──► MiniBatchKMeans
                              Crop & reshape             K=3 clusters
                                                           │
                                                           ▼
                                                     dominant_color (HEX)
```

**Optimization decisions:**
- Face detection runs on **every frame** (latency-critical for security)
- Color extraction runs at **1 Hz** (aesthetic feature; CPU conservation)
- MiniBatchKMeans processes only a **100×100px ROI** (10,000 pixels vs. 2M+ for 1080p)
- `random_state=42` ensures deterministic clustering

### 3.3 Camera Lifecycle

```
Startup → Retry Loop (5 attempts, 1s → 10s backoff)
    ├── Success → system_status = "active"
    └── Failure → system_status = "camera_unavailable"
                  face_count = -1

Runtime → frame = camera.read()
    ├── Success → process normally
    └── ret=False → increment failure counter
                    5 consecutive failures → "camera_unavailable"
```

### 3.4 BLE Tether Service

The BLE tether runs as an async service within the main event loop using the **Bleak** library:

```
Startup → auto_connect()
    ├── ble_config.json exists?
    │     ├── Yes → Start monitoring saved device (auto-reconnect)
    │     └── No  → Wait for user to scan & pair via REST API
    │
Runtime:
    ├── /bluetooth/scan  → Scan BLE + list classic devices
    ├── /bluetooth/pair  → Save config → Start RSSI monitoring
    ├── /bluetooth/status → Return current BLE state
    └── /bluetooth/unpair → Stop monitoring → Delete config

    RSSI Monitor Loop:
    ├── Read RSSI at ~1-2 Hz
    ├── Apply smoothing + distance calculation
    └── state.update_ble(connected, rssi, distance, device_name)
```

**Config persistence:** Paired device info is saved to `ble_config.json` with these fields:

```json
{
  "mac": "90:A0:BE:8A:24:66",
  "name": "Nirvana Crystl",
  "tx_power": -59,
  "path_loss_n": 2.0,
  "device_type": "classic"
}
```

### 3.5 WebSocket Broadcasting

- **Rate:** 10 Hz (100ms intervals via `asyncio.sleep(0.1)`)
- **Direction:** Unidirectional server → client push
- **Payload:** Camera data (face_count, dominant_color, system_status) **and** BLE data (ble_connected, ble_rssi, ble_distance_m, ble_device_name) in a single flat JSON object
- **Client limit:** Single client enforced (ADR-03). Second connections receive close code `4001`
- **Handshake:** On connect, server sends `{"event": "connected", "message": "A.R.T.H.U.R. WebSocket ready", "version": "1.0.0"}`
- **Drain:** Background task consumes any client-sent messages to prevent buffer overflow

---

## 4. Frontend Architecture

### 4.1 Hook Abstraction Layer

All complex browser APIs (WebSocket) and backend REST interactions (BLE) are encapsulated in custom hooks, keeping the presentation layer focused on rendering.

| Hook | Input | Output | API |
|------|-------|--------|-----|
| `useSecuritySocket` | — | `sensorData` (camera + BLE), `isConnected`, `socketStatus` | `ws://localhost:8000/ws` |
| `useProximityTether` | — | `scan`, `pair`, `unpair`, `isPairing`, `availableDevices` | REST `/bluetooth/*` |
| `useSecurityState` | (internal: both hooks above) | `securityState`, all sensor data, BLE actions | Composition |
| `useBleAutoLogout` | `bleConnected`, `logout` | `isGracePeriod`, `remainingSeconds` | Internal timer |
| `useAuthGuard` | — | redirect side-effect | `sessionStorage` (two-key) |
| `useSetupGuard` | — | redirect side-effect | `sessionStorage` (auth-only) |

### 4.2 State Machine

The `useSecurityState` hook implements a deterministic finite state machine with three states. The `deriveSecurityState()` function is pure (no side effects) and exported separately for unit testing. BLE state is now sourced from the WebSocket payload (backend-driven).

```
                    ┌──────────────────────┐
                    │   Sensor Inputs       │
                    │                      │
                    │  bleConnected: bool   │  ← from WebSocket payload
                    │  faceCount: int|null  │  ← from WebSocket payload
                    │  isConnected: bool    │  ← WebSocket connection state
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │  Priority Evaluation  │
                    │                      │
                    │  1. BLE disconnected? │──── yes ──► LOCKED
                    │  2. WS offline?       │──── yes ──► BLURRED
                    │  3. face = -1?        │──── yes ──► BLURRED
                    │  4. face = 0?         │──── yes ──► BLURRED
                    │  5. face > 1?         │──── yes ──► BLURRED
                    │  6. face = 1          │──── yes ──► SECURE
                    └──────────────────────┘
```

### 4.3 CSS Variable Engine (ChameleonWrapper)

To avoid React re-render overhead during continuous color updates, the Chameleon system uses **Motion Value Tunnelling**:

```
WebSocket dominantColor (HEX)
    │
    ▼
Framer Motion animate({ color: newHex })
    │
    ▼
MotionValue<string> onChange callback
    │
    ▼
document.documentElement.style.setProperty('--theme-primary', color)
    │
    ▼
CSS cascade: var(--theme-primary) → var(--theme-glow) → var(--theme-border)
             (via color-mix())
```

**Saturation Guard:** Colors with saturation < 15% or lightness < 10% are rejected. The system holds the last vivid color to prevent grey/black themes.

**Performance:** Zero React re-renders. The entire interpolation pipeline operates below React's reconciliation cycle at native 60 fps.

### 4.4 Design Token System

The UI uses a comprehensive CSS custom property system defined in `globals.css`:

| Category | Tokens | Purpose |
|----------|--------|---------|
| **Foundations** | `--color-bg`, `--color-surface`, `--color-surface-raised` | Warm dark palette (not pure black) |
| **Text** | `--color-text`, `--color-text-secondary`, `--color-muted` | Three-level text hierarchy |
| **Borders** | `--color-border`, `--color-border-subtle` | Two-level border system |
| **Semantic** | `--color-accent`, `--color-success`, `--color-danger`, `--color-warning` | Status colors |
| **Chameleon** | `--theme-primary`, `--chameleon-bg`, `--theme-glow`, `--theme-border` | Runtime-mutated by ChameleonWrapper |
| **Typography** | `--font-display` (Satoshi), `--font-body` (Space Grotesk), `--font-mono` (IBM Plex Mono) | Three-font system |

### 4.5 Security UI Components

| Component | State | Visual Effect |
|-----------|-------|----|
| `GlassOverlay` | SECURE | No filter; `pointerEvents: auto` |
| `GlassOverlay` | BLURRED | `blur(24px) + grayscale(80%)` ; `pointerEvents: none` |
| `GlassOverlay` | LOCKED | `blur(40px) + grayscale(100%) + brightness(40%)`; `pointerEvents: none` |
| `LockScreen` | LOCKED | Full-screen overlay with RSSI meter, device info, re-pair button |

All transitions use Framer Motion with 400ms ease-in-out easing.

### 4.6 Interactive UI Components (v2.0.0)

| Component | Purpose | Key Features |
|-----------|---------|-------------|
| `TiltCard` | 3D mouse-tracked perspective tilt | ±4° tilt, specular highlight, spring-physics return-to-neutral |
| `NumberFlip` | Animated number entrance | Slide-up with blur fade, key-change triggers remount animation |
| `GradientMesh` | Animated gradient mesh background | 3 Framer Motion blobs drifting on 18-26s cycles, vignette overlay |

### 4.7 Presentation Mode Override

The `PresentationModeContext` wraps the dashboard and provides keyboard-driven state overrides that sit **above** the sensor-derived state:

```
finalSecurityState = overrideState ?? securityState
```

| Shortcut | Override Value |
|----------|---------------|
| `Ctrl + Shift + L` | LOCKED |
| `Ctrl + Shift + B` | BLURRED |
| `Ctrl + Shift + S` | SECURE |
| `Ctrl + Shift + 0` | Release (sensors resume) |

### 4.8 Authentication Flow

The `useAuthGuard` module implements a **two-key session guard**:

```
Login (/)
  │ sets: sentry_auth = "1"
  ▼
BLE Setup (/setup)         ← useSetupGuard() (requires auth only)
  │ sets: sentry_ble_paired = "1"
  ▼
Dashboard (/dashboard)     ← useAuthGuard() (requires both keys)
```

| Guard | Required Keys | Missing Auth → | Missing BLE → |
|-------|--------------|----------------|---------------|
| `useSetupGuard()` | `sentry_auth` | Redirect `/` | N/A |
| `useAuthGuard()` | `sentry_auth` + `sentry_ble_paired` | Redirect `/` | Redirect `/setup` |

The `logout()` function clears both keys and redirects to `/`.

---

## 5. Data Flow

### 5.1 End-to-End Pipeline

```
Camera ──► Vision Thread ──► ThreadSafeState ──► FastAPI /ws ──► WebSocket
  │              │                  ▲                                  │
  │         MediaPipe +             │                                  │
  │         K-Means                 │                                  │
  │                          BLETetherService                          │
  │                          (Bleak RSSI)                              │
  │                                                                    │
  └──────────────── < 250ms total ────────────────────────────────────►│
                                                                       │
                                                               useSecuritySocket
                                                               (camera + BLE data)
                                                                       │
                          useProximityTether ──────────────────►useSecurityState
                          (REST: scan/pair)                           │
                                                               deriveSecurityState()
                                                                       │
                                                               GlassOverlay / LockScreen
                                                               ChameleonWrapper
                                                               TiltCard / NumberFlip
```

### 5.2 Error Propagation

| Failure Point | Detection | Backend Behavior | Frontend Behavior |
|--------------|-----------|-----------------|-------------------|
| Camera hardware | `cv2.read() → False` | `face_count: -1`, status: `camera_unavailable` | BLURRED |
| MediaPipe inference | Exception in vision thread | Logged; face_count unchanged | Stale data (safe) |
| WebSocket disconnect | Client `onclose` event | Slot released; ready for reconnect | BLURRED; exponential backoff reconnect |
| BLE device out of range | Bleak RSSI below threshold | `ble_connected: false` | LOCKED |
| BLE device unpaired | `POST /bluetooth/unpair` | `ble_connected: false`, config deleted | LOCKED |
| BLE service failure | Bleak exception | `ble_connected: false` | LOCKED (fail-closed) |
| BLE grace period expires | `useBleAutoLogout` timer | N/A | Session cleared, redirect to `/` |

---

## 6. Architecture Decision Records (ADRs)

| ID | Decision | Context | Status |
|----|----------|---------|--------|
| ADR-01 | Flat WebSocket JSON schema | Minimal parsing overhead; direct field access; no nested objects; extended with `ble_*` fields in v2.0.0 | **Enforced** |
| ADR-02 | Bluetooth fail-closed (LOCKED) | Zero-trust principle: absence of proof of presence = maximum restriction | **Enforced** |
| ADR-03 | Single WebSocket client limit | Prevents state conflicts; simplifies broadcast logic; close code `4001` | **Enforced** |
| ADR-04 | Debug overlay gated by `SENTRY_DEBUG=1` | Zero overhead in production; visual debugging for development | **Enforced** |
| ADR-05 | snake_case → camelCase at hook boundary | Python convention on backend; TypeScript convention on frontend; transform once; applies to `ble_*` fields too | **Enforced** |
| ADR-06 | 100ms debounce on WS connect | Survives React 18 Strict Mode mount-unmount-remount cycle | **Enforced** |
| ADR-07 | Motion Value Tunnelling for CSS variables | Zero re-renders during color transitions; native 60fps interpolation | **Enforced** |
| ADR-08 | Saturation Guard (S≥15%, L≥10%) | Prevents desaturated/dark colors from degrading UI readability | **Enforced** |
| ADR-09 | LockScreen auto-heal on BLE restore | Informational lock — system resumes automatically when tether is restored | **Enforced** |
| ADR-10 | sessionStorage for demo auth | Session self-destructs on tab close; clean state between demo runs; two-key system (auth + BLE) | **Enforced** |
| ADR-11 | Presentation override above hook layer | Override doesn't pollute sensor data; clean separation of concerns | **Enforced** |
| ADR-12 | Backend-driven BLE via Bleak | Eliminates browser Web Bluetooth limitations (experimental flags, HTTPS requirement); enables classic BT device support; persistent device config; auto-reconnect on startup | **Enforced** |
| ADR-13 | BLE auto-logout with 8s grace period | Prevents accidental session disruption from momentary BLE signal drops; only activates after first successful connection | **Enforced** |

---

## 7. Security Considerations

### 7.1 Threat Model (In-Scope)

| Threat | Mitigation | Component |
|--------|-----------|-----------|
| Shoulder surfing | Active face counting + blur | Vision Thread → GlassOverlay |
| Device abandonment | BLE proximity tether (backend Bleak) | BLETetherService → LockScreen |
| Camera bypass | Fail-closed on camera fault | face_count = -1 → BLURRED |
| Bluetooth bypass | Fail-closed on BLE absence | ble_connected = false → LOCKED |
| Momentary BLE dropout | 8-second grace period before logout | useBleAutoLogout |

### 7.2 Privacy Guarantees

- **No frame persistence:** Video frames exist only in memory during the processing loop. No frame is ever written to disk, transmitted over the network, or logged.
- **Metadata only:** The WebSocket payload contains only integers (`face_count`), booleans (`ble_connected`), floats (`ble_distance_m`), and strings (`dominant_color`, `system_status`, `ble_device_name`). No image data, facial features, or biometric identifiers are transmitted.
- **Local-only communication:** All traffic is `localhost`. No external endpoints are contacted.

### 7.3 Known Limitations

- WebSocket is unencrypted (`ws://` not `wss://`) — acceptable for localhost edge processing; would require TLS termination for network deployment.
- No WebSocket authentication beyond CORS origin validation.
- sessionStorage auth is for demo purposes only; not suitable for production.
- Camera retry exhausts after 5 attempts; requires manual restart after persistent camera failure.
- BLE RSSI accuracy varies by device and environment; distance estimation is approximate.
