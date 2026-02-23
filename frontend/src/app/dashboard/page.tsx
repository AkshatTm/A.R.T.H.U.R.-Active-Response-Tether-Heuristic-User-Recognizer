/**
 * Dashboard — Main integrated view for SentryOS.
 *
 * Phase 1: skeleton layout wiring together all three subsystem hooks.
 * Phase 2: replace status badges with live visualisations (gaze heatmap,
 *          BLE signal strength, adaptive colour swatch).
 */

"use client";

import { useSecuritySocket } from "@/hooks/useSecuritySocket";
import { useProximityTether } from "@/hooks/useProximityTether";

const badge = (label: string, value: string, ok: boolean) => (
  <div
    style={{
      display: "inline-flex",
      flexDirection: "column",
      gap: "0.25rem",
      padding: "1rem 1.5rem",
      background: "var(--color-surface)",
      borderRadius: "0.5rem",
      border: `1px solid ${ok ? "var(--color-success)" : "var(--color-danger)"}`,
      minWidth: "160px",
    }}
  >
    <span style={{ fontSize: "0.75rem", color: "var(--color-muted)", textTransform: "uppercase" }}>
      {label}
    </span>
    <span style={{ fontWeight: 600 }}>{value}</span>
  </div>
);

export default function DashboardPage() {
  const { status: wsStatus, lastEvent } = useSecuritySocket();
  const { isLocked, statusMessage } = useProximityTether();

  return (
    <main style={{ padding: "2rem" }}>
      <header style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.75rem" }}>SentryOS Dashboard</h1>
        <p style={{ color: "var(--color-muted)", marginTop: "0.25rem" }}>
          Live security status overview
        </p>
      </header>

      {/* ── Status row ── */}
      <section style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "2rem" }}>
        {badge("WebSocket", wsStatus.toUpperCase(), wsStatus === "open")}
        {badge("Proximity", isLocked ? "LOCKED" : "TETHERED", !isLocked)}
        {badge("Vision AI", "OFFLINE (Phase 1)", false)}
        {badge("Chameleon", "INACTIVE (Phase 1)", false)}
      </section>

      {/* ── Last event ── */}
      <section
        style={{
          background: "var(--color-surface)",
          borderRadius: "0.5rem",
          padding: "1rem 1.5rem",
          maxWidth: "480px",
        }}
      >
        <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>Last Security Event</h2>
        <pre style={{ fontSize: "0.8rem", color: "var(--color-muted)", whiteSpace: "pre-wrap" }}>
          {lastEvent ? JSON.stringify(lastEvent, null, 2) : "No events yet."}
        </pre>
      </section>

      {/* ── Proximity detail ── */}
      <p style={{ marginTop: "1.5rem", fontSize: "0.85rem", color: "var(--color-muted)" }}>
        BLE: {statusMessage}
      </p>
    </main>
  );
}
