/**
 * BLE Setup Page — SentryOS
 *
 * Sits between login (/  ) and the dashboard. Every session the user must
 * confirm (or establish) a BLE tether before accessing the dashboard.
 *
 * Flow:
 *   1. useSetupGuard() ensures the user is logged in; redirects to / if not.
 *   2. On mount, fetch GET /bluetooth/status to check backend auto-connect.
 *   3a. If already connected → show "Continue to Dashboard →" (quick path).
 *   3b. If not connected → show scan / device-list UI.
 *   4. On pair success or continue → set BLE_SESSION_KEY → router.push("/dashboard").
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bluetooth,
  BluetoothOff,
  ChevronRight,
  Radio,
  RefreshCw,
  ShieldCheck,
  Signal,
  Zap,
} from "lucide-react";
import { ChameleonWrapper } from "@/components/ChameleonWrapper";
import { useSetupGuard, BLE_SESSION_KEY } from "@/hooks/useAuthGuard";
import { useProximityTether } from "@/hooks/useProximityTether";

const API_BASE = "http://localhost:8000";

interface BLEStatus {
  connected: boolean;
  paired_mac: string | null;
  device_name: string | null;
  rssi: number | null;
  distance_m: number | null;
  device_type: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function rssiLabel(rssi: number | null, dist: number | null): string {
  if (dist !== null) {
    if (dist < 0.5) return `Very Close · ${dist.toFixed(1)} m`;
    if (dist < 1.5) return `Near · ${dist.toFixed(1)} m`;
    if (dist < 2.5) return `Borderline · ${dist.toFixed(1)} m`;
    return `Out of Range · ${dist.toFixed(1)} m`;
  }
  if (rssi === null) return "No signal";
  if (rssi >= -55) return "Very Close";
  if (rssi >= -65) return "Near";
  if (rssi >= -75) return "Borderline";
  return "Out of Range";
}

function SignalBars({ rssi }: { rssi: number | null }) {
  const thresholds = [-55, -65, -70, -75, -85];
  const active = rssi === null ? 0 : thresholds.filter((t) => rssi >= t).length;
  return (
    <div className="flex items-end gap-[3px]">
      {[1, 2, 3, 4, 5].map((b) => (
        <div
          key={b}
          style={{ height: `${4 + b * 3}px`, width: "4px" }}
          className={`rounded-sm transition-colors duration-300 ${
            b <= active ? "bg-[var(--theme-primary)]" : "bg-white/10"
          }`}
        />
      ))}
    </div>
  );
}

// ── Grid background (same as login) ───────────────────────────────────────

function GridBackground() {
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(ellipse 65% 55% at 50% 38%, var(--theme-glow) 0%, transparent 72%)",
        opacity: 0.35, transition: "opacity 0.6s",
      }} />
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)",
        backgroundSize: "32px 32px",
      }} />
    </div>
  );
}

// ── Connected Device Card ──────────────────────────────────────────────────

function ConnectedCard({
  status,
  onContinue,
  onUseDifferent,
}: {
  status: BLEStatus;
  onContinue: () => void;
  onUseDifferent: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="flex flex-col gap-5"
    >
      {/* Status badge */}
      <div className="flex items-center justify-center gap-2">
        <span
          className="w-2 h-2 rounded-full animate-pulse"
          style={{ background: "var(--color-success)", boxShadow: "0 0 8px var(--color-success)" }}
        />
        <span
          className="text-xs font-semibold tracking-widest uppercase"
          style={{ color: "var(--color-success)", fontFamily: "monospace" }}
        >
          Device Connected
        </span>
      </div>

      {/* Device info strip */}
      <div
        className="flex items-center justify-between rounded-xl px-4 py-3"
        style={{
          background: "rgba(34,197,94,0.06)",
          border: "1px solid rgba(34,197,94,0.25)",
        }}
      >
        <div className="flex items-center gap-3">
          <Bluetooth size={16} style={{ color: "var(--color-success)" }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
              {status.device_name ?? "Unknown Device"}
            </p>
            <p className="text-[10px] font-mono mt-0.5" style={{ color: "var(--color-muted)" }}>
              {status.paired_mac ?? "—"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <SignalBars rssi={status.rssi} />
          <div className="text-right">
            <p className="text-xs font-mono" style={{ color: "var(--color-text-secondary)" }}>
              {status.rssi !== null ? `${status.rssi} dBm` : "—"}
            </p>
            <p className="text-[10px]" style={{ color: "var(--color-muted)" }}>
              {rssiLabel(status.rssi, status.distance_m)}
            </p>
          </div>
        </div>
      </div>

      {/* Continue CTA */}
      <motion.button
        onClick={onContinue}
        whileHover={{ scale: 1.012 }}
        whileTap={{ scale: 0.988 }}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold tracking-widest uppercase"
        style={{
          background: "var(--theme-glow)",
          border: "1.5px solid var(--theme-border)",
          color: "var(--theme-primary)",
          fontFamily: "monospace",
          cursor: "pointer",
        }}
      >
        <ShieldCheck size={15} />
        Continue to Dashboard
        <ChevronRight size={15} />
      </motion.button>

      {/* Use a different device */}
      <button
        onClick={onUseDifferent}
        className="text-xs text-center transition-colors"
        style={{ color: "var(--color-muted)", background: "none", border: "none", cursor: "pointer", fontFamily: "monospace" }}
      >
        Use a different device ↓
      </button>
    </motion.div>
  );
}

