"""
SentryOS — Bluetooth Proximity Tether Service (Dual-Mode)
==========================================================

Manages Bluetooth scanning, pairing, and proximity monitoring using
**two complementary strategies**:

1. **Classic Bluetooth** — monitors the OS-level connection status of
   a paired audio device (e.g. earbuds/headphones).  Uses the WinRT
   ``BluetoothDevice`` API.  Binary signal: connected ↔ disconnected.
   No RSSI, but 100 % reliable for devices that maintain a persistent
   audio link (A2DP/HFP).

2. **BLE Advertisements** — listens for BLE advertisements via
   ``BleakScanner`` and reads RSSI for distance estimation.  More
   granular (distance in metres) but depends on the device actually
   advertising while connected.

The default (and recommended) mode is **classic** — earbuds that are
plugged into the laptop for audio provide an inherently reliable
"am I nearby?" signal that doesn't suffer from MAC randomisation or
inconsistent advertising behaviour that plagues phones.

Architecture
------------
┌──────────────────────┐  WinRT poll / BleakScanner  ┌───────────────┐
│  BLETetherService    │  ◄─────────────────────────  │  Earbuds /    │
│  (async tasks)       │     connection + RSSI        │  Phone (BLE)  │
└─────────┬────────────┘                              └───────────────┘
          │ update_ble()
          ▼
┌──────────────────┐
│ ThreadSafeState  │  → WebSocket 10 Hz broadcast
└──────────────────┘

Distance Calculation (BLE mode only)
-------------------------------------
Uses the Log-Distance Path Loss Model:

    d = 10 ^ ((tx_power - rssi) / (10 * n))

Where:
    tx_power = measured RSSI at 1 m reference distance (default: −59 dBm)
    n = path-loss exponent (default: 2.0 for free space)

An Exponential Moving Average (alpha = 0.3) smooths noisy RSSI readings.

Hysteresis (BLE mode)
---------------------
    Lock threshold:   distance > 2.5 m  (2 consecutive readings)
    Unlock threshold: distance < 2.0 m  (2 consecutive readings)
    Stale timeout:    10 s with no advertisement → disconnected

Classic BT mode
---------------
    Connected → unlocked,  Disconnected for > CLASSIC_DISCONNECT_GRACE_S → locked.
"""

from __future__ import annotations

import asyncio
import logging
import math
import subprocess
import sys
import time
from dataclasses import dataclass
from typing import Optional, Callable, Any

from bleak import BleakScanner
from bleak.backends.device import BLEDevice
from bleak.backends.scanner import AdvertisementData

from ble_config import BLEDeviceConfig, load_config, save_config, delete_config

# ── Optional WinRT import (Windows only, for classic BT monitoring) ─────────
try:
    import winrt.windows.devices.bluetooth as _wbt

    HAS_WINRT_BT = True
except ImportError:
    _wbt = None  # type: ignore[assignment]
    HAS_WINRT_BT = False

logger = logging.getLogger("sentryos.ble_tether")

# ── Constants ───────────────────────────────────────────────────────────────

SCAN_DURATION: float = 8.0
"""Duration (seconds) for a BLE scan when discovering devices."""

MONITOR_INTERVAL: float = 0.5
"""How often (seconds) the monitor loop checks for stale advertisements."""

RSSI_STALE_S: float = 10.0
"""If no advertisement is received within this window, the device is
considered out of range."""

DISTANCE_LOCK_M: float = 2.5
"""Distance threshold (metres) above which the session LOCKS."""

DISTANCE_UNLOCK_M: float = 2.0
"""Distance threshold (metres) below which the session UNLOCKS."""

DEBOUNCE_COUNT: int = 2
"""Number of consecutive readings beyond threshold before state change."""

EMA_ALPHA: float = 0.3
"""Exponential Moving Average smoothing factor for RSSI.  Higher values
give more weight to recent readings (more responsive, less smooth)."""

MAX_RECONNECT_RETRIES: int = 5
"""Maximum auto-reconnect attempts before giving up."""

RECONNECT_BASE_S: float = 1.0
"""Base delay (seconds) for exponential backoff reconnection."""

CLASSIC_POLL_INTERVAL_S: float = 2.0
"""How often (seconds) to poll the classic BT connection status."""

CLASSIC_DISCONNECT_GRACE_S: float = 5.0
"""Grace period (seconds) after classic BT disconnection before locking.
Prevents flapping when user briefly removes an earbud."""


