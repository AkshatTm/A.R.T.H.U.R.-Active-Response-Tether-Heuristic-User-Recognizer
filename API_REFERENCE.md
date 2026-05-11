# API Reference

| Field | Value |
|-------|-------|
| **Product** | A.R.T.H.U.R. |
| **Version** | 2.0.0 |
| **Base URL** | `http://localhost:8000` |
| **WebSocket** | `ws://localhost:8000/ws` |
| **Last Updated** | 2026-04-17 |

---

## 1. REST Endpoints

### GET /health

Liveness and readiness probe. Returns the current engine status, vision thread health, BLE tether state, and uptime.

**Request:**

```
GET /health HTTP/1.1
Host: localhost:8000
```

**Response (200 OK):**

```json
{
  "status": "ok",
  "service": "A.R.T.H.U.R.",
  "engine": {
    "face_count": 1,
    "dominant_color": "#4A90E2",
    "system_status": "active",
    "timestamp": 1678882345.123,
    "ble_connected": true,
    "ble_rssi": -55,
    "ble_distance_m": 0.8,
    "ble_device_name": "Nirvana Crystl"
  },
  "vision_thread_alive": true,
  "uptime_seconds": 123.45
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | `string` | Always `"ok"` if the server is responding |
| `service` | `string` | Service identifier (`"A.R.T.H.U.R."`) |
| `engine` | `object` | Latest `ThreadSafeState` snapshot (see §2.4) |
| `vision_thread_alive` | `boolean` | `true` if the daemon vision thread is running |
| `uptime_seconds` | `float` | Seconds since server start |

**Use Cases:**
- Frontend verifies backend is alive before attempting WebSocket upgrade
- Distinguish between "backend down" vs. "backend up but camera failed"
- Monitor BLE tether status alongside vision pipeline
- Health checks and monitoring

---

## 2. WebSocket Protocol

### 2.1 Connection

**Endpoint:** `ws://localhost:8000/ws`

**Direction:** Unidirectional (server → client push). The client does not need to send any messages.

**Client Limit:** Single client only (ADR-03). If a second client attempts to connect while one is active, the server accepts the connection and immediately closes it with:

| Close Code | Reason | Meaning |
|-----------|--------|---------|
| `4001` | `single_client_limit` | Another client is already connected |

### 2.2 Connection Lifecycle

```
Client                                          Server
  │                                               │
  ├── WebSocket Upgrade Request ─────────────────►│
  │                                               │
  │                          ┌────────────────────┤  Check: is another client connected?
  │                          │ No                  │
  │                          ▼                     │
  │◄── 101 Switching Protocols ───────────────────┤
  │                                               │
  │◄── Handshake Event ──────────────────────────┤  {"event": "connected", ...}
  │                                               │
  │◄── Sensor Payload ───────────────────────────┤  Every 100ms (10 Hz)
  │◄── Sensor Payload ───────────────────────────┤  (includes BLE data)
  │◄── Sensor Payload ───────────────────────────┤
  │    ...                                        │
  │                                               │
  ├── Close ──────────────────────────────────────►│  Client disconnects
  │                                               │  Slot released
```

### 2.3 Handshake Event

Sent once immediately after connection acceptance. Allows the client to verify protocol compatibility.

