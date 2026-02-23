"""
SentryOS Backend - FastAPI Server
Entry point for the Zero-Trust remote workspace backend.
WebSocket route is a placeholder; AI/vision logic wired in later.
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI(
    title="SentryOS API",
    description="Backend for the SentryOS Zero-Trust Remote Workspace",
    version="0.1.0",
)

# Allow the Next.js dev server to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# REST health-check
# ---------------------------------------------------------------------------

@app.get("/health")
async def health_check():
    """Simple liveness probe so the frontend can confirm the backend is up."""
    return {"status": "ok", "service": "SentryOS"}


# ---------------------------------------------------------------------------
# WebSocket placeholder
# ---------------------------------------------------------------------------

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    Primary WebSocket channel.
    Phase 1: echoes a JSON handshake and keeps the connection alive.
    Phase 2: will stream vision/security events from VisionTracker.
    """
    await websocket.accept()
    await websocket.send_json({"event": "connected", "message": "SentryOS WebSocket ready"})
    try:
        while True:
            # Block until the client sends something; echo it back for now.
            data = await websocket.receive_text()
            await websocket.send_json({"event": "echo", "payload": data})
    except WebSocketDisconnect:
        print("Client disconnected from /ws")


# ---------------------------------------------------------------------------
# Dev entry-point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
