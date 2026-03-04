/**
 * Test Page: Bluetooth / Proximity Tether (Backend BLE)
 *
 * Diagnostic page for verifying backend-driven BLE proximity tethering.
 * Shows backend connectivity, live RSSI + distance history charts,
 * scan/pair/unpair controls, and distance-based hysteresis state.
 *
 * All Bluetooth operations run on the Python backend (Bleak library).
 * This page calls REST endpoints for actions and polls /bluetooth/status
 * for real-time BLE data.
 */

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useProximityTether } from "@/hooks/useProximityTether";

/** Maximum history entries to retain for the charts. */
const HISTORY_MAX = 40;

/** Distance-based lock/unlock thresholds (mirror backend constants). */
const DISTANCE_LOCK_M = 2.5;
const DISTANCE_UNLOCK_M = 2.0;

/** Backend API base URL. */
const API_BASE = "http://localhost:8000";

/** Polling interval for /bluetooth/status (ms). */
const STATUS_POLL_MS = 1000;

interface BLEStatus {
  connected: boolean;
  paired_mac: string | null;
  device_name: string | null;
  rssi: number | null;
  distance_m: number | null;
  device_type: string | null;
  monitoring: boolean;
}

export default function BluetoothTestPage() {
  const {
    scan,
    pair,
    unpair,
    isPairing,
    availableDevices,
    statusMessage,
  } = useProximityTether();

  const [rssiHistory, setRssiHistory] = useState<(number | null)[]>([]);
  const [distanceHistory, setDistanceHistory] = useState<(number | null)[]>([]);
  const [bleStatus, setBleStatus] = useState<BLEStatus | null>(null);
  const [backendReachable, setBackendReachable] = useState<boolean | null>(null);
  const prevRssiRef = useRef<number | null>(null);
  const prevDistRef = useRef<number | null>(null);

  // ── Poll backend /bluetooth/status ───────────────────────────────────
  useEffect(() => {
    let active = true;

    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/bluetooth/status`);
        if (!res.ok) throw new Error(`${res.status}`);
        const data: BLEStatus = await res.json();
        if (!active) return;
        setBleStatus(data);
        setBackendReachable(true);

        // Track RSSI history
        if (data.rssi !== prevRssiRef.current) {
          prevRssiRef.current = data.rssi;
          setRssiHistory((prev) => {
            const next = [...prev, data.rssi];
            return next.length > HISTORY_MAX ? next.slice(-HISTORY_MAX) : next;
          });
        }

        // Track distance history
        if (data.distance_m !== prevDistRef.current) {
          prevDistRef.current = data.distance_m;
          setDistanceHistory((prev) => {
            const next = [...prev, data.distance_m];
            return next.length > HISTORY_MAX ? next.slice(-HISTORY_MAX) : next;
          });
        }
      } catch {
        if (!active) return;
        setBackendReachable(false);
      }
    };

    poll();
    const id = setInterval(poll, STATUS_POLL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  const clearHistory = useCallback(() => {
    setRssiHistory([]);
    setDistanceHistory([]);
  }, []);

  return (
    <main style={{ padding: "2rem", fontFamily: "monospace", maxWidth: 800, margin: "0 auto" }}>
      <h1 style={{ fontFamily: "sans-serif", marginBottom: "0.5rem" }}>
        Test — Bluetooth / Proximity Tether (Backend)
      </h1>

      {/* ── Backend Status ─────────────────────────────────────────────── */}
      <section
        style={{
          marginTop: "1rem",
          padding: "1rem",
          borderRadius: "0.5rem",
          background: "var(--color-surface, #1a1a1a)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <h2 style={{ fontFamily: "sans-serif", fontSize: "0.95rem", marginBottom: "0.5rem" }}>
          Backend Status
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", fontSize: "0.8rem" }}>
          <div>
            <strong>Backend reachable:</strong>{" "}
            <StatusPill ok={backendReachable === true}>
              {backendReachable === null ? "…" : backendReachable ? "✓ Connected" : "✗ Unreachable"}
            </StatusPill>
          </div>
          <div>
            <strong>BLE monitoring:</strong>{" "}
            <StatusPill ok={bleStatus?.monitoring === true}>
              {bleStatus?.monitoring ? "✓ Active" : "✗ Inactive"}
            </StatusPill>
          </div>          <div>
            <strong>Device type:</strong>{" "}
            <StatusPill ok={bleStatus?.device_type === "classic"}>
              {bleStatus?.device_type ?? "none"}
            </StatusPill>
          </div>          <div>
            <strong>Paired device:</strong>{" "}
            <StatusPill ok={bleStatus?.paired_mac !== null && bleStatus?.paired_mac !== undefined}>
              {bleStatus?.device_name ?? bleStatus?.paired_mac ?? "None"}
            </StatusPill>
          </div>
          <div>
            <strong>BLE connected:</strong>{" "}
            <StatusPill ok={bleStatus?.connected === true}>
              {bleStatus?.connected ? "✓ Yes" : "✗ No"}
            </StatusPill>
          </div>
        </div>
      </section>

      {/* ── Scan & Pair Controls ───────────────────────────────────────── */}
      <section style={{ marginTop: "1rem" }}>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <button
            onClick={scan}
            disabled={isPairing}
            style={{
              padding: "0.5rem 1.25rem",
              cursor: isPairing ? "wait" : "pointer",
              fontSize: "0.9rem",
              borderRadius: "0.35rem",
              background: "#2563eb",
              color: "#fff",
              border: "none",
              opacity: isPairing ? 0.6 : 1,
            }}
          >
            {isPairing ? "Scanning…" : "Scan for Devices"}
          </button>
          <button
            onClick={unpair}
            disabled={!bleStatus?.paired_mac}
            style={{
              padding: "0.5rem 1rem",
              cursor: bleStatus?.paired_mac ? "pointer" : "not-allowed",
              fontSize: "0.9rem",
              borderRadius: "0.35rem",
              background: "rgba(239,68,68,0.15)",
              color: "#ef4444",
              border: "1px solid rgba(239,68,68,0.3)",
              opacity: bleStatus?.paired_mac ? 1 : 0.4,
            }}
          >
            Unpair
          </button>
          <button
            onClick={clearHistory}
            style={{
              padding: "0.5rem 1rem",
              cursor: "pointer",
              fontSize: "0.8rem",
              borderRadius: "0.35rem",
              background: "rgba(255,255,255,0.06)",
              color: "#aaa",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            Clear History
          </button>
        </div>

        <p style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "#aaa" }}>
          {statusMessage}
        </p>

        {/* ── Scan Results ──────────────────────────────────────────────── */}
        {availableDevices.length > 0 && (
          <div
            style={{
              marginTop: "0.75rem",
              maxHeight: "200px",
              overflowY: "auto",
              borderRadius: "0.5rem",
              border: "1px solid rgba(255,255,255,0.08)",
              background: "var(--color-surface, #1a1a1a)",
            }}
          >
            <table style={{ width: "100%", fontSize: "0.8rem", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                  <th style={{ padding: "0.5rem", textAlign: "left" }}>Name</th>
                  <th style={{ padding: "0.5rem", textAlign: "left" }}>MAC Address</th>
                  <th style={{ padding: "0.5rem", textAlign: "center" }}>Type</th>
                  <th style={{ padding: "0.5rem", textAlign: "right" }}>RSSI</th>
                  <th style={{ padding: "0.5rem", textAlign: "center" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {availableDevices.map((d) => (
                  <tr key={d.address} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td style={{ padding: "0.4rem 0.5rem" }}>{d.name || "Unknown"}</td>
                    <td style={{ padding: "0.4rem 0.5rem", color: "#888" }}>{d.address}</td>
                    <td style={{ padding: "0.4rem 0.5rem", textAlign: "center" }}>
                      <span style={{
                        padding: "0.1rem 0.4rem",
                        borderRadius: "999px",
                        fontSize: "0.7rem",
                        background: (d as { type?: string }).type === "classic" ? "rgba(59,130,246,0.15)" : "rgba(168,85,247,0.15)",
                        color: (d as { type?: string }).type === "classic" ? "#3b82f6" : "#a855f7",
                        border: `1px solid ${(d as { type?: string }).type === "classic" ? "rgba(59,130,246,0.3)" : "rgba(168,85,247,0.3)"}`,
                      }}>
                        {(d as { type?: string }).type === "classic" ? "Classic" : "BLE"}
                      </span>
                    </td>
                    <td style={{ padding: "0.4rem 0.5rem", textAlign: "right" }}>{d.rssi} dBm</td>
                    <td style={{ padding: "0.4rem 0.5rem", textAlign: "center" }}>
                      <button
                        onClick={() => pair(d.address, d.name, (d as { type?: string }).type)}
                        disabled={isPairing}
                        style={{
                          padding: "0.2rem 0.6rem",
                          fontSize: "0.75rem",
                          borderRadius: "0.25rem",
                          background: "#22c55e",
                          color: "#000",
                          border: "none",
                          cursor: "pointer",
                        }}
                      >
                        Pair
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── RSSI History Chart ─────────────────────────────────────────── */}
      <section
        style={{
          marginTop: "1.5rem",
          padding: "1rem",
          borderRadius: "0.5rem",
          background: "var(--color-surface, #1a1a1a)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <h2 style={{ fontFamily: "sans-serif", fontSize: "0.95rem", marginBottom: "0.75rem" }}>
          RSSI History (last {HISTORY_MAX} readings)
        </h2>
        <RssiChart history={rssiHistory} />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.5rem", fontSize: "0.7rem", color: "#888" }}>
          <span>Current: {bleStatus?.rssi !== null && bleStatus?.rssi !== undefined ? `${bleStatus.rssi} dBm` : "—"}</span>
          <span>Readings: {rssiHistory.filter((v) => v !== null).length}</span>
        </div>
      </section>

      {/* ── Distance History Chart ─────────────────────────────────────── */}
      <section
        style={{
          marginTop: "1rem",
          padding: "1rem",
          borderRadius: "0.5rem",
          background: "var(--color-surface, #1a1a1a)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <h2 style={{ fontFamily: "sans-serif", fontSize: "0.95rem", marginBottom: "0.75rem" }}>
          Distance History (last {HISTORY_MAX} readings)
        </h2>
        <DistanceChart history={distanceHistory} />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.5rem", fontSize: "0.7rem", color: "#888" }}>
          <span>Lock @ &gt;{DISTANCE_LOCK_M}m</span>
          <span>Unlock @ &lt;{DISTANCE_UNLOCK_M}m</span>
          <span>Current: {bleStatus?.distance_m !== null && bleStatus?.distance_m !== undefined ? `${bleStatus.distance_m.toFixed(2)}m` : "—"}</span>
        </div>
      </section>

      {/* ── Hysteresis State ───────────────────────────────────────────── */}
      <section
        style={{
          marginTop: "1rem",
          padding: "1rem",
          borderRadius: "0.5rem",
          background: "var(--color-surface, #1a1a1a)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <h2 style={{ fontFamily: "sans-serif", fontSize: "0.95rem", marginBottom: "0.5rem" }}>
          Distance Hysteresis
        </h2>
        <div style={{ fontSize: "0.8rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem" }}>
          <div>
            <strong>Tether state:</strong>{" "}
            <StatusPill ok={bleStatus?.connected === true}>
              {bleStatus?.connected ? "TETHERED (Unlocked)" : "UNTETHERED (Locked)"}
            </StatusPill>
          </div>
          <div>
            <strong>Current distance:</strong>{" "}
            {bleStatus?.distance_m !== null && bleStatus?.distance_m !== undefined
              ? `${bleStatus.distance_m.toFixed(2)} m`
              : "n/a"}
          </div>
          <div>
            <strong>Lock @</strong> &gt;{DISTANCE_LOCK_M}m (×2 consecutive)
          </div>
          <div>
            <strong>Unlock @</strong> &lt;{DISTANCE_UNLOCK_M}m (×2 consecutive)
          </div>
        </div>
      </section>

      {/* ── Raw Backend Status ─────────────────────────────────────────── */}
      <section style={{ marginTop: "1rem", marginBottom: "2rem" }}>
        <h2 style={{ fontFamily: "sans-serif", fontSize: "0.95rem", marginBottom: "0.5rem" }}>
          Raw Backend Status
        </h2>
        <pre
          style={{
            fontSize: "0.8rem",
            whiteSpace: "pre-wrap",
            background: "var(--color-surface, #1a1a1a)",
            padding: "1rem",
            borderRadius: "0.5rem",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {bleStatus ? JSON.stringify(bleStatus, null, 2) : "Loading…"}
        </pre>
      </section>
    </main>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusPill({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.15rem 0.5rem",
        borderRadius: "999px",
        fontSize: "0.75rem",
        background: ok ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
        color: ok ? "#22c55e" : "#ef4444",
        border: `1px solid ${ok ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
      }}
    >
      {children}
    </span>
  );
}