// ── Scan UI ────────────────────────────────────────────────────────────────

function ScanUI({
  isPairing,
  availableDevices,
  lastMac,
  onScan,
  onPair,
}: {
  isPairing: boolean;
  availableDevices: { name: string; address: string; rssi: number; type?: string }[];
  lastMac: string | null;
  onScan: () => void;
  onPair: (mac: string, name: string, type?: string) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col gap-4"
    >
      <p
        className="text-xs text-center leading-relaxed"
        style={{ color: "var(--color-text-secondary)", fontFamily: "monospace" }}
      >
        Scan for nearby Bluetooth devices to establish the proximity tether.
      </p>

      {/* Scan button */}
      <motion.button
        onClick={onScan}
        disabled={isPairing}
        whileHover={!isPairing ? { scale: 1.01 } : {}}
        whileTap={!isPairing ? { scale: 0.99 } : {}}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold tracking-widest uppercase"
        style={{
          background: isPairing ? "rgba(255,255,255,0.03)" : "var(--theme-glow)",
          border: "1.5px solid var(--theme-border)",
          color: isPairing ? "var(--color-muted)" : "var(--theme-primary)",
          fontFamily: "monospace",
          cursor: isPairing ? "wait" : "pointer",
          opacity: isPairing ? 0.65 : 1,
        }}
      >
        {isPairing ? (
          <>
            <Radio size={14} className="animate-spin" style={{ animationDuration: "1.5s" }} />
            Scanning…
          </>
        ) : (
          <>
            <RefreshCw size={14} />
            Scan for Devices
          </>
        )}
      </motion.button>

      {/* Device list */}
      <AnimatePresence>
        {availableDevices.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="rounded-xl overflow-hidden"
            style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}
          >
            {availableDevices.map((dev) => {
              const isLast = dev.address === lastMac;
              return (
                <button
                  key={dev.address}
                  onClick={() => onPair(dev.address, dev.name, dev.type)}
                  disabled={isPairing}
                  className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors duration-150 hover:bg-white/[0.04]"
                  style={{
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    cursor: isPairing ? "wait" : "pointer",
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <Bluetooth size={13} style={{ color: isLast ? "var(--theme-primary)" : "var(--color-text-secondary)" }} />
                    <div>
                      <span className="text-xs font-semibold" style={{ color: "var(--color-text)" }}>
                        {dev.name}
                      </span>
                      {isLast && (
                        <span
                          className="ml-2 text-[9px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded"
                          style={{
                            background: "rgba(0,212,255,0.12)",
                            color: "var(--theme-primary)",
                            border: "1px solid rgba(0,212,255,0.25)",
                          }}
                        >
                          Quick Reconnect
                        </span>
                      )}
                      <p className="text-[10px] font-mono mt-0.5" style={{ color: "var(--color-muted)" }}>
                        {dev.address}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <SignalBars rssi={dev.rssi} />
                    <span className="text-[10px] font-mono" style={{ color: "var(--color-muted)" }}>
                      {dev.rssi} dBm
                    </span>
                  </div>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function SetupPage() {
  useSetupGuard();

  const router = useRouter();
  const { scan, pair, isPairing, availableDevices } = useProximityTether();

  const [bleStatus, setBleStatus] = useState<BLEStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [showScanUI, setShowScanUI] = useState(false);
  const [pairingSuccess, setPairingSuccess] = useState(false);

  // Fetch backend BLE status on mount
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`${API_BASE}/bluetooth/status`);
        if (res.ok) {
          const data: BLEStatus = await res.json();
          setBleStatus(data);
          if (!data.connected) setShowScanUI(true);
        }
      } catch {
        // Backend unreachable — show scan UI
        setShowScanUI(true);
      } finally {
        setLoading(false);
      }
    };
    check();
  }, []);

  const handleContinue = useCallback(() => {
    sessionStorage.setItem(BLE_SESSION_KEY, "1");
    router.push("/dashboard");
  }, [router]);

  const handlePair = useCallback(
    async (mac: string, name: string, type?: string) => {
      await pair(mac, name, type);
      setPairingSuccess(true);
      // Give a brief moment so the user sees success, then navigate
      setTimeout(() => {
        sessionStorage.setItem(BLE_SESSION_KEY, "1");
        router.push("/dashboard");
      }, 600);
    },
    [pair, router]
  );

  return (
    <ChameleonWrapper dominantColor="#00d4ff">
      <div
        style={{
          minHeight: "100dvh",
          background: "var(--color-bg)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          position: "relative",
        }}
      >
        <GridBackground />

        <motion.div
          initial={{ opacity: 0, y: 28, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] }}
          style={{
            position: "relative",
            zIndex: 1,
            width: "100%",
            maxWidth: "420px",
            background: "rgba(255,255,255,0.035)",
            border: "1px solid var(--theme-border)",
            borderRadius: "16px",
            padding: "2.5rem",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            boxShadow: "0 0 64px var(--theme-glow), 0 32px 64px rgba(0,0,0,0.45)",
          }}
        >
          {/* ── Header ─────────────────────────────────────────────── */}
          <div className="flex flex-col items-center gap-3 mb-8">
            <motion.div
              animate={{
                boxShadow: [
                  "0 0 0px var(--theme-glow)",
                  "0 0 24px var(--theme-glow)",
                  "0 0 0px var(--theme-glow)",
                ],
              }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "52px",
                height: "52px",
                borderRadius: "14px",
                background: "var(--theme-glow)",
                border: "1.5px solid var(--theme-border)",
              }}
            >
              <Bluetooth size={26} color="var(--theme-primary)" strokeWidth={1.75} />
            </motion.div>

            <div className="text-center">
              <h1
                className="text-xl font-bold"
                style={{ color: "var(--color-text)", letterSpacing: "-0.02em" }}
              >
                BLE Tether Setup
              </h1>
              <p
                className="text-[10px] uppercase tracking-[0.16em] mt-1"
                style={{ color: "var(--color-muted)", fontFamily: "monospace" }}
              >
                Step 2 of 2 — Device Pairing
              </p>
            </div>
          </div>

          {/* ── Content ─────────────────────────────────────────────── */}
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-3 py-6"
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
                >
                  <Radio size={22} style={{ color: "var(--theme-primary)" }} />
                </motion.div>
                <p
                  className="text-xs tracking-widest uppercase"
                  style={{ color: "var(--color-muted)", fontFamily: "monospace" }}
                >
                  Checking backend…
                </p>
              </motion.div>
            ) : pairingSuccess ? (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 320, damping: 22 }}
                className="flex flex-col items-center gap-3 py-6"
              >
                <Zap size={32} style={{ color: "var(--color-success)" }} />
                <p
                  className="text-sm font-semibold tracking-widest uppercase"
                  style={{ color: "var(--color-success)", fontFamily: "monospace" }}
                >
                  Tether Established
                </p>
              </motion.div>
            ) : bleStatus?.connected && !showScanUI ? (
              <ConnectedCard
                key="connected"
                status={bleStatus}
                onContinue={handleContinue}
                onUseDifferent={() => setShowScanUI(true)}
              />
            ) : (
              <ScanUI
                key="scan"
                isPairing={isPairing}
                availableDevices={availableDevices}
                lastMac={bleStatus?.paired_mac ?? null}
                onScan={scan}
                onPair={handlePair}
              />
            )}
          </AnimatePresence>

          {/* ── Footer ────────────────────────────────────────────── */}
          <p
            style={{
              marginTop: "2rem",
              paddingTop: "1.25rem",
              borderTop: "1px solid rgba(255,255,255,0.06)",
              fontSize: "0.625rem",
              color: "var(--color-muted)",
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: "0.04em",
              lineHeight: 1.7,
              textAlign: "center",
            }}
          >
            A paired device is required to unlock the dashboard.
            <br />
            The session ends automatically if the tether is lost.
          </p>
        </motion.div>
      </div>
    </ChameleonWrapper>
  );
}
