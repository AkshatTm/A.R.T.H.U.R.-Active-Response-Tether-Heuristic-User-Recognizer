# Project Status & Changelog

| Field | Value |
|-------|-------|
| **Product** | A.R.T.H.U.R. |
| **Status** | Feature-Complete |
| **Last Updated** | 2026-04-17 |
| **Version** | 2.0.0 |

---

## Current Status

**All development phases are complete.** The application compiles cleanly (`tsc --noEmit` passes) and is ready for deployment and demonstration.

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Python AI Sensory Engine | Completed |
| Phase 2 | React Sensor Hooks (WebSocket + Bluetooth) | Completed |
| Phase 3 | Kinetic UI & Chameleon Engine | Completed |
| Phase 4 | Master Integration & Polish | Completed |
| Phase 5 | BLE Backend Migration & UI Enhancement | Completed |

---

## Implemented Components

### Backend

| Component | File | Description |
|-----------|------|-------------|
| FastAPI Application | `backend/main.py` | Lifespan management, WebSocket broadcaster (10 Hz), BLE REST endpoints, REST health probe, ADR-03 single-client enforcement |
| Data Models | `backend/models.py` | `SensorPayload` dataclass (camera + BLE fields), `ThreadSafeState` mutex-guarded container with `update_ble()` method |
| Vision Thread | `backend/vision_thread.py` | Daemon thread: camera capture loop, frame orchestration, optional debug overlay (`SENTRY_DEBUG=1`) |
| Face Detection | `backend/vision_tracker.py` | MediaPipe BlazeFace short-range wrapper (≤ 2m, CPU-optimized) |
| Color Extraction | `backend/color_extractor.py` | Pure function: frame → center ROI (100×100px) → MiniBatchKMeans → HEX |
| BLE Tether Service | `backend/ble_tether.py` | Bleak-based BLE proximity tether: scan, pair, RSSI monitoring, distance calculation, auto-connect |
| BLE Config Persistence | `backend/ble_config.py` | JSON file persistence for paired device config (`ble_config.json`) |
| PowerShell Launcher | `backend/start_backend.ps1` | Windows PowerShell launcher that avoids NativeCommandError from uvicorn stderr |
| Dependencies | `backend/requirements.txt` | FastAPI, uvicorn, MediaPipe, OpenCV, scikit-learn, NumPy, Bleak |

### Frontend — Hooks

| Hook | File | Description |
|------|------|-------------|
| `useSecuritySocket` | `frontend/src/hooks/useSecuritySocket.ts` | WebSocket client consuming camera + BLE data in unified ADR-01 payload, React 18 Strict Mode safety (100ms debounce), exponential backoff reconnection (1s → 5s cap) |
| `useProximityTether` | `frontend/src/hooks/useProximityTether.ts` | BLE REST actions: calls `/bluetooth/scan`, `/bluetooth/pair`, `/bluetooth/unpair` via `fetch`. BLE connection state flows through WebSocket, not this hook |
| `useSecurityState` | `frontend/src/hooks/useSecurityState.ts` | State machine consolidator: derives `SecurityState` from WebSocket-driven BLE + camera data. `deriveSecurityState()` pure function, `useMemo` optimized |
| `useBleAutoLogout` | `frontend/src/hooks/useBleAutoLogout.ts` | BLE disconnect auto-logout watchdog: 8-second grace period, only activates after first successful BLE connection |
| `useAuthGuard` | `frontend/src/hooks/useAuthGuard.ts` | Two-key sessionStorage route guard: `useSetupGuard()` (auth only) for `/setup`, `useAuthGuard()` (auth + BLE) for `/dashboard`. `logout()` clears both keys |

### Frontend — Components

