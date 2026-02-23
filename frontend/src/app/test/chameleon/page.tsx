/**
 * Test Page: Chameleon UI Theming
 *
 * Phase 1: Renders a palette of mock colour swatches so the adaptive-theme
 *          pipeline can be developed in isolation.  The "current" colour is
 *          toggled manually through a simple picker.
 * Phase 2: Replace mock swatches with the live hex value returned by the
 *          ColorExtractor WebSocket event and apply it as a CSS custom property.
 */

"use client";

import { useState } from "react";

const MOCK_PALETTE = [
  { label: "Night Mode",    hex: "#1a1a2e" },
  { label: "Deep Ocean",    hex: "#0a3d62" },
  { label: "Forest",        hex: "#1b4332" },
  { label: "Ember",         hex: "#7c2d12" },
  { label: "Arctic",        hex: "#e0f2fe" },
];

export default function ChameleonTestPage() {
  const [activeHex, setActiveHex] = useState(MOCK_PALETTE[0].hex);

  return (
    <main
      style={{
        padding: "2rem",
        // Apply active colour as a tinted background tint
        background: `color-mix(in srgb, ${activeHex} 30%, var(--color-bg))`,
        minHeight: "100vh",
        transition: "background 0.6s ease",
      }}
    >
      <h1>Test — Chameleon UI Theming</h1>
      <p style={{ color: "var(--color-muted)", marginTop: "0.25rem" }}>
        Mock ambient colour picker — Phase 1 manual control
      </p>

      {/* Swatch grid */}
      <section
        style={{
          marginTop: "2rem",
          display: "flex",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        {MOCK_PALETTE.map(({ label, hex }) => (
          <button
            key={hex}
            onClick={() => setActiveHex(hex)}
            style={{
              cursor: "pointer",
              border: activeHex === hex ? "3px solid white" : "3px solid transparent",
              borderRadius: "0.5rem",
              padding: 0,
              overflow: "hidden",
              width: 100,
              textAlign: "center",
            }}
          >
            <div style={{ height: 60, background: hex }} />
            <div
              style={{
                padding: "0.4rem",
                background: "var(--color-surface)",
                fontSize: "0.7rem",
              }}
            >
              {label}
              <br />
              <span style={{ color: "var(--color-muted)" }}>{hex}</span>
            </div>
          </button>
        ))}
      </section>

      <p style={{ marginTop: "2rem", fontSize: "0.85rem" }}>
        Active ambient colour:{" "}
        <code
          style={{
            background: activeHex,
            color: "#fff",
            padding: "0.15rem 0.5rem",
            borderRadius: "0.25rem",
          }}
        >
          {activeHex}
        </code>
      </p>

      <p style={{ marginTop: "1.5rem", fontSize: "0.8rem", color: "var(--color-muted)" }}>
        Phase 2: ColorExtractor will push live hex values over WebSocket; this
        component will subscribe and animate transitions automatically.
      </p>
    </main>
  );
}