# ── Helpers ─────────────────────────────────────────────────────────────────

def _mac_to_int(mac: str) -> int:
    """Convert MAC string 'AA:BB:CC:DD:EE:FF' to uint64."""
    return int(mac.replace(":", "").replace("-", ""), 16)


def _int_to_mac(addr: int) -> str:
    """Convert uint64 address to MAC string 'AA:BB:CC:DD:EE:FF'."""
    h = f"{addr:012X}"
    return ":".join(h[i : i + 2] for i in range(0, 12, 2))


# ── Data Structures ─────────────────────────────────────────────────────────

@dataclass
class BLEState:
    """Current BLE tether state — written by the monitor, read by the
    WebSocket broadcaster via ThreadSafeState."""
    connected: bool = False
    rssi: Optional[int] = None
    distance_m: Optional[float] = None
    device_name: Optional[str] = None
    is_locked: bool = True  # Fail-closed: starts locked (ADR-02)


@dataclass
class ScannedDevice:
    """A Bluetooth device discovered during scanning."""
    name: str
    address: str  # MAC address
    rssi: int
    device_type: str = "ble"  # "ble" or "classic"

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "address": self.address,
            "rssi": self.rssi,
            "type": self.device_type,
        }


# ── BLE Tether Service ─────────────────────────────────────────────────────