| Component | File | Description |
|-----------|------|-------------|
| `ChameleonWrapper` | `frontend/src/components/ChameleonWrapper.tsx` | Motion Value Tunnelling for CSS variable injection at 60fps with zero re-renders. Saturation Guard rejects S < 15% and L < 10% |
| `GlassOverlay` | `frontend/src/components/GlassOverlay.tsx` | Framer Motion `filter` variants: SECURE (clear) → BLURRED (blur 24px + grayscale 80%) → LOCKED (blur 40px + grayscale 100% + brightness 40%). 400ms transitions |
| `LockScreen` | `frontend/src/components/LockScreen.tsx` | AnimatePresence full-screen overlay: pulsing lock icon, 5-bar RSSI meter, device info, re-pair button. Auto-heals on BLE restore |
| `GradientMesh` | `frontend/src/components/GradientMesh.tsx` | Animated 3-color gradient mesh background: 3 Framer Motion blobs on 18-26s drift cycles with vignette. Replaces static dot grid on login/setup |
| `TiltCard` | `frontend/src/components/TiltCard.tsx` | 3D mouse-tracked perspective tilt card: ±4° tilt via `useSpring`, specular highlight follows mouse, spring-physics return-to-neutral |
| `NumberFlip` | `frontend/src/components/NumberFlip.tsx` | Animated number entrance: slide-up from below with blur fade, key-change triggers remount animation. Used for metric card values |
| `PresentationModeProvider` | `frontend/src/context/PresentationModeContext.tsx` | Keyboard override engine: `Ctrl+Shift+L/B/S/0`. Subtle bottom-right toast. React 18 Strict Mode safe |

### Frontend — Pages

| Route | File | Description |
|-------|------|-------------|
| `/` | `frontend/src/app/page.tsx` | GradientMesh background + glassmorphism login card: pre-filled email, simulated 800ms auth, sessionStorage persistence, Satoshi display font |
| `/setup` | `frontend/src/app/setup/page.tsx` | Backend-driven BLE setup wizard: segmented progress bar, device scanning via REST, connected device card with RSSI bars, auto-redirect to dashboard on pair |
| `/dashboard` | `frontend/src/app/dashboard/page.tsx` | Master dashboard: "S" lettermark TopBar, TiltCard metric cards with NumberFlip values, Catppuccin-inspired code panel, terminal with tab decoration, security events table, server health bars. Auth guard + presentation override |

---

## Architecture Decision Register

| ID | Decision | Rationale | Status |
|----|----------|-----------|--------|
| ADR-01 | Flat WebSocket JSON schema | Minimal parsing; direct field access; extended with `ble_*` fields in v2.0.0 | Enforced |
| ADR-02 | Bluetooth fail-closed (LOCKED) | Zero-trust: absence of presence proof = maximum restriction | Enforced |
| ADR-03 | Single WebSocket client limit | Prevents state conflicts; close code `4001` | Enforced |
| ADR-04 | Debug overlay gated by `SENTRY_DEBUG=1` | Zero production overhead | Enforced |
| ADR-05 | snake_case → camelCase at hook boundary | Python/TS convention bridge; single transform point; applies to `ble_*` fields | Enforced |
| ADR-06 | 100ms debounce on WS connect | React 18 Strict Mode mount-unmount-remount survival | Enforced |
| ADR-07 | Motion Value Tunnelling for CSS | Zero re-renders during color transitions | Enforced |
| ADR-08 | Saturation Guard (S ≥ 15%, L ≥ 10%) | Prevents grey/black themes from degrading readability | Enforced |
| ADR-09 | LockScreen auto-heal on BLE restore | Informational lock; automatic session resumption | Enforced |
| ADR-10 | sessionStorage for demo auth | Self-destructs on tab close; two-key system (auth + BLE pairing) | Enforced |
| ADR-11 | Presentation override above hook layer | Clean separation; sensors unaffected by override | Enforced |
| ADR-12 | Backend-driven BLE via Bleak | No browser limitations; classic BT support; persistent config; auto-reconnect | Enforced |
| ADR-13 | BLE auto-logout with 8s grace period | Prevents accidental logout from BLE signal drops; activates after first connection | Enforced |

