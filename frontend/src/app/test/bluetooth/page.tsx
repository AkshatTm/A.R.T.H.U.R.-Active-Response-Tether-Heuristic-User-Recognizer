/**
 * Test Page: Bluetooth / Proximity Tether
 *
 * Phase 1: Exercises useProximityTether in isolation so the BLE integration
 *          can be developed and verified independently of the rest of the UI.
 * Phase 2: Add a "Pair Device" button that calls navigator.bluetooth.requestDevice().
 */

"use client";

import { useProximityTether } from "@/hooks/useProximityTether";

export default function BluetoothTestPage() {
  const { isLocked, isReady, statusMessage } = useProximityTether();

  return (
    <main style={{ padding: "2rem" }}>
      <h1>Test — Bluetooth / Proximity Tether</h1>
      <p style={{ color: "var(--color-muted)", marginTop: "0.25rem" }}>
        Isolated test harness for <code>useProximityTether</code>
      </p>

      <section
        style={{
          marginTop: "2rem",
          padding: "1.5rem",
          background: "var(--color-surface)",
          borderRadius: "0.5rem",
          maxWidth: "420px",
        }}
      >
        <dl style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div>
            <dt style={{ fontSize: "0.75rem", color: "var(--color-muted)" }}>READY</dt>
            <dd>{isReady ? "Yes" : "Initialising…"}</dd>
          </div>
          <div>
            <dt style={{ fontSize: "0.75rem", color: "var(--color-muted)" }}>LOCKED</dt>
            <dd style={{ color: isLocked ? "var(--color-danger)" : "var(--color-success)" }}>
              {isLocked ? "YES — workstation should blur/lock" : "NO — tethered"}
            </dd>
          </div>
          <div>
            <dt style={{ fontSize: "0.75rem", color: "var(--color-muted)" }}>STATUS</dt>
            <dd>{statusMessage}</dd>
          </div>
        </dl>
      </section>

      <p style={{ marginTop: "2rem", fontSize: "0.8rem", color: "var(--color-muted)" }}>
        Phase 2: Wire Web Bluetooth API here.
      </p>
    </main>
  );
}
