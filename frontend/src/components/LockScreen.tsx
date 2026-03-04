/**
 * LockScreen — Informational Full-Screen Lock Overlay
 *
 * Rendered via <AnimatePresence> in the dashboard parent. This component is
 * mounted when securityState === "LOCKED" and unmounted when it transitions
 * back to "BLURRED" or "SECURE".
 *
 * Lifecycle (Option A — Auto-Heal):
 *   LOCKED → display this screen with reconnection instructions
 *   BLE device returns to range → useProximityTether.isDisconnected → false
 *   useSecurityState derives "SECURE" or "BLURRED" → parent unmounts this component
 *   AnimatePresence plays the exit animation, then removes it from the DOM
 *
 * No manual PIN required. The Bluetooth tether is the authentication factor.
 *
 * Visual Design:
 *   - Full-screen dark overlay with a frosted glass center card
 *   - Lock icon pulses gently to indicate an active (not crashed) state
 *   - RSSI meter shows signal proximity in real time
 *   - Enter animation: fade + scale up from 0.94
 *   - Exit animation: fade + scale down to 0.96 (slightly different — feels deliberate)
 */

"use client";

import { motion } from "framer-motion";
import { LockKeyhole, Bluetooth, BluetoothOff, Signal } from "lucide-react";

// ── Animation Config ─────────────────────────────────────────────────────────

const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

const cardVariants = {
  hidden: { opacity: 0, scale: 0.92, y: 16 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    y: -8,
    transition: { duration: 0.3, ease: "easeIn" as const },
  },
};

const lockIconPulse = {
  animate: {
    scale: [1, 1.06, 1],
    opacity: [0.9, 1, 0.9],
  },
};

// ── Props ─────────────────────────────────────────────────────────────────────

