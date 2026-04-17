"""
A.R.T.H.U.R. Backend — FastAPI Application & WebSocket Broadcaster
===============================================================

This is the entry point for the A.R.T.H.U.R. AI Sensory Engine.  It
orchestrates three responsibilities:

1. **Lifecycle management** — starts the Vision Thread on application
   startup and ensures graceful shutdown (camera release, thread join)
   on ``SIGINT`` / ``SIGTERM`` / uvicorn shutdown.
2. **WebSocket broadcaster** — pushes the latest ``ThreadSafeState``
   snapshot to a single connected client at exactly **10 Hz** (100 ms
   intervals).  Enforces **ADR-03: single-client limit** by rejecting
   additional connections with close code ``4001``.
3. **REST health probe** — ``GET /health`` returns engine status so the
   frontend can confirm the backend is alive before attempting the
   WebSocket upgrade.

Architecture
------------
┌──────────────┐                        ┌───────────────────┐
│ Vision Thread │──update()────────────►│  ThreadSafeState   │
│ (daemon)      │                        │  (mutex-guarded)   │
└──────────────┘                        └────────┬──────────┘
                                                 │ get_snapshot()
                                                 ▼
                                        ┌───────────────────┐
                                        │  FastAPI /ws       │
                                        │  10 Hz broadcaster │
                                        └───────────────────┘

ADR Register
------------
* **ADR-01** — Flat JSON schema (``face_count``, ``dominant_color``,
  ``system_status``, ``timestamp``).
* **ADR-03** — Single WebSocket client.  Second connection gets
  ``close(4001, "single_client_limit")``.
* **ADR-04** — Debug window gated by ``SENTRY_DEBUG=1`` env var
  (handled in ``vision_thread.py``).
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
import time
from contextlib import asynccontextmanager

# Suppress TFLite / glog noise before any MediaPipe / TensorFlow import.
# W0000 inference_feedback_manager.cc:121 is a known benign BlazeFace
# limitation — it does not affect detection accuracy.
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
os.environ.setdefault("GLOG_minloglevel", "3")

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

from models import ThreadSafeState
from vision_thread import VisionLoop
from ble_tether import BLETetherService

# ── Logging Configuration ───────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    datefmt="%H:%M:%S",
    stream=sys.stdout,
)
logger = logging.getLogger("arthur.main")

# ── Shared Infrastructure ──────────────────────────────────────────────────

shared_state = ThreadSafeState()
vision_loop = VisionLoop(shared_state)
ble_service = BLETetherService(state_updater=shared_state.update_ble)

# ── Constants ───────────────────────────────────────────────────────────────

BROADCAST_INTERVAL: float = 0.1
"""Seconds between WebSocket broadcasts — 10 Hz (100 ms).  Matches the
Design.md Section 6.1 rate specification."""

WS_CLOSE_SINGLE_CLIENT: int = 4001
"""Custom WebSocket close code sent when a second client attempts to
connect while one is already active (ADR-03)."""

# ── Active Client Tracking (ADR-03) ────────────────────────────────────────

_active_ws: dict[str, WebSocket] = {}
"""At most one entry.  Keyed by a unique client identifier.  Used to
enforce the single-client limit."""


# ── Lifespan (Startup / Shutdown) ──────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle: start vision thread on boot, stop on
    shutdown.

    Using the modern ``lifespan`` context manager instead of the
    deprecated ``@app.on_event("startup")`` / ``"shutdown"`` hooks
    (FastAPI ≥ 0.93).
    """
    # ── Startup ─────────────────────────────────────────────────────
    logger.info("=" * 60)
    logger.info("  A.R.T.H.U.R. AI Sensory Engine — Starting Up")
    logger.info("=" * 60)

    vision_loop.start()
    logger.info("Vision thread launched")

    # Start BLE proximity tether (auto-connects if a device was previously paired)
    await ble_service.auto_connect()
    logger.info("BLE tether service initialised")

    # NOTE: We intentionally do NOT override the OS signal handlers here.
    # uvicorn installs its own SIGINT / SIGTERM handlers that trigger the
    # lifespan shutdown (the code below the yield).  Overriding them with
    # a synchronous stop() call would block the event loop and prevent
    # WebSocket connections from being closed gracefully.

    yield  # ← application runs here

    # ── Shutdown ────────────────────────────────────────────────────
    logger.info("Shutdown signal received — tearing down …")
    vision_loop.stop(timeout=5.0)

    # Gracefully shut down BLE tether
    await ble_service.shutdown()
    logger.info("BLE tether service stopped")

    # Close any lingering WebSocket connection.
    for client_id, ws in list(_active_ws.items()):
        try:
            await ws.close(code=1001, reason="server_shutdown")
        except Exception:
            pass
    _active_ws.clear()

    logger.info("A.R.T.H.U.R. AI Sensory Engine — Shutdown complete")


