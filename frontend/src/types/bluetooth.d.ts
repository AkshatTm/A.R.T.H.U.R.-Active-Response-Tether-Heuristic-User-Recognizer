/**
 * bluetooth.d.ts
 * --------------
 * Type declarations for the BLE proximity tether system.
 *
 * BLE operations are now handled entirely by the Python backend using
 * the Bleak library.  The frontend only interacts with BLE through:
 *   1. REST endpoints (scan, pair, unpair, status)
 *   2. WebSocket payload fields (ble_connected, ble_rssi, etc.)
 *
 * No Web Bluetooth API types are needed since the browser no longer
 * manages Bluetooth directly.
 */

/** A Bluetooth device discovered during a backend scan. */
interface ScannedBLEDevice {
  /** Human-readable device name. */
  name: string;
  /** Bluetooth MAC address (e.g. "AA:BB:CC:DD:EE:FF"). */
  address: string;
  /** Signal strength in dBm at time of discovery. */
  rssi: number;
  /** Device type: "classic" for paired audio devices, "ble" for BLE-only. */
  type: "classic" | "ble";
}

/** Response from GET /bluetooth/scan */
interface BLEScanResponse {
  devices: ScannedBLEDevice[];
}

/** Request body for POST /bluetooth/pair */
interface BLEPairRequest {
  mac: string;
  name?: string;
  device_type?: "classic" | "ble";
}

/** Response from POST /bluetooth/pair */
interface BLEPairResponse {
  success: boolean;
  message: string;
  device?: {
    mac: string;
    name: string;
  };
}

/** Response from GET /bluetooth/status */
interface BLEStatusResponse {
  connected: boolean;
  rssi: number | null;
  distance_m: number | null;
  device_name: string | null;
  is_locked: boolean;
  paired_mac: string | null;
  device_type: string | null;
  monitoring: boolean;
}

/** Response from POST /bluetooth/unpair */
interface BLEUnpairResponse {
  success: boolean;
  message: string;
}