class BLETetherService:
    """Async BLE proximity tether — scan, pair, monitor RSSI, compute distance."""

    def __init__(self, state_updater: Callable[..., Any]) -> None:
        """
        Parameters
        ----------
        state_updater : callable
            A function ``f(ble_connected, ble_rssi, ble_distance_m, ble_device_name)``
            that pushes BLE state into ``ThreadSafeState``.  Typically
            ``shared_state.update_ble``.
        """
        self._state_updater = state_updater
        self._config: Optional[BLEDeviceConfig] = None
        self._ble_state = BLEState()
        self._monitor_task: Optional[asyncio.Task] = None
        self._scanner: Optional[BleakScanner] = None

        # RSSI smoothing (BLE mode)
        self._ema_rssi: Optional[float] = None
        self._last_adv_time: float = 0.0

        # Hysteresis counters (BLE mode)
        self._lock_count: int = 0
        self._unlock_count: int = 0

        # Classic BT state
        self._classic_connected: bool = False
        self._classic_disconnect_time: float = 0.0

        # Reconnect state
        self._reconnect_attempts: int = 0
        self._running: bool = False

    # ── Public API ──────────────────────────────────────────────────────

    async def scan(self, duration: float = SCAN_DURATION) -> list[dict]:
        """Scan for nearby BLE devices AND list OS-paired classic BT devices.
        Returns list of {name, address, rssi, type}."""
        logger.info("Starting BLE scan for %.1f seconds …", duration)
        devices: list[ScannedDevice] = []

        # ── 1. BLE scan ────────────────────────────────────────────────
        try:
            discovered = await BleakScanner.discover(timeout=duration)
            for d in discovered:
                name = d.name or f"Unknown ({d.address})"
                devices.append(ScannedDevice(
                    name=name,
                    address=d.address,
                    rssi=d.rssi if hasattr(d, 'rssi') and d.rssi is not None else -100,
                    device_type="ble",
                ))
            logger.info("BLE scan complete: %d devices found", len(devices))
        except Exception as exc:
            logger.error("BLE scan failed: %s", exc)

        # ── 2. Paired classic BT devices (WinRT) ──────────────────────
        paired = await self._scan_paired_classic()
        # Merge, avoiding duplicate MACs (prefer classic entry if same MAC)
        ble_macs = {d.address.upper() for d in devices}
        for pd in paired:
            if pd.address.upper() not in ble_macs:
                devices.append(pd)

        # Sort by signal strength (strongest first), classic devices at top
        devices.sort(key=lambda d: (d.device_type != "classic", -d.rssi))
        return [d.to_dict() for d in devices]

    async def _scan_paired_classic(self) -> list[ScannedDevice]:
        """Enumerate OS-paired classic Bluetooth devices using WinRT."""
        if not HAS_WINRT_BT:
            logger.debug("WinRT BT not available — skipping classic scan")
            return []

        devices: list[ScannedDevice] = []
        try:
            # Get PnP Bluetooth devices via PowerShell (reliable on all Windows)
            result = await asyncio.to_thread(
                subprocess.run,
                [
                    "powershell", "-NoProfile", "-Command",
                    (
                        "Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue | "
                        "Where-Object { $_.InstanceId -match 'BTHENUM\\\\DEV_' } | "
                        "ForEach-Object { "
                        "  $mac = ($_.InstanceId -split '_')[1] -split '\\\\' | Select-Object -First 1; "
                        "  $_.FriendlyName + '|' + $mac + '|' + $_.Status "
                        "}"
                    ),
                ],
                capture_output=True, text=True, timeout=10,
            )

            for line in result.stdout.strip().splitlines():
                parts = line.strip().split("|")
                if len(parts) >= 3:
                    name, mac_hex, status = parts[0], parts[1], parts[2]
                    if len(mac_hex) == 12:
                        mac_str = ":".join(mac_hex[i : i + 2] for i in range(0, 12, 2))
                        # Check connection via WinRT
                        connected = await self._is_classic_connected(mac_str)
                        devices.append(ScannedDevice(
                            name=name.strip(),
                            address=mac_str,
                            rssi=0 if connected else -100,
                            device_type="classic",
                        ))

            logger.info("Paired classic BT devices: %d found", len(devices))

        except Exception as exc:
            logger.error("Classic BT scan failed: %s", exc)

        return devices

    async def pair(self, mac: str, name: Optional[str] = None,
                   device_type: str = "classic") -> dict:
        """Pair with a specific device by MAC address.

        Saves the config to disk and starts the appropriate monitor.

        Parameters
        ----------
        mac : str
            Bluetooth MAC address.
        name : str, optional
            Human-readable device name.
        device_type : str
            ``"classic"`` for classic BT connection monitoring (earbuds),
            ``"ble"`` for BLE advertisement scanning.

        Returns
        -------
        dict
            ``{"success": True/False, "message": "...", "device": {...}}``
        """
        logger.info("Pairing with device: %s (%s) [%s]", name or "Unknown", mac, device_type)

        # Stop any existing monitor
        await self.stop_monitor()

        # Create and save config
        self._config = BLEDeviceConfig(
            mac=mac.upper(),
            name=name or "Unknown Device",
            device_type=device_type,
        )
        save_config(self._config)

        # Start monitoring
        await self.start_monitor()

        return {
            "success": True,
            "message": f"Paired with {self._config.name}",
            "device": {
                "mac": self._config.mac,
                "name": self._config.name,
            },
        }

    async def unpair(self) -> dict:
        """Unpair the current device and delete saved config."""
        logger.info("Unpairing BLE device")

        await self.stop_monitor()
        delete_config()
        self._config = None

        # Reset to locked state
        self._ble_state = BLEState()
        self._push_state()

        return {"success": True, "message": "Device unpaired"}

    def get_status(self) -> dict:
        """Return current BLE tether status."""
        return {
            "connected": self._ble_state.connected,
            "rssi": self._ble_state.rssi,
            "distance_m": round(self._ble_state.distance_m, 2) if self._ble_state.distance_m is not None else None,
            "device_name": self._ble_state.device_name,
            "is_locked": self._ble_state.is_locked,
            "paired_mac": self._config.mac if self._config else None,
            "device_type": self._config.device_type if self._config else None,
            "monitoring": self._running,
        }

    # ── Lifecycle ───────────────────────────────────────────────────────

    async def auto_connect(self) -> None:
        """Load saved config and start monitoring if a device is paired."""
        self._config = load_config()
        if self._config and self._config.is_valid():
            logger.info("Auto-connecting to saved device: %s (%s) [%s]",
                        self._config.name, self._config.mac, self._config.device_type)
            await self.start_monitor()
        else:
            logger.info("No saved BT device — tether inactive (session LOCKED)")
            self._ble_state = BLEState()
            self._push_state()

    async def start_monitor(self) -> None:
        """Start the proximity monitoring background task."""
        if self._running:
            logger.warning("Monitor already running")
            return

        if not self._config or not self._config.is_valid():
            logger.warning("Cannot start monitor — no valid config")
            return

        self._running = True
        self._reconnect_attempts = 0
        self._ema_rssi = None
        self._lock_count = 0
        self._unlock_count = 0
        self._classic_connected = False
        self._classic_disconnect_time = 0.0
        self._ble_state.device_name = self._config.name

        self._monitor_task = asyncio.create_task(self._monitor_loop())
        logger.info("%s monitor started for %s (%s)",
                     self._config.device_type.upper(),
                     self._config.name, self._config.mac)

    async def stop_monitor(self) -> None:
        """Stop the proximity monitoring background task."""
        self._running = False

        if self._scanner:
            try:
                await self._scanner.stop()
            except Exception:
                pass
            self._scanner = None

        if self._monitor_task:
            self._monitor_task.cancel()
            try:
                await self._monitor_task
            except asyncio.CancelledError:
                pass
            self._monitor_task = None

        logger.info("BLE monitor stopped")

    async def shutdown(self) -> None:
        """Graceful shutdown — stop monitor and update state."""
        await self.stop_monitor()
        self._ble_state = BLEState()
        self._push_state()

    # ── Internal: Classic BT Helpers ──────────────────────────────────

    async def _is_classic_connected(self, mac: str) -> bool:
        """Check if a classic BT device is connected using WinRT."""
        if not HAS_WINRT_BT:
            return False
        try:
            mac_int = _mac_to_int(mac)
            device = await _wbt.BluetoothDevice.from_bluetooth_address_async(mac_int)
            if device:
                return device.connection_status == _wbt.BluetoothConnectionStatus.CONNECTED
        except Exception as exc:
            logger.debug("WinRT classic BT check failed for %s: %s", mac, exc)
        return False

    # ── Internal: Monitor Loop (dispatcher) ─────────────────────────────

    async def _monitor_loop(self) -> None:
        """Dispatch to the appropriate monitor based on device_type."""
        device_type = self._config.device_type if self._config else "ble"
        logger.info("Starting %s monitor for %s …",
                     device_type.upper(), self._config.mac if self._config else "?")

        if device_type == "classic":
            await self._classic_monitor_loop()
        else:
            await self._ble_monitor_loop()

    # ── Internal: Classic BT Monitor ────────────────────────────────────

    async def _classic_monitor_loop(self) -> None:
        """Poll classic Bluetooth connection status via WinRT.

        The earbuds are connected to the laptop for audio (A2DP/HFP).
        We simply check whether the OS reports them as connected.

        - Connected → unlocked
        - Disconnected for >CLASSIC_DISCONNECT_GRACE_S → locked

        Optionally runs a BLE scanner in parallel for RSSI/distance data.
        """
        if not HAS_WINRT_BT:
            logger.error("WinRT BT not available — cannot monitor classic BT")
            self._running = False
            return

        target_mac = self._config.mac if self._config else ""
        target_mac_int = _mac_to_int(target_mac)
        was_connected = False
        disconnect_time: float = 0.0

        logger.info("Classic BT monitor active: polling %s every %.1fs",
                     target_mac, CLASSIC_POLL_INTERVAL_S)

        # Optionally try BLE scanner for RSSI (best-effort)
        ble_task: Optional[asyncio.Task] = None
        try:
            ble_task = asyncio.create_task(self._ble_scanner_best_effort())
        except Exception:
            pass

        while self._running:
            try:
                device = await _wbt.BluetoothDevice.from_bluetooth_address_async(
                    target_mac_int
                )
                is_connected = (
                    device is not None
                    and device.connection_status
                    == _wbt.BluetoothConnectionStatus.CONNECTED
                )

                now = time.time()

                if is_connected:
                    disconnect_time = 0.0
                    if not was_connected:
                        logger.info("Classic BT CONNECTED: %s", self._config.name if self._config else "?")
                        was_connected = True

                    # Update state — connected + unlocked
                    self._ble_state.connected = True
                    self._ble_state.is_locked = False
                    self._ble_state.device_name = (
                        device.name if device and device.name else
                        (self._config.name if self._config else None)
                    )
                    # If we have BLE RSSI, keep it; otherwise set None
                    # (distance is not meaningful for classic BT —
                    #  earbuds are on the user's body when connected)
                    if self._ble_state.distance_m is None:
                        self._ble_state.distance_m = 0.5  # ~on body
                    self._push_state()

                else:
                    # Disconnected — apply grace period
                    if was_connected:
                        if disconnect_time == 0.0:
                            disconnect_time = now
                            logger.info(
                                "Classic BT disconnected — grace period %.1fs",
                                CLASSIC_DISCONNECT_GRACE_S,
                            )

                    elapsed = now - disconnect_time if disconnect_time > 0 else 999.0

                    if elapsed >= CLASSIC_DISCONNECT_GRACE_S:
                        if was_connected or self._ble_state.connected:
                            logger.info(
                                "Classic BT LOCKED after %.1fs disconnected",
                                elapsed,
                            )
                            was_connected = False

                        self._ble_state.connected = False
                        self._ble_state.is_locked = True
                        self._ble_state.rssi = None
                        self._ble_state.distance_m = None
                        self._push_state()

            except asyncio.CancelledError:
                break

            except Exception as exc:
                # Bluetooth adapter turned off / WinRT error — treat as disconnected
                logger.error("Classic BT poll error (treating as disconnected): %s", exc)

                now = time.time()
                if was_connected and disconnect_time == 0.0:
                    disconnect_time = now
                    logger.info("Classic BT error — grace period %.1fs",
                                CLASSIC_DISCONNECT_GRACE_S)

                elapsed = now - disconnect_time if disconnect_time > 0 else 999.0
                if elapsed >= CLASSIC_DISCONNECT_GRACE_S:
                    if was_connected or self._ble_state.connected:
                        logger.info("Classic BT LOCKED (adapter error) after %.1fs", elapsed)
                        was_connected = False
                    self._ble_state.connected = False
                    self._ble_state.is_locked = True
                    self._ble_state.rssi = None
                    self._ble_state.distance_m = None
                    self._push_state()

            await asyncio.sleep(CLASSIC_POLL_INTERVAL_S)

        # Clean up BLE task
        if ble_task and not ble_task.done():
            ble_task.cancel()
            try:
                await ble_task
            except asyncio.CancelledError:
                pass

    async def _ble_scanner_best_effort(self) -> None:
        """Run BLE scanner alongside classic BT monitor for optional RSSI.

        This is best-effort: if the earbuds don't advertise BLE while
        connected via classic BT, we just won't get RSSI data.
        """
        target_mac = (self._config.mac.upper() if self._config else "")

        def _on_adv(device: BLEDevice, adv_data: AdvertisementData) -> None:
            if device.address.upper() != target_mac:
                return
            if adv_data.rssi is None:
                return

            self._last_adv_time = time.time()

            # Apply EMA smoothing
            if self._ema_rssi is None:
                self._ema_rssi = float(adv_data.rssi)
            else:
                self._ema_rssi = (
                    EMA_ALPHA * adv_data.rssi + (1 - EMA_ALPHA) * self._ema_rssi
                )

            self._ble_state.rssi = int(round(self._ema_rssi))
            self._ble_state.distance_m = self._rssi_to_distance(
                self._ble_state.rssi
            )
            # Don't call _push_state here — the classic monitor handles it

        try:
            self._scanner = BleakScanner(detection_callback=_on_adv)
            await self._scanner.start()
            # Run until cancelled
            while self._running:
                await asyncio.sleep(1.0)
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            logger.debug("BLE best-effort scanner error (non-fatal): %s", exc)
        finally:
            if self._scanner:
                try:
                    await self._scanner.stop()
                except Exception:
                    pass
                self._scanner = None

    # ── Internal: BLE Monitor ───────────────────────────────────────────

    async def _ble_monitor_loop(self) -> None:
        """BLE-only monitoring loop — runs a BleakScanner in callback mode
        filtering for the paired device's advertisements."""
        target_mac = self._config.mac.upper() if self._config else ""

        def _on_advertisement(device: BLEDevice, adv_data: AdvertisementData) -> None:
            """Callback fired for each BLE advertisement received."""
            if device.address.upper() != target_mac:
                return

            raw_rssi = adv_data.rssi
            if raw_rssi is None:
                return

            self._last_adv_time = time.time()

            # Update device name if we get a better one
            if adv_data.local_name and adv_data.local_name != self._ble_state.device_name:
                self._ble_state.device_name = adv_data.local_name
                if self._config:
                    self._config.name = adv_data.local_name
                    save_config(self._config)

            # Apply EMA smoothing
            if self._ema_rssi is None:
                self._ema_rssi = float(raw_rssi)
            else:
                self._ema_rssi = EMA_ALPHA * raw_rssi + (1 - EMA_ALPHA) * self._ema_rssi

            smoothed_rssi = int(round(self._ema_rssi))
            distance = self._rssi_to_distance(smoothed_rssi)

            self._ble_state.rssi = smoothed_rssi
            self._ble_state.distance_m = distance
            self._ble_state.connected = True

            self._apply_distance_hysteresis(distance)
            self._push_state()

        # ── Scanner lifecycle with auto-restart ───────────────────────
        while self._running:
            try:
                logger.info("Starting BLE scanner for %s …", target_mac)
                self._scanner = BleakScanner(
                    detection_callback=_on_advertisement,
                )
                await self._scanner.start()
                self._reconnect_attempts = 0

                while self._running:
                    await asyncio.sleep(MONITOR_INTERVAL)

                    if self._last_adv_time > 0:
                        elapsed = time.time() - self._last_adv_time
                        if elapsed > RSSI_STALE_S:
                            if self._ble_state.connected:
                                logger.warning(
                                    "No BLE advertisement for %.1fs — disconnected",
                                    elapsed,
                                )
                                self._ble_state.connected = False
                                self._ble_state.rssi = None
                                self._ble_state.distance_m = None
                                self._ble_state.is_locked = True
                                self._ema_rssi = None
                                self._lock_count = 0
                                self._unlock_count = 0
                                self._push_state()

            except asyncio.CancelledError:
                break

            except Exception as exc:
                logger.error("BLE scanner error: %s", exc)

                if self._scanner:
                    try:
                        await self._scanner.stop()
                    except Exception:
                        pass
                    self._scanner = None

                self._ble_state.connected = False
                self._ble_state.is_locked = True
                self._push_state()

                self._reconnect_attempts += 1
                if self._reconnect_attempts > MAX_RECONNECT_RETRIES:
                    logger.error(
                        "BLE scanner failed after %d retries — giving up",
                        MAX_RECONNECT_RETRIES,
                    )
                    self._running = False
                    break

                delay = RECONNECT_BASE_S * (2 ** (self._reconnect_attempts - 1))
                delay = min(delay, 30.0)
                logger.info("Retrying BLE scanner in %.1fs (attempt %d/%d)",
                            delay, self._reconnect_attempts, MAX_RECONNECT_RETRIES)
                await asyncio.sleep(delay)

        # Cleanup
        if self._scanner:
            try:
                await self._scanner.stop()
            except Exception:
                pass
            self._scanner = None

    # ── Internal: Distance & Hysteresis ─────────────────────────────────

    def _rssi_to_distance(self, rssi: int) -> float:
        """Convert RSSI (dBm) to estimated distance (metres) using the
        Log-Distance Path Loss Model.

            d = 10 ^ ((tx_power - rssi) / (10 * n))

        Parameters use calibration values from the saved config, with
        sensible defaults for a typical smartphone.
        """
        tx_power = self._config.tx_power if self._config else -59
        n = self._config.path_loss_n if self._config else 2.0

        if n <= 0:
            n = 2.0  # Safety: prevent division by zero

        try:
            distance = 10 ** ((tx_power - rssi) / (10 * n))
            # Clamp to reasonable range
            return max(0.1, min(distance, 50.0))
        except (ValueError, OverflowError):
            return 50.0  # Max range on error

    def _apply_distance_hysteresis(self, distance: float) -> None:
        """Apply distance-based hysteresis with debouncing.

        Lock:   distance > DISTANCE_LOCK_M   for DEBOUNCE_COUNT consecutive readings
        Unlock: distance < DISTANCE_UNLOCK_M for DEBOUNCE_COUNT consecutive readings

        The 0.5m gap between lock (2.5m) and unlock (2.0m) prevents flapping.
        """
        currently_locked = self._ble_state.is_locked

        if currently_locked:
            # Currently locked — need consecutive close readings to unlock
            if distance < DISTANCE_UNLOCK_M:
                self._unlock_count += 1
                self._lock_count = 0
                if self._unlock_count >= DEBOUNCE_COUNT:
                    self._ble_state.is_locked = False
                    logger.info("BLE UNLOCKED — distance: %.2fm < %.1fm",
                                distance, DISTANCE_UNLOCK_M)
            else:
                self._unlock_count = 0
        else:
            # Currently unlocked — need consecutive far readings to lock
            if distance > DISTANCE_LOCK_M:
                self._lock_count += 1
                self._unlock_count = 0
                if self._lock_count >= DEBOUNCE_COUNT:
                    self._ble_state.is_locked = True
                    logger.info("BLE LOCKED — distance: %.2fm > %.1fm",
                                distance, DISTANCE_LOCK_M)
            else:
                self._lock_count = 0

    def _push_state(self) -> None:
        """Push current BLE state to the ThreadSafeState container."""
        self._state_updater(
            ble_connected=self._ble_state.connected and not self._ble_state.is_locked,
            ble_rssi=self._ble_state.rssi,
            ble_distance_m=round(self._ble_state.distance_m, 2) if self._ble_state.distance_m is not None else None,
            ble_device_name=self._ble_state.device_name,
        )
