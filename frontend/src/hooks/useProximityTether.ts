/**
 * useProximityTether
 * ------------------
 * Manages BLE proximity tethering via the Python backend REST API.
 *
 * The backend handles all Bluetooth operations (scan, pair, RSSI monitoring,
 * distance calculation) using the Bleak library.  This hook simply:
 *   1. Calls REST endpoints for scan/pair/unpair actions.
 *   2. Reads BLE state from the WebSocket payload (pushed by the backend
 *      at 10 Hz alongside camera data).
 *
 * Security model (ADR-02 — Fail-Closed):
 *  - `isDisconnected` defaults to `true` (LOCKED) until the backend
 *    reports `ble_connected: true` via the WebSocket.
 *  - Set `NEXT_PUBLIC_BLE_BYPASS=true` to disable the tether for dev/demos.
 *
 * User experience:
 *  - First-time: user scans and selects their phone from a list.
 *  - The backend persists the device MAC to `ble_config.json`.
 *  - On subsequent launches, the backend auto-connects — no user action needed.
 *  - No browser permission prompts, no requestDevice() dialogs.
 *
 * @module hooks/useProximityTether
 */

"use client";

import { useState, useCallback } from "react";

// ── Types ──────────────────────────────────────────────────────────────────

export interface BLEDevice {
  name: string;
  address: string;
  rssi: number;
  type: "classic" | "ble";
}

export interface ProximityState {
  /** True when the paired device is absent / out of range — UI should LOCK. */
  isDisconnected: boolean;
  /** Always true — backend BLE is always "supported" (no browser requirement). */
  isSupported: boolean;
  /** Human-readable name of the paired device, or null if none paired. */
  deviceName: string | null;
  /** Last known RSSI value (dBm), or null if unavailable. */
  rssi: number | null;
  /** Estimated distance to the paired device in metres, or null. */
  distance: number | null;
  /** Human-readable status for debugging / HUD display. */
  statusMessage: string;
  /** Always false — backend handles everything, no GATT fallback needed. */
  isGattOnly: boolean;
  /** True while a scan or pair operation is in progress. */
  isPairing: boolean;
  /** List of devices found during the last scan. */
  availableDevices: BLEDevice[];
  /** Trigger a BLE scan via the backend. */
  scan: () => Promise<void>;
  /** Pair with a specific device by MAC address and type. */
  pair: (mac: string, name?: string, deviceType?: string) => Promise<void>;
  /** Unpair the current device. */
  unpair: () => Promise<void>;
  /**
   * Legacy API compatibility — calls scan() internally.
   * Kept so existing UI code (LockScreen, SecurityTopBar) doesn't break.
   */
  requestPairing: (namePrefix?: string) => Promise<void>;
}

// ── Constants ──────────────────────────────────────────────────────────────

const API_BASE = "http://localhost:8000";

// ── Hook ───────────────────────────────────────────────────────────────────

export function useProximityTether(): ProximityState {
  /** Dev/demo bypass — disables the tether entirely. */
  const isBypassed = process.env.NEXT_PUBLIC_BLE_BYPASS === "true";

  // ── State ────────────────────────────────────────────────────────────
  const [isPairing, setIsPairing] = useState(false);
  const [availableDevices, setAvailableDevices] = useState<BLEDevice[]>([]);
  const [statusMessage, setStatusMessage] = useState("Waiting for backend BLE data…");

  // ── BLE state is now driven by the WebSocket payload via useSecuritySocket.
  // These values are passed through useSecurityState. The hook no longer
  // manages connection state itself — it only handles scan/pair/unpair actions.

  // ── Actions ──────────────────────────────────────────────────────────

  const scan = useCallback(async () => {
    setIsPairing(true);
    setStatusMessage("Scanning for devices…");
    try {
      const res = await fetch(`${API_BASE}/bluetooth/scan`);
      if (!res.ok) throw new Error(`Scan failed: ${res.status}`);
      const data = await res.json();
      setAvailableDevices(data.devices ?? []);
      setStatusMessage(`Found ${data.devices?.length ?? 0} devices`);
    } catch (err) {
      console.error("[useProximityTether] Scan error:", err);
      setStatusMessage("Scan failed — is the backend running?");
      setAvailableDevices([]);
    } finally {
      setIsPairing(false);
    }
  }, []);

  const pair = useCallback(async (mac: string, name?: string, deviceType?: string) => {
    setIsPairing(true);
    setStatusMessage(`Pairing with ${name ?? mac}…`);
    try {
      const res = await fetch(`${API_BASE}/bluetooth/pair`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mac, name, device_type: deviceType ?? "classic" }),
      });
      if (!res.ok) throw new Error(`Pair failed: ${res.status}`);
      const data = await res.json();
      setStatusMessage(data.message ?? "Paired successfully");
      setAvailableDevices([]); // Clear scan results after pairing
    } catch (err) {
      console.error("[useProximityTether] Pair error:", err);
      setStatusMessage("Pairing failed — check backend logs");
    } finally {
      setIsPairing(false);
    }
  }, []);

  const unpair = useCallback(async () => {
    setIsPairing(true);
    setStatusMessage("Unpairing…");
    try {
      const res = await fetch(`${API_BASE}/bluetooth/unpair`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`Unpair failed: ${res.status}`);
      setStatusMessage("Device unpaired");
      setAvailableDevices([]);
    } catch (err) {
      console.error("[useProximityTether] Unpair error:", err);
      setStatusMessage("Unpair failed");
    } finally {
      setIsPairing(false);
    }
  }, []);

  /** Legacy compatibility — triggers a scan (replaces browser requestDevice). */
  const requestPairing = useCallback(async (_namePrefix?: string) => {
    await scan();
  }, [scan]);

  // ── Bypass mode ──────────────────────────────────────────────────────

  if (isBypassed) {
    return {
      isDisconnected: false,
      isSupported: true,
      deviceName: "BLE Bypassed",
      rssi: null,
      distance: null,
      statusMessage: "BLE bypass active (NEXT_PUBLIC_BLE_BYPASS=true)",
      isGattOnly: false,
      isPairing: false,
      availableDevices: [],
      scan: async () => {},
      pair: async () => {},
      unpair: async () => {},
      requestPairing: async () => {},
    };
  }

  // ── Return ───────────────────────────────────────────────────────────
  // NOTE: isDisconnected, deviceName, rssi, distance are now sourced from
  // the WebSocket payload in useSecurityState — NOT from this hook.
  // This hook returns placeholder values that get overridden by the
  // WebSocket-driven state in useSecurityState.

  return {
    isDisconnected: true, // Default: locked until WebSocket says otherwise
    isSupported: true,
    deviceName: null,
    rssi: null,
    distance: null,
    statusMessage,
    isGattOnly: false,
    isPairing,
    availableDevices,
    scan,
    pair,
    unpair,
    requestPairing,
  };
}
