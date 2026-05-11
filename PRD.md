# Product Requirements Document

| Field | Value |
|-------|-------|
| **Product** | A.R.T.H.U.R. (Active Response Tether & Heuristic User Recognizer) |
| **Version** | 2.0.0 |
| **Author** | Akshat Tyagi |
| **Status** | Feature-Complete |
| **Last Updated** | 2026-04-17 |

---

## 1. Problem Statement

Traditional endpoint security focuses on software perimeters — firewalls, VPNs, encrypted storage, and session timeouts. These safeguards are ineffective against **physical threats** to an unattended workstation:

| Physical Threat | Software Defense | Gap |
|----------------|-----------------|-----|
| Shoulder surfing | None | Software can't detect who is looking at the screen |
| User walks away, forgets to lock | OS lock timer (minutes) | Sensitive data visible during timeout window |
| Unauthorized person approaches screen | None | No awareness of physical environment |
| Device left unattended in public | None until timeout | Complete data exposure window |

**A.R.T.H.U.R.** addresses this gap by creating a **continuous, real-time physical security envelope** around the workstation using computer vision and hardware proximity tethering — with zero cloud dependency and complete local processing.

---

## 2. Solution Overview

A.R.T.H.U.R. is an **edge-compute, zero-trust physical endpoint security system** that fuses three independent security signals into a deterministic state machine:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Security Signal Fusion                       │
│                                                                     │
│  Camera (MediaPipe)     BLE Tether (Bleak)     Color (K-Means)     │
│  ──────────────────     ─────────────────      ─────────────────   │
│  face_count: int        ble_connected: bool     dominant_color: hex│
│  ─1 = fault             true = in range         Theme adjustment   │
│   0 = absent            false = away/no device                     │
│   1 = secure                                                       │
│   2+ = intruder                                                    │
│                                                                     │
│           ┌─────────────────────────────────┐                      │
│           │    deriveSecurityState()          │                      │
│           │    Priority-ordered evaluation    │                      │
│           └───────────────┬─────────────────┘                      │
│                           │                                         │
│               ┌───────────┼───────────┐                            │
│               ▼           ▼           ▼                            │
│            LOCKED      BLURRED     SECURE                          │
│           (BLE away)  (cam issue) (all clear)                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Security Pillars

### Pillar 1: Active Obfuscation (Camera)

| Requirement | Detail |
|-------------|--------|
| **Sensor** | MediaPipe BlazeFace short-range model (CPU-optimized, ≤ 2m range) |
| **Input** | Webcam video stream at ~15-30 FPS |
| **Output** | Integer face count: `-1` (fault), `0` (absent), `1` (secure), `2+` (intruder) |
| **Action** | `face_count ≠ 1` → apply `blur(24px) + grayscale(80%)` to all sensitive content |
| **Latency** | Face detection runs every frame; < 250ms end-to-end pipeline |
| **Privacy** | No frames saved, transmitted, or logged. Only face count integers leave the pipeline |

### Pillar 2: Hardware Proximity Tether (Bluetooth)

| Requirement | Detail |
|-------------|--------|
| **Sensor** | Python Bleak library (backend-driven BLE, cross-platform) |
| **Input** | RSSI readings from a paired BLE or classic Bluetooth device |
| **Output** | `ble_connected: boolean` pushed via WebSocket + `ble_rssi`, `ble_distance_m` |
| **Action** | `ble_connected = false` → LOCKED state (overrides camera) |
| **Range** | ~2m threshold (RSSI ≈ -70 dBm, configurable via path loss model) |
| **Pairing** | Backend REST API: scan → pair → auto-reconnect on restart |
| **Persistence** | Paired device config saved to `ble_config.json` |
| **Auto-logout** | 8-second grace period on disconnect; session cleared if not restored |
| **Bypass** | `NEXT_PUBLIC_BLE_BYPASS=true` disables tether for development/demos |

### Pillar 3: Chameleon UI (Adaptive Theming)

| Requirement | Detail |
|-------------|--------|
| **Sensor** | MiniBatchKMeans clustering on center 100×100px ROI |
| **Input** | Camera frame center region, sampled at 1 Hz |
| **Output** | 7-character HEX string (`dominant_color`) |
| **Action** | CSS custom properties (`--theme-primary`, `--chameleon-bg`, `--theme-glow`) update via Motion Value Tunnelling at 60fps |
| **Guard** | Colors with S < 15% or L < 10% are rejected (Saturation Guard) |

---

## 4. Functional Requirements

### 4.1 Core Features

| ID | Feature | Description | Status |
|----|---------|-------------|--------|
| FR-01 | Face detection | Continuous face counting with MediaPipe BlazeFace at every-frame rate | ✅ |
| FR-02 | Security blur | Instant privacy filter (`blur(24px) + grayscale(80%)`) on face count ≠ 1 | ✅ |
| FR-03 | BLE proximity tether | Backend Bleak-based device monitoring with RSSI→distance conversion | ✅ |
| FR-04 | Screen lock | Full-screen overlay when BLE device out of range | ✅ |
| FR-05 | Chameleon theming | Real-time CSS variable updates from dominant color extraction | ✅ |
| FR-06 | Health monitoring | `GET /health` endpoint with engine status, BLE state, and uptime | ✅ |
| FR-07 | Single-client limit | WebSocket enforces one active client (close code 4001) | ✅ |
| FR-08 | Graceful lifecycle | Camera release, BLE shutdown, WS close on SIGINT/SIGTERM | ✅ |
| FR-09 | Debug overlay | OpenCV window showing face boxes, ROI, FPS, color swatch (gated by `SENTRY_DEBUG=1`) | ✅ |
| FR-10 | Presentation mode | Keyboard overrides (`Ctrl+Shift+L/B/S/0`) for live demos | ✅ |
| FR-11 | Auth flow | Login → BLE Setup → Dashboard with two-key sessionStorage guard | ✅ |
| FR-12 | BLE auto-logout | 8-second grace period on disconnect; session cleared if not restored | ✅ |
| FR-13 | BLE auto-reconnect | Backend auto-connects to saved device on startup from `ble_config.json` | ✅ |
| FR-14 | 3D interactive cards | TiltCard with mouse-tracked perspective, specular highlight | ✅ |
| FR-15 | Animated metrics | NumberFlip entrance animation for dashboard metric values | ✅ |
| FR-16 | Gradient mesh background | Animated 3-color gradient mesh on login/setup pages | ✅ |