```json
{
  "event": "connected",
  "message": "A.R.T.H.U.R. WebSocket ready",
  "version": "1.0.0"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `event` | `string` | Event type identifier |
| `message` | `string` | Human-readable status message |
| `version` | `string` | Protocol version (semver) |

### 2.4 Sensor Payload (ADR-01)

Broadcast continuously at 10 Hz (every 100ms). This is the canonical data contract between backend and frontend. As of v2.0.0, the payload includes BLE proximity tether data alongside camera data.

```json
{
  "face_count": 1,
  "dominant_color": "#4A90E2",
  "system_status": "active",
  "timestamp": 1678882345.123,
  "ble_connected": true,
  "ble_rssi": -55,
  "ble_distance_m": 0.8,
  "ble_device_name": "Nirvana Crystl"
}
```

**Field Reference:**

| Field | Type | Values | Description |
|-------|------|--------|-------------|
| `face_count` | `int` | `-1`, `0`, `1`, `2`, ... | Number of human faces detected in the current frame. `-1` indicates a camera fault (no valid frame available) |
| `dominant_color` | `string` | 7-character HEX | Dominant color extracted from the center 100×100px ROI via MiniBatchKMeans clustering. Example: `"#4A90E2"` |
| `system_status` | `string` | `"initializing"` · `"active"` · `"camera_unavailable"` | Current state of the AI engine |
| `timestamp` | `float` | Unix epoch seconds | Server-side timestamp of when the snapshot was taken |
| `ble_connected` | `boolean` | `true` / `false` | Whether a paired BLE device is connected and within the unlock threshold |
| `ble_rssi` | `int \| null` | dBm value or `null` | Smoothed RSSI reading from the paired BLE device. `null` if no device paired or no signal |
| `ble_distance_m` | `float \| null` | metres or `null` | Estimated distance to the paired device calculated from RSSI and TX power. `null` if unavailable |
| `ble_device_name` | `string \| null` | device name or `null` | Human-readable name of the paired BLE device. `null` if no device paired |

**`system_status` Values:**

| Value | Meaning | Frontend Action |
|-------|---------|----------------|
| `"initializing"` | Backend started, vision thread has not delivered first frame | Show connecting indicator |
| `"active"` | Camera open, frames processing normally | Normal operation |
| `"camera_unavailable"` | `cv2.VideoCapture.read()` returning `False` after retry exhaustion | Treat as security fault → BLURRED |

**`face_count` Interpretation:**

| Value | Meaning | Security State (if BLE connected) |
|-------|---------|-------------------------------|
| `-1` | Camera fault — no valid frame | BLURRED |
| `0` | No face detected — user absent | BLURRED |
| `1` | Single face — authorized user | SECURE |
| `2+` | Multiple faces — potential shoulder surfer | BLURRED |

**`ble_connected` Interpretation:**

| Value | Meaning | Security State |
|-------|---------|---------------|
| `false` | No paired device, or device out of range | LOCKED (overrides face detection) |
| `true` | Paired device connected and within unlock threshold | Defer to face detection |

### 2.5 Client Messages

The WebSocket channel is designed as server → client push only. If the client sends messages, the server silently drains them (a background task reads and discards) to prevent the internal read buffer from growing unbounded. No client-sent messages are processed.

---

## 3. Bluetooth REST Endpoints

The BLE proximity tether is managed entirely by the Python backend using the Bleak library. The frontend interacts with BLE through these REST endpoints for user-initiated actions, while real-time BLE state flows through the WebSocket payload (§2.4).

### 3.1 GET /bluetooth/scan

Scan for nearby BLE devices and list OS-paired classic Bluetooth devices.

**Request:**

```
GET /bluetooth/scan HTTP/1.1
Host: localhost:8000
```

**Response (200 OK):**

```json
{
  "devices": [
    {"name": "Nirvana Crystl", "address": "90:A0:BE:8A:24:66", "rssi": 0, "type": "classic"},
    {"name": "Pixel 7", "address": "AA:BB:CC:DD:EE:FF", "rssi": -45, "type": "ble"}
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `devices` | `array` | List of discovered devices sorted by signal strength |
| `devices[].name` | `string` | Device name |
| `devices[].address` | `string` | MAC address |
| `devices[].rssi` | `int` | Signal strength in dBm (`0` for classic devices without live RSSI) |
| `devices[].type` | `string` | `"classic"` (earbuds/headphones) or `"ble"` (BLE-only) |

### 3.2 POST /bluetooth/pair

Pair with a Bluetooth device by MAC address. Saves config to `ble_config.json` and starts proximity monitoring. On subsequent backend restarts, the device will auto-connect.

**Request:**

```json
{
  "mac": "90:A0:BE:8A:24:66",
  "name": "Nirvana Crystl",
  "device_type": "classic"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `mac` | `string` | Yes | MAC address of the device to pair |
| `name` | `string` | No | Human-readable device name |
| `device_type` | `string` | No | `"classic"` (default) or `"ble"` |

**Response (200 OK):**

```json
{
  "message": "Paired with Nirvana Crystl",
  "mac": "90:A0:BE:8A:24:66"
}
```

### 3.3 GET /bluetooth/status

Get current BLE tether status including connection state, RSSI, distance, and device info.

**Request:**

```
GET /bluetooth/status HTTP/1.1
Host: localhost:8000
```

**Response (200 OK):**

```json
{
  "connected": true,
  "paired_mac": "90:A0:BE:8A:24:66",
  "device_name": "Nirvana Crystl",
  "rssi": -55,
  "distance_m": 0.8,
  "device_type": "classic"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `connected` | `boolean` | Whether the paired device is connected and within range |
| `paired_mac` | `string \| null` | MAC address of the paired device, or `null` |
| `device_name` | `string \| null` | Human-readable name, or `null` |
| `rssi` | `int \| null` | Last RSSI reading in dBm, or `null` |
| `distance_m` | `float \| null` | Estimated distance in metres, or `null` |
| `device_type` | `string \| null` | `"classic"` or `"ble"`, or `null` |

### 3.4 POST /bluetooth/unpair

Unpair the current BLE device and delete saved config. The session will immediately transition to LOCKED state.

**Request:**

```
POST /bluetooth/unpair HTTP/1.1
Host: localhost:8000
```

**Response (200 OK):**

```json
{
  "message": "Device unpaired"
}
```

---

## 4. CORS Configuration

The backend allows cross-origin requests from the Next.js development server:

| Setting | Value |
|---------|-------|
| `allow_origins` | `["http://localhost:3000"]` |
| `allow_credentials` | `true` |
| `allow_methods` | `["*"]` |
| `allow_headers` | `["*"]` |

---

## 5. Frontend Hook Contracts

These TypeScript interfaces define the data shapes consumed by the React frontend.

### 5.1 `useSecuritySocket()` Return Shape

```typescript
interface UseSecuritySocketReturn {
  /** Parsed sensor data from the last valid WebSocket message, or null */
  sensorData: SensorPayload | null;

  /** true when the WebSocket is in `open` state */
  isConnected: boolean;

  /** Granular connection lifecycle status */
  socketStatus: "idle" | "connecting" | "open" | "closed" | "error";
}

interface SensorPayload {
  /** -1 = camera fault, 0 = no face, 1+ = count */
  faceCount: number;

  /** 7-char HEX string, e.g. "#4A90E2" */
  dominantColor: string;

  /** "initializing" | "active" | "camera_unavailable" */
  systemStatus: string;

  /** Unix epoch seconds */
  timestamp: number;

  /** True when paired BLE device is connected and within range */
  bleConnected: boolean;

  /** Smoothed RSSI reading (dBm) from the paired BLE device, or null */
  bleRssi: number | null;

  /** Estimated distance to the paired device in metres, or null */
  bleDistanceM: number | null;

  /** Human-readable name of the paired BLE device, or null */
  bleDeviceName: string | null;
}
```

> **Note:** The hook performs snake_case → camelCase transformation (ADR-05) at the boundary. Backend emits `face_count`; frontend exposes `faceCount`. The same applies to all `ble_*` fields.

### 5.2 `useProximityTether()` Return Shape

```typescript
interface ProximityState {
  /** True when the paired device is absent / out of range — UI should LOCK */
  isDisconnected: boolean;

  /** Always true — backend BLE is always "supported" (no browser requirement) */
  isSupported: boolean;

  /** Human-readable name of the paired device, or null */
  deviceName: string | null;

  /** Last known RSSI value (dBm), or null */
  rssi: number | null;

  /** Estimated distance to the paired device in metres, or null */
  distance: number | null;

  /** Human-readable status for debugging / HUD display */
  statusMessage: string;

  /** Always false — backend handles everything, no GATT fallback needed */
  isGattOnly: boolean;

  /** True while a scan or pair operation is in progress */
  isPairing: boolean;

  /** List of devices found during the last scan */
  availableDevices: BLEDevice[];

  /** Trigger a BLE scan via the backend */
  scan: () => Promise<void>;

  /** Pair with a specific device by MAC address and type */
  pair: (mac: string, name?: string, deviceType?: string) => Promise<void>;

  /** Unpair the current device */
  unpair: () => Promise<void>;

  /** Legacy API — calls scan() internally */
  requestPairing: (namePrefix?: string) => Promise<void>;
}
```

> **Architecture Note:** As of v2.0.0, `useProximityTether` no longer uses the Web Bluetooth API (`navigator.bluetooth`). All BLE operations are handled by the Python backend via REST endpoints. Real-time BLE state (`isDisconnected`, `deviceName`, `rssi`, `distance`) is sourced from the WebSocket payload in `useSecurityState`, not from this hook. This hook only manages user-initiated actions (scan, pair, unpair).

### 5.3 `useSecurityState()` Return Shape

```typescript
type SecurityState = "SECURE" | "BLURRED" | "LOCKED";

interface SecurityStateResult {
  securityState: SecurityState;

  // Camera / WebSocket
  faceCount: number | null;
  dominantColor: string | null;
  socketStatus: SocketStatus;
  isConnected: boolean;

  // Bluetooth / Proximity (from WebSocket payload)
  isDisconnected: boolean;
  isSupported: boolean;
  statusMessage: string;
  deviceName: string | null;
  rssi: number | null;
  distance: number | null;
  isGattOnly: boolean;
  isPairing: boolean;
  availableDevices: { name: string; address: string; rssi: number }[];
  scan: () => Promise<void>;
  pair: (mac: string, name?: string, deviceType?: string) => Promise<void>;
  unpair: () => Promise<void>;
  requestPairing: (namePrefix?: string) => Promise<void>;
}
```

### 5.4 `useBleAutoLogout()` Return Shape

```typescript
interface BleAutoLogoutResult {
  /** True while the grace-period countdown is running */
  isGracePeriod: boolean;

  /** Current countdown value (0 when not in grace period) */
  remainingSeconds: number;
}
```

**Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `bleConnected` | `boolean` | Whether the BLE device is currently connected |
| `logout` | `() => void` | Callback invoked when the grace period expires |

**Behavior:**
- Activates only after `bleConnected` has been `true` at least once (prevents premature logout during initial WebSocket connection delay)
- 8-second grace period on disconnect
- Timer resets if device reconnects during the window

### 5.5 `useAuthGuard()` / `useSetupGuard()`

```typescript
// Session keys
const AUTH_SESSION_KEY = "sentry_auth";     // Set on login
const BLE_SESSION_KEY = "sentry_ble_paired"; // Set after BLE setup

// Guards
useSetupGuard();  // Requires auth only (for /setup page)
useAuthGuard();   // Requires both auth + BLE pairing (for /dashboard)

// Logout clears both keys and redirects to /
logout(router: ReturnType<typeof useRouter>): void;
```

---

## 6. Error Responses

### 6.1 WebSocket Close Codes

| Code | Reason | Cause |
|------|--------|-------|
| `1000` | Normal closure | Client or server initiated clean disconnect |
| `1001` | `server_shutdown` | Backend shutting down gracefully |
| `4001` | `single_client_limit` | Second client attempted to connect (ADR-03) |

### 6.2 Frontend Error Handling

| Scenario | Frontend Behavior |
|----------|-------------------|
| WebSocket connection refused | `socketStatus: "error"`, exponential backoff reconnect (1s → 2s → 4s → 5s cap) |
| WebSocket close (any code) | `socketStatus: "closed"`, auto-reconnect with backoff |
| Close code `4001` | Specific warning logged: "Another tab/window may already be connected" |
| Invalid JSON payload | Silently dropped; `sensorData` retains last valid value |
| Payload fails ADR-01 validation | Silently dropped; type guard rejects malformed data |
| BLE scan/pair/unpair failure | Error logged; `statusMessage` updated with failure info |

---

## 7. Rate Limits & Performance

| Metric | Value |
|--------|-------|
| WebSocket broadcast rate | 10 Hz (100ms) |
| Face detection rate | Every frame (~15-30 FPS) |
| Color extraction rate | 1 Hz (1 sample/second) |
| Max concurrent WebSocket clients | 1 (ADR-03) |
| Reconnect backoff | 1s → 2s → 4s → 5s (cap) |
| Connect debounce (Strict Mode) | 100ms |
| BLE RSSI update rate | ~1-2 Hz (backend-driven) |
| BLE auto-logout grace period | 8 seconds |