# ── FastAPI Application ────────────────────────────────────────────────────

app = FastAPI(
    title="A.R.T.H.U.R. API",
    description=(
        "Backend for the A.R.T.H.U.R. Zero-Trust Remote Workspace. "
        "Streams real-time face-count and dominant-colour data over WebSocket."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# Allow the Next.js dev server (localhost:3000) to connect.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── REST Endpoints ─────────────────────────────────────────────────────────

@app.get("/", include_in_schema=False)
async def root_redirect():
    """Redirect browser / curl hits on / to the interactive API docs."""
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url="/docs")


@app.get("/health")
async def health_check():
    """Liveness + readiness probe.

    Returns the current engine status so the frontend can distinguish
    between "backend is up but camera failed" vs "backend is down".

    Response Schema
    ---------------
    ```json
    {
        "status": "ok",
        "service": "A.R.T.H.U.R.",
        "engine": { ... current ThreadSafeState snapshot ... },
        "vision_thread_alive": true,
        "uptime_seconds": 123.45
    }
    ```
    """
    return {
        "status": "ok",
        "service": "A.R.T.H.U.R.",
        "engine": shared_state.get_snapshot(),
        "vision_thread_alive": vision_loop.is_running,
        "uptime_seconds": round(time.time() - _start_time, 2),
    }


# ── Bluetooth REST Endpoints ──────────────────────────────────────────────


class PairRequest(BaseModel):
    """Request body for POST /bluetooth/pair."""
    mac: str
    name: str | None = None
    device_type: str = "classic"  # "classic" or "ble"


@app.get("/bluetooth/scan")
async def bluetooth_scan():
    """Scan for nearby BLE devices and list OS-paired classic Bluetooth devices.

    Returns a merged list of discovered devices sorted by signal strength.
    Classic BT devices (earbuds/headphones) appear at the top.

    Response Schema
    ---------------
    ```json
    {
        "devices": [
            {"name": "Nirvana Crystl", "address": "90:A0:BE:8A:24:66", "rssi": 0, "type": "classic"},
            {"name": "Pixel 7", "address": "AA:BB:CC:DD:EE:FF", "rssi": -45, "type": "ble"},
            ...
        ]
    }
    ```
    """
    devices = await ble_service.scan()
    return {"devices": devices}


@app.post("/bluetooth/pair")
async def bluetooth_pair(req: PairRequest):
    """Pair with a Bluetooth device by MAC address.

    Saves the device config to disk and starts proximity monitoring.
    On subsequent backend restarts, this device will auto-connect.

    Use ``device_type: "classic"`` for earbuds/headphones (recommended),
    or ``device_type: "ble"`` for BLE-only devices.

    Request Body
    ------------
    ```json
    {"mac": "90:A0:BE:8A:24:66", "name": "Nirvana Crystl", "device_type": "classic"}
    ```
    """
    result = await ble_service.pair(
        mac=req.mac, name=req.name, device_type=req.device_type,
    )
    return result


@app.get("/bluetooth/status")
async def bluetooth_status():
    """Get current BLE tether status.

    Response includes connection state, RSSI, estimated distance,
    device name, and whether the monitor is running.
    """
    return ble_service.get_status()


@app.post("/bluetooth/unpair")
async def bluetooth_unpair():
    """Unpair the current BLE device and delete saved config.

    The session will immediately transition to LOCKED state.
    """
    result = await ble_service.unpair()
    return result


# ── WebSocket Endpoint ────────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """Primary WebSocket channel — push-only, 10 Hz sensor broadcast.

    Connection Protocol
    -------------------
    1. Client requests upgrade → server checks single-client limit.
    2. If a client is already connected → reject with ``4001``.
    3. Otherwise → accept, send a handshake event, enter broadcast loop.
    4. On disconnect (client or server) → clean up tracking state.

    Broadcast Payload (ADR-01)
    --------------------------
    Every 100 ms the server sends:
    ```json
    {
        "face_count": 1,
        "dominant_color": "#4A90E2",
        "system_status": "active",
        "timestamp": 1678882345.123
    }
    ```

    The client does **not** need to send any messages.  The channel is
    unidirectional (server → client).  If the client sends data it is
    silently consumed so the read buffer doesn't fill up.
    """
    client_id = f"{websocket.client.host}:{websocket.client.port}"

    # ── ADR-03: Single-client enforcement ───────────────────────────
    if _active_ws:
        logger.warning(
            "Rejecting second client %s — single-client limit (ADR-03)",
            client_id,
        )
        await websocket.accept()
        await websocket.close(
            code=WS_CLOSE_SINGLE_CLIENT,
            reason="single_client_limit",
        )
        return

    # ── Accept & register ───────────────────────────────────────────
    await websocket.accept()
    _active_ws[client_id] = websocket
    logger.info("WebSocket client connected: %s", client_id)

    # Send a one-time handshake event so the frontend can confirm
    # protocol compatibility.
    await websocket.send_json({
        "event": "connected",
        "message": "A.R.T.H.U.R. WebSocket ready",
        "version": "1.0.0",
    })

    try:
        # Launch a background task to drain any client-sent messages
        # (prevents the WebSocket read buffer from filling up and
        # blocking the connection).
        drain_task = asyncio.create_task(_drain_client_messages(websocket))

        # ── 10 Hz broadcast loop ────────────────────────────────────
        while True:
            snapshot = shared_state.get_snapshot()
            await websocket.send_json(snapshot)
            await asyncio.sleep(BROADCAST_INTERVAL)

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected: %s", client_id)
    except Exception:
        logger.exception("WebSocket error for client %s", client_id)
    finally:
        # ── Cleanup ─────────────────────────────────────────────────
        _active_ws.pop(client_id, None)
        drain_task.cancel()
        logger.info(
            "WebSocket slot released — ready for new client",
        )


# ── Internal Helpers ────────────────────────────────────────────────────────

async def _drain_client_messages(websocket: WebSocket) -> None:
    """Continuously read and discard any messages the client sends.

    This prevents the WebSocket internal buffer from growing unbounded
    if a client accidentally sends data on what is designed to be a
    server→client push channel.
    """
    try:
        while True:
            await websocket.receive_text()
    except (WebSocketDisconnect, Exception):
        pass  # Connection closed — nothing to drain.


# ── Module-level timestamp for uptime calculation ──────────────────────────

_start_time: float = time.time()


# ── Dev Entry Point ────────────────────────────────────────────────────────

if __name__ == "__main__":
    # Pass the app *object* (not the "main:app" string) so that uvicorn
    # does NOT re-import this module.  Using the string form causes the
    # module-level code to execute twice, creating orphaned VisionLoop
    # and BLETetherService instances.
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        reload=False,       # Reload is unsafe with background threads
        log_level="info",
    )