### 4.2 Non-Functional Requirements

| ID | Requirement | Target | Status |
|----|------------|--------|--------|
| NFR-01 | End-to-end latency (camera → UI) | < 250ms | ✅ |
| NFR-02 | WebSocket broadcast rate | 10 Hz (100ms) | ✅ |
| NFR-03 | Memory footprint | < 300 MB (Python + Node.js) | ✅ |
| NFR-04 | No external dependencies | Zero cloud/network calls | ✅ |
| NFR-05 | Frame privacy | No persistence or transmission of image data | ✅ |
| NFR-06 | Fail-closed security | Any sensor failure → restrictive state | ✅ |
| NFR-07 | Color transition FPS | 60fps (Motion Value Tunnelling) | ✅ |
| NFR-08 | Reconnect resilience | Exponential backoff (1s → 5s cap) | ✅ |
| NFR-09 | Type safety | `tsc --noEmit` with zero errors | ✅ |
| NFR-10 | React 18 Strict Mode | Safe mount-unmount-remount cycle | ✅ |
| NFR-11 | BLE auto-logout grace period | 8 seconds | ✅ |

---

## 5. Security State Machine

### 5.1 States

| State | Trigger | Visual Effect | User Action Required |
|-------|---------|---------------|---------------------|
| **SECURE** | `ble_connected = true` AND `face_count = 1` | No filter, full dashboard visible | None |
| **BLURRED** | Camera fault or `face_count ≠ 1` (while BLE connected) | `blur(24px) + grayscale(80%)` | Look at camera (or remove extra viewers) |
| **LOCKED** | `ble_connected = false` | Full-screen lock with RSSI meter | Move paired device within ~2m range |

### 5.2 Priority Order (Fail-Closed)

```
Priority 1: BLE disconnected          → LOCKED  (highest)
Priority 2: WebSocket offline          → BLURRED
Priority 3: Camera fault (face = -1)   → BLURRED
Priority 4: No face (face = 0)         → BLURRED
Priority 5: Multiple faces (face > 1)  → BLURRED
Priority 6: Single face (face = 1)     → SECURE  (lowest)
```

### 5.3 Override Layer

Presentation mode overrides sit **above** the state machine:

```
finalSecurityState = presentationOverride ?? deriveSecurityState(sensors)
```

Overrides are visual only. Sensor data continues flowing; security events continue logging.

---

## 6. User Flows

### 6.1 First-Time Setup

```
1. Start backend: python main.py
2. Start frontend: npm run dev
3. Open http://localhost:3000
4. Login page → Enter password → Submit
5. BLE Setup page → Scan for devices → Select device → Auto-pair
6. Dashboard loads with SECURE state (if face detected and BLE in range)
```

### 6.2 Returning User

```
1. Start backend (auto-connects to saved BLE device)
2. Start frontend
3. Login → Auto-redirect to /setup → Auto-detect paired device
4. "Continue to Dashboard" button → Dashboard with SECURE state
```

### 6.3 BLE Disconnect Recovery

```
1. User walks away with paired device
2. RSSI drops below threshold → ble_connected = false → LOCKED
3. useBleAutoLogout starts 8-second grace period
4a. User returns within 8 seconds → Timer resets → LOCKED → SECURE
4b. User doesn't return → Grace period expires → Session cleared → Redirect to /
```

---

## 7. Acceptance Criteria

| Criterion | Test | Pass Condition |
|-----------|------|----------------|
| Face detection accuracy | Point camera at face, verify count = 1 | Count matches visible faces |
| Privacy blur | Cover camera → look at screen → cover again | Blur applies within 0.5s |
| BLE lock | Walk away with paired device | Lock screen appears when out of range |
| BLE auto-restore | Return with paired device | Lock screen disappears automatically |
| BLE auto-logout | Walk away for 8+ seconds | Session cleared, redirected to login |
| Chameleon | Show colored object to camera | Background glow shifts within 2s |
| Presentation override | Press Ctrl+Shift+S while BLURRED | Screen instantly clears |
| Auth guard | Navigate to /dashboard without logging in | Redirected to / |
| Setup guard | Navigate to /dashboard without BLE pairing | Redirected to /setup |
| Health endpoint | GET /health | Returns 200 with engine status and BLE state |
| Single-client | Open two browser tabs with /dashboard | Second tab shows reconnection loop |
| Debug overlay | Set SENTRY_DEBUG=1 → restart backend | OpenCV window with face boxes, ROI, FPS, color |

---

## 8. Future Considerations

| Feature | Priority | Description |
|---------|----------|-------------|
| Face recognition | P2 | Identify specific authorized users (not just count) |
| Multi-monitor | P3 | Extend blur to additional displays |
| Mobile companion | P3 | Native BLE app for persistent tethering |
| Session recording | P3 | Audit log of security events with timestamps |
| Remote management | P4 | Admin dashboard for fleet deployment |
| TLS/HTTPS | P1 | Required for any non-localhost deployment |
| Real authentication | P1 | Replace demo sessionStorage with production auth |
