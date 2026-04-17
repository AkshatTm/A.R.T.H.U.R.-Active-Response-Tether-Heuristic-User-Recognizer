"""
A.R.T.H.U.R. — BLE Configuration Persistence
==========================================

Manages saving/loading the paired Bluetooth device configuration to a
JSON file so the backend can auto-reconnect on startup without user
interaction.

Config Schema (ble_config.json):
    {
        "mac": "AA:BB:CC:DD:EE:FF",
        "name": "Nirvana Crystl",
        "tx_power": -59,
        "path_loss_n": 2.0,
        "device_type": "classic"
    }

Fields
------
mac : str
    Bluetooth MAC address of the paired device.
name : str
    Human-readable device name (from BLE advertisement or GATT).
tx_power : int
    Measured RSSI at 1 metre reference distance (dBm).  Default -59
    is typical for modern smartphones.
path_loss_n : float
    Path-loss exponent for the log-distance model.  2.0 = free space,
    2.5-3.0 = typical indoor with obstacles.
device_type : str
    "classic" for classic Bluetooth (earbuds/headphones) or "ble" for
    BLE advertisement-based monitoring.  Default is "classic".
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Optional

logger = logging.getLogger("arthur.ble_config")

# Config file lives next to main.py
_CONFIG_DIR = Path(__file__).resolve().parent
_CONFIG_FILE = _CONFIG_DIR / "ble_config.json"


@dataclass
class BLEDeviceConfig:
    """Persisted BLE device pairing configuration."""

    mac: str = ""
    name: str = "Unknown Device"
    tx_power: int = -59
    path_loss_n: float = 2.0
    device_type: str = "classic"  # "classic" or "ble"

    def is_valid(self) -> bool:
        """Return True if a MAC address is configured."""
        return bool(self.mac and len(self.mac) >= 17)


def load_config() -> Optional[BLEDeviceConfig]:
    """Load BLE config from disk.  Returns None if no config file exists."""
    if not _CONFIG_FILE.exists():
        logger.info("No BLE config file found at %s", _CONFIG_FILE)
        return None

    try:
        with open(_CONFIG_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)

        cfg = BLEDeviceConfig(
            mac=data.get("mac", ""),
            name=data.get("name", "Unknown Device"),
            tx_power=data.get("tx_power", -59),
            path_loss_n=data.get("path_loss_n", 2.0),
            device_type=data.get("device_type", "classic"),
        )

        if cfg.is_valid():
            logger.info("Loaded BLE config: %s (%s)", cfg.name, cfg.mac)
            return cfg
        else:
            logger.warning("BLE config file exists but MAC is invalid: %r", cfg.mac)
            return None

    except (json.JSONDecodeError, OSError) as exc:
        logger.error("Failed to read BLE config: %s", exc)
        return None


def save_config(config: BLEDeviceConfig) -> bool:
    """Persist BLE config to disk.  Returns True on success."""
    try:
        with open(_CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(asdict(config), f, indent=2)
        logger.info("Saved BLE config: %s (%s)", config.name, config.mac)
        return True
    except OSError as exc:
        logger.error("Failed to save BLE config: %s", exc)
        return False


def delete_config() -> bool:
    """Remove the config file (unpair).  Returns True if deleted."""
    try:
        if _CONFIG_FILE.exists():
            os.remove(_CONFIG_FILE)
            logger.info("Deleted BLE config file")
        return True
    except OSError as exc:
        logger.error("Failed to delete BLE config: %s", exc)
        return False