export interface LockScreenProps {
  /** Paired device name, or null if unknown. */
  deviceName: string | null;
  /** Last RSSI reading in dBm. Null if no advertising packet received. */
  rssi: number | null;
  /** Estimated distance from paired device in metres. Null if unavailable. */
  distance: number | null;
  /** Always true when using backend BLE. */
  isSupported: boolean;
  /** Whether the BLE device is currently disconnected / out of range. */
  isDisconnected: boolean;
  /** Always false when using backend BLE. */
  isGattOnly: boolean;
  /** True while a scan or pair operation is in progress. */
  isPairing: boolean;
  /** Devices found during the last scan. */
  availableDevices: { name: string; address: string; rssi: number; type?: string }[];
  /** Trigger a BLE scan via backend. */
  scan: () => Promise<void>;
  /** Pair with a device by MAC address. */
  pair: (mac: string, name?: string, deviceType?: string) => Promise<void>;
  /**
   * Legacy compatibility — triggers scan().
   */
  requestPairing: (namePrefix?: string) => Promise<void>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Maps RSSI dBm to a human-readable proximity label.
 * The useProximityTether threshold is –70 dBm (approx. 2 m).
 */
function rssiToProximityLabel(rssi: number, distance: number | null): string {
  if (distance !== null) {
    if (distance < 0.5) return `Very Close (${distance.toFixed(1)} m)`;
    if (distance < 1.5) return `Near (${distance.toFixed(1)} m)`;
    if (distance < 2.5) return `Borderline (${distance.toFixed(1)} m)`;
    return `Out of Range (${distance.toFixed(1)} m)`;
  }
  // Fallback to RSSI-only labels if distance unavailable
  if (rssi >= -55) return "Very Close (< 0.5 m)";
  if (rssi >= -65) return "Near (< 1.5 m)";
  if (rssi >= -75) return "Borderline (~2 m)";
  return "Out of Range (> 2 m)";
}

/** Renders 5 signal bars based on RSSI strength. */
function SignalBars({ rssi }: { rssi: number | null }) {
  // Map RSSI to 0–5 bars. Threshold for each bar: -55, -65, -70, -75, -85
  const thresholds = [-55, -65, -70, -75, -85];
  const activeBars = rssi === null
    ? 0
    : thresholds.filter((t) => rssi >= t).length;

  return (
    <div className="flex items-end gap-0.5" aria-label={`Signal: ${activeBars}/5 bars`}>
      {[1, 2, 3, 4, 5].map((bar) => (
        <div
          key={bar}
          style={{ height: `${6 + bar * 4}px`, width: "5px" }}
          className={`rounded-sm transition-colors duration-300 ${
            bar <= activeBars
              ? "bg-danger"
              : "bg-[var(--color-surface-raised)]"
          }`}
        />
      ))}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function LockScreen({
  deviceName,
  rssi,
  distance,
  isSupported,
  isDisconnected,
  isGattOnly,
  isPairing,
  availableDevices,
  scan,
  pair,
  requestPairing,
}: LockScreenProps) {
  return (
    <motion.div
      key="lock-screen-backdrop"
      variants={backdropVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        backgroundColor: "rgba(10, 10, 18, 0.88)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
    >
      {/* ── Center card ── */}
      <motion.div
        key="lock-screen-card"
        variants={cardVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="relative flex flex-col items-center gap-6 rounded-2xl p-10 max-w-md w-full mx-4 text-center"
        style={{
          background:
            "linear-gradient(145deg, rgba(26,26,46,0.95), rgba(22,33,62,0.9))",
          border: "1px solid var(--theme-border)",
          boxShadow:
            "0 0 0 1px rgba(239,68,68,0.15), 0 24px 64px rgba(0,0,0,0.7), 0 0 40px rgba(239,68,68,0.08)",
        }}
      >
        {/* ── Danger glow ring behind icon ── */}
        <div
          className="absolute inset-0 rounded-2xl opacity-20 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at 50% 0%, rgba(239,68,68,0.4) 0%, transparent 65%)",
          }}
        />

        {/* ── Lock icon (pulsing) ── */}
        <motion.div
          variants={lockIconPulse}
          animate="animate"
          transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut" }}
          className="relative z-10 flex items-center justify-center w-20 h-20 rounded-full"
          style={{
            background: "rgba(239,68,68,0.12)",
            border: "1px solid rgba(239,68,68,0.3)",
            boxShadow: "0 0 24px rgba(239,68,68,0.2)",
          }}
        >
          <LockKeyhole size={36} className="text-danger" strokeWidth={1.5} />
        </motion.div>

        {/* ── Status label ── */}
        <div className="relative z-10 flex flex-col gap-1.5">
          <span
            className="text-[10px] font-semibold tracking-[0.2em] uppercase"
            style={{ color: "var(--color-danger)" }}
          >
            Session Locked
          </span>
          <h2 className="text-2xl font-semibold text-[var(--color-text)]">
            Hardware Tether Lost
          </h2>
          <p
            className="text-sm leading-relaxed mt-1"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Your paired Bluetooth device has moved out of range.
            <br />
            This session will{" "}
            <span className="text-[var(--color-text)] font-medium">
              automatically restore
            </span>{" "}
            when the device returns within range.
          </p>
        </div>

        {/* ── RSSI signal meter ── */}
        <div
          className="relative z-10 w-full flex items-center justify-between rounded-xl px-4 py-3"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div className="flex items-center gap-2.5">
            {isGattOnly && !isDisconnected ? (
              <Bluetooth size={15} style={{ color: "var(--color-warning)" }} />
            ) : rssi !== null ? (
              <Signal size={15} style={{ color: "var(--color-danger)" }} />
            ) : (
              <BluetoothOff size={15} style={{ color: "var(--color-danger)" }} />
            )}
            <span
              className="text-xs font-medium"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {deviceName ?? "Unknown Device"}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <SignalBars rssi={rssi} />
            <span className="text-xs font-mono" style={{ color: "var(--color-muted)" }}>
              {isGattOnly && !isDisconnected
                ? "Connected (no proximity data)"
                : rssi !== null
                  ? `${rssi} dBm · ${rssiToProximityLabel(rssi, distance)}`
                  : "No signal"}
            </span>
          </div>
        </div>

        {/* ── Pair / Re-pair button ── */}
        {isSupported && (deviceName === null || isDisconnected) && (
          <div className="relative z-10 w-full space-y-2">
            <button
              onClick={() => scan()}
              disabled={isPairing}
              className="w-full py-2.5 rounded-xl text-sm font-medium transition-all duration-200"
              style={{
                background: isPairing ? "rgba(239,68,68,0.06)" : "rgba(239,68,68,0.12)",
                border: "1px solid rgba(239,68,68,0.3)",
                color: "var(--color-danger)",
                cursor: isPairing ? "wait" : "pointer",
                opacity: isPairing ? 0.7 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isPairing) (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.22)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  isPairing ? "rgba(239,68,68,0.06)" : "rgba(239,68,68,0.12)";
              }}
            >
              <Bluetooth size={14} className="inline mr-2" />
              {isPairing ? "Scanning…" : deviceName ? "Scan for Device" : "Scan for Bluetooth Devices"}
            </button>

            {/* ── Scanned device list ── */}
            {availableDevices.length > 0 && (
              <div
                className="max-h-48 overflow-y-auto rounded-xl"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                {availableDevices.map((dev) => (
                  <button
                    key={dev.address}
                    onClick={() => pair(dev.address, dev.name, (dev as { type?: string }).type)}
                    disabled={isPairing}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors duration-150 hover:bg-white/[0.04]"
                    style={{
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                      cursor: isPairing ? "wait" : "pointer",
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <Bluetooth size={12} style={{ color: "var(--color-text-secondary)" }} />
                      <span className="text-xs font-medium" style={{ color: "var(--color-text)" }}>
                        {dev.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono" style={{ color: "var(--color-muted)" }}>
                        {dev.rssi} dBm
                      </span>
                      <span className="text-[10px] font-mono" style={{ color: "var(--color-muted)" }}>
                        {dev.address}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── ADR-02 footnote ── */}
        <p
          className="relative z-10 text-[10px] tracking-wide"
          style={{ color: "var(--color-muted)" }}
        >
          ADR-02 · FAIL-CLOSED · Zero-Trust Physical Tether
        </p>
      </motion.div>
    </motion.div>
  );
}