---

## Known Limitations

| Area | Limitation | Impact |
|------|-----------|--------|
| WebSocket Security | No authentication beyond CORS origin validation | Acceptable for localhost; requires auth layer for network deployment |
| Camera Retry | Exhausts after 5 attempts (1s → 10s backoff) | Requires backend restart after persistent camera failure |
| Color Clustering | `MiniBatchKMeans` with `random_state=42` | Deterministic but may favor non-perceptual "dominant" in mixed scenes |
| Hot Reload | `reload=False` in uvicorn | Hot-reload unsafe with background threads; manual restart required |
| BLE RSSI | Accuracy varies by device and environment | Distance estimation is approximate; path loss model may need tuning |
| BLE Classic Devices | RSSI not available for some classic Bluetooth devices | System estimates based on presence/absence rather than distance |
| HTTPS | Web Bluetooth requires HTTPS in production | Mitigated by backend-driven BLE (Bleak doesn't need HTTPS) |
| BLE Pairing | Requires user to navigate to `/setup` page | Cannot auto-pair without user interaction |
| Auth | sessionStorage two-key demo auth | Not suitable for production; no password validation |
| Fonts | Satoshi loaded from Fontshare CDN | Requires internet connection for first load |

---

## Pre-Demo Checklist

### 1. Start Backend

```powershell
cd backend
.venv\Scripts\Activate.ps1
python main.py
```

Expected: `Uvicorn running on http://0.0.0.0:8000` + `Camera 0 opened successfully` + `BLE tether service initialised`

Optional debug overlay: `$env:SENTRY_DEBUG="1"; python main.py`

### 2. Start Frontend

```powershell
cd frontend
npm run dev
```

With BLE bypass: `$env:NEXT_PUBLIC_BLE_BYPASS="true"; npm run dev`

### 3. Verify Stack

| Check | Expected |
|-------|----------|
| `http://localhost:3000` | GradientMesh animated login with glassmorphism card |
| Login with any password | 800ms pulse → redirect to `/setup` |
| `/setup` → Scan for devices | Device list appears |
| Select and pair device | Redirect to `/dashboard` |
| TopBar WS dot | Green (connected) |
| TopBar eye dot | Green when 1 face detected |
| TopBar BLE dot | Green when device in range |
| Background glow | Color shifts with scene changes |

### 4. Presentation Shortcuts

| Shortcut | Effect |
|----------|--------|
| `Ctrl + Shift + L` | Force LOCKED |
| `Ctrl + Shift + B` | Force BLURRED |
| `Ctrl + Shift + S` | Force SECURE |
| `Ctrl + Shift + 0` | Release override (sensors resume) |

### 5. Emergency Fallbacks

| Problem | Fix |
|---------|-----|
| Camera not detected | UI enters BLURRED. Restart backend on machine with webcam |
| BLE hardware absent | Set `NEXT_PUBLIC_BLE_BYPASS=true`, restart frontend. Use `Ctrl+Shift+S` for SECURE |
| WebSocket disconnect | Restart backend. Frontend auto-reconnects (max 5s backoff) |
| Login loops | DevTools → `sessionStorage.setItem('sentry_auth','1')` → navigate to `/setup` |
| Setup loops | DevTools → `sessionStorage.setItem('sentry_ble_paired','1')` → navigate to `/dashboard` |
| Multiple faces detected | Step out of frame briefly, or use `Ctrl+Shift+S` override |
| BLE auto-logout fires | Device was out of range for 8s. Move closer and re-login |

---

## Changelog

### v2.0.0 (2026-04-17) — BLE Backend Migration & UI Enhancement

**Phase 5: BLE Backend Migration**
- Migrated BLE tether from browser Web Bluetooth to Python Bleak library (ADR-12)
- Added `BLETetherService` (`ble_tether.py`) with scan, pair, RSSI monitoring, distance calculation
- Added `ble_config.py` for persistent device config (`ble_config.json`)
- Added `bleak>=0.21.0` to `requirements.txt`
- Added REST endpoints: `GET /bluetooth/scan`, `POST /bluetooth/pair`, `GET /bluetooth/status`, `POST /bluetooth/unpair`
- Extended WebSocket payload with `ble_connected`, `ble_rssi`, `ble_distance_m`, `ble_device_name` fields
- Added `start_backend.ps1` PowerShell launcher to avoid NativeCommandError

**Phase 5: Frontend BLE Adaptation**
- Refactored `useProximityTether` to use backend REST API instead of Web Bluetooth
- BLE connection state now flows through WebSocket, consumed in `useSecurityState`
- Added `useBleAutoLogout` hook: 8-second grace period on BLE disconnect (ADR-13)
- Refactored `useAuthGuard` to two-key system: `useSetupGuard()` + `useAuthGuard()`
- Redesigned `/setup` page: backend-driven scan, device list with signal bars, segmented progress

**Phase 5: UI Enhancement (Master Plan)**
- Added `GradientMesh` component: animated 3-color gradient mesh background for login/setup
- Added `TiltCard` component: 3D mouse-tracked perspective tilt with specular highlight
- Added `NumberFlip` component: animated number entrance with blur fade
- Redesigned TopBar: h-12, "S" lettermark, Satoshi wordmark, status cluster (3 dots with tooltips)
- Redesigned MetricCards: TiltCard 3D hover, no HUD corners, hero-only accent line, IBM Plex Mono values
- Redesigned Terminal: tab decoration, warmer bg `#0c0e14`, alternating rows, removed "LIVE" text
- Redesigned Code Panel: static red dot for RESTRICTED, Catppuccin Mocha-inspired token colors
- Redesigned Security Events: striped rows, static severity dots, filter row with unresolved count
- Implemented design token system in `globals.css`: warm dark palette, three-font stack, CSS custom properties
- Typography: Satoshi (display), Space Grotesk (body), IBM Plex Mono (mono)
- Removed: ScanLineOverlay, HudCorners component, shimmer classes

### v1.0.0 (2026-03-02) — Initial Release

**Phase 4: Master Integration & Polish**
- Added `PresentationModeProvider` with keyboard shortcuts and presenter toast
- Added login page with glassmorphism design and sessionStorage auth
- Added `useAuthGuard` route protection hook
- Integrated presentation override into dashboard (`finalSecurityState = overrideState ?? securityState`)
- Added override indicator strip (yellow, z-40)

**Phase 3: Kinetic UI & Chameleon Engine**
- Added `ChameleonWrapper` with Motion Value Tunnelling and Saturation Guard
- Added `GlassOverlay` with three-state Framer Motion filter variants
- Added `LockScreen` with AnimatePresence, RSSI meter, auto-heal
- Added `useSecurityState` consolidation hook with pure `deriveSecurityState()`
- Refactored dashboard to enterprise mock terminal layout

**Phase 2: React Sensor Hooks**
- Added `useSecuritySocket` with ADR-01 validation, Strict Mode safety, exponential backoff
- Added `useProximityTether` with Web Bluetooth `watchAdvertisements()` primary, GATT fallback, RSSI threshold
- Added Web Bluetooth TypeScript augmentations

**Phase 1: Python AI Sensory Engine**
- Implemented FastAPI WebSocket broadcaster at 10 Hz
- Implemented MediaPipe BlazeFace face detection on daemon thread
- Implemented MiniBatchKMeans dominant color extraction at 1 Hz
- Implemented ThreadSafeState with mutex-guarded snapshots
- Implemented REST health probe (`GET /health`)
- Implemented single-client WebSocket limit (ADR-03, close code 4001)
- Implemented debug overlay gated by `SENTRY_DEBUG=1`
