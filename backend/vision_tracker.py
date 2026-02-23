"""
SentryOS - VisionTracker
Placeholder module for MediaPipe-based gaze / attention tracking.
Complex AI logic will be implemented in a later phase.
"""


class VisionTracker:
    """
    Tracks user attention and on-screen gaze using MediaPipe FaceMesh.

    Lifecycle
    ---------
    Phase 1 (this file): stub — all methods are no-ops that return safe defaults.
    Phase 2: integrate MediaPipe, emit event dicts over an asyncio Queue so
             main.py can forward them through the /ws WebSocket.
    """

    def __init__(self):
        self._running = False
        # TODO: initialise MediaPipe FaceMesh pipeline

    def start(self) -> None:
        """Start the video-capture + inference loop (background thread)."""
        self._running = True
        print("[VisionTracker] start() called — placeholder, no-op for now.")

    def stop(self) -> None:
        """Stop the inference loop and release camera resources."""
        self._running = False
        print("[VisionTracker] stop() called — placeholder, no-op for now.")

    def get_status(self) -> dict:
        """
        Return the latest attention snapshot.

        Returns
        -------
        dict
            Phase-1 stub always returns a safe/neutral status.
        """
        return {
            "is_looking_away": False,
            "face_detected": False,
            "gaze_vector": None,
        }
