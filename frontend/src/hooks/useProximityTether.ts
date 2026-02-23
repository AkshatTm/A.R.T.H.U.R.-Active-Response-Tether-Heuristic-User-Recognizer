/**
 * useProximityTether
 * ------------------
 * Boilerplate hook for Bluetooth Low Energy proximity detection.
 *
 * Phase 1: returns a mock/safe state so UI development can proceed without
 *          a physical BLE device.
 * Phase 2: will call navigator.bluetooth.requestDevice(), subscribe to RSSI
 *          advertisements, and set isLocked=true when the paired device (e.g.
 *          a phone or badge) moves out of range.
 */

"use client";

import { useState, useEffect } from "react";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ProximityState {
  /** True when the paired device is out of range and the workstation should lock. */
  isLocked: boolean;
  /** Whether the hook has finished its initial setup (BLE scan / mock timer). */
  isReady: boolean;
  /** Human-readable status for debugging / HUD display. */
  statusMessage: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

/** Set to true to simulate a lock event 10 s after mount (useful for UI testing). */
const MOCK_LOCK_AFTER_MS = 0; // 0 = never auto-lock in Phase 1

// ── Hook ───────────────────────────────────────────────────────────────────

export function useProximityTether(): ProximityState {
  const [state, setState] = useState<ProximityState>({
    isLocked: false,
    isReady: false,
    statusMessage: "Proximity tether initialising (mock mode)…",
  });

  useEffect(() => {
    // Phase 1: immediately mark as ready with a safe "unlocked" state.
    setState({
      isLocked: false,
      isReady: true,
      statusMessage: "Mock mode — device tethered (no BLE scan).",
    });

    // Optional: simulate a lock after MOCK_LOCK_AFTER_MS for UI testing
    if (MOCK_LOCK_AFTER_MS > 0) {
      const timer = setTimeout(() => {
        setState({
          isLocked: true,
          isReady: true,
          statusMessage: "Mock mode — simulated device out-of-range.",
        });
      }, MOCK_LOCK_AFTER_MS);
      return () => clearTimeout(timer);
    }
  }, []);

  return state;
}