/**
 * SVG bar chart for RSSI readings.
 */
function RssiChart({ history }: { history: (number | null)[] }) {
  const width = 600;
  const height = 120;
  const padding = { top: 10, bottom: 20, left: 35, right: 10 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const minRssi = -100;
  const maxRssi = -30;
  const range = maxRssi - minRssi;

  const barWidth = Math.max(2, chartW / HISTORY_MAX - 1);

  const yScale = (rssi: number) =>
    padding.top + chartH - ((rssi - minRssi) / range) * chartH;

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${width} ${height}`}
      style={{ background: "rgba(0,0,0,0.3)", borderRadius: "0.35rem" }}
    >
      {/* Y-axis labels */}
      {[-100, -80, -60, -40].map((v) => (
        <text
          key={v}
          x={padding.left - 4}
          y={yScale(v) + 3}
          textAnchor="end"
          fill="#666"
          fontSize={8}
        >
          {v}
        </text>
      ))}

      {/* Bars */}
      {history.map((rssi, i) => {
        if (rssi === null) return null;
        const x = padding.left + (i / HISTORY_MAX) * chartW;
        const y = yScale(rssi);
        const barH = chartH - (y - padding.top);
        // Colour-code: strong signal green, weak red
        const fill = rssi >= -60 ? "#22c55e" : rssi >= -75 ? "#eab308" : "#ef4444";
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barWidth}
            height={Math.max(1, barH)}
            fill={fill}
            opacity={0.8}
            rx={1}
          >
            <title>{rssi} dBm</title>
          </rect>
        );
      })}

      {history.length === 0 && (
        <text x={width / 2} y={height / 2} textAnchor="middle" fill="#666" fontSize={11}>
          Pair a device to see RSSI data
        </text>
      )}
    </svg>
  );
}

/**
 * SVG bar chart for distance readings. Shows lock/unlock threshold lines
 * and colour-codes bars: green (&lt; unlock), yellow (between), red (&gt; lock).
 */
function DistanceChart({ history }: { history: (number | null)[] }) {
  const width = 600;
  const height = 120;
  const padding = { top: 10, bottom: 20, left: 35, right: 10 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  // Distance range: 0 to 6 m
  const minD = 0;
  const maxD = 6;
  const range = maxD - minD;

  const barWidth = Math.max(2, chartW / HISTORY_MAX - 1);

  // Invert Y so 0m is at bottom
  const yScale = (d: number) =>
    padding.top + chartH - ((d - minD) / range) * chartH;

  const lockY = yScale(DISTANCE_LOCK_M);
  const unlockY = yScale(DISTANCE_UNLOCK_M);

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${width} ${height}`}
      style={{ background: "rgba(0,0,0,0.3)", borderRadius: "0.35rem" }}
    >
      {/* Y-axis labels */}
      {[0, 1, 2, 3, 4, 5].map((v) => (
        <text
          key={v}
          x={padding.left - 4}
          y={yScale(v) + 3}
          textAnchor="end"
          fill="#666"
          fontSize={8}
        >
          {v}m
        </text>
      ))}

      {/* Lock threshold line */}
      <line
        x1={padding.left}
        x2={width - padding.right}
        y1={lockY}
        y2={lockY}
        stroke="#ef4444"
        strokeWidth={1}
        strokeDasharray="4 2"
        opacity={0.6}
      />
      <text x={width - padding.right - 2} y={lockY - 3} textAnchor="end" fill="#ef4444" fontSize={7}>
        Lock {DISTANCE_LOCK_M}m
      </text>

      {/* Unlock threshold line */}
      <line
        x1={padding.left}
        x2={width - padding.right}
        y1={unlockY}
        y2={unlockY}
        stroke="#22c55e"
        strokeWidth={1}
        strokeDasharray="4 2"
        opacity={0.6}
      />
      <text x={width - padding.right - 2} y={unlockY - 3} textAnchor="end" fill="#22c55e" fontSize={7}>
        Unlock {DISTANCE_UNLOCK_M}m
      </text>

      {/* Bars */}
      {history.map((d, i) => {
        if (d === null) return null;
        const clamped = Math.min(d, maxD);
        const x = padding.left + (i / HISTORY_MAX) * chartW;
        const y = yScale(clamped);
        const barH = chartH - (y - padding.top);
        const fill =
          d <= DISTANCE_UNLOCK_M
            ? "#22c55e"
            : d <= DISTANCE_LOCK_M
              ? "#eab308"
              : "#ef4444";
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barWidth}
            height={Math.max(1, barH)}
            fill={fill}
            opacity={0.8}
            rx={1}
          >
            <title>{d.toFixed(2)} m</title>
          </rect>
        );
      })}

      {history.length === 0 && (
        <text x={width / 2} y={height / 2} textAnchor="middle" fill="#666" fontSize={11}>
          Pair a device to see distance data
        </text>
      )}
    </svg>
  );
}
