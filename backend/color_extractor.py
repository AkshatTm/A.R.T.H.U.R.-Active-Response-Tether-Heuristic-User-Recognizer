"""
SentryOS - ColorExtractor
Placeholder module for OpenCV-based ambient colour / chameleon theming logic.
Complex vision logic will be implemented in a later phase.
"""


class ColorExtractor:
    """
    Samples the dominant ambient colour from a webcam frame using OpenCV.

    Lifecycle
    ---------
    Phase 1 (this file): stub — returns a hardcoded neutral palette.
    Phase 2: integrate OpenCV (cv2), K-Means clustering on HSV frames, and
             expose the result as a hex colour so the frontend Chameleon theme
             can adapt in real time.
    """

    def __init__(self):
        self._capture = None
        # TODO: initialise cv2.VideoCapture

    def open(self, device_index: int = 0) -> None:
        """Open the video capture device."""
        print(f"[ColorExtractor] open(device={device_index}) — placeholder, no-op for now.")

    def release(self) -> None:
        """Release the video capture device."""
        print("[ColorExtractor] release() called — placeholder, no-op for now.")

    def get_dominant_color(self) -> dict:
        """
        Sample the current frame and return the dominant ambient colour.

        Returns
        -------
        dict
            Phase-1 stub always returns a neutral dark background colour.
        """
        return {
            "hex": "#1a1a2e",
            "rgb": (26, 26, 46),
            "brightness": "dark",
        }
