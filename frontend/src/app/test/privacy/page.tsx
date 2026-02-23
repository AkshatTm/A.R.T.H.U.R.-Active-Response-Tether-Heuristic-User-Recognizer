/**
 * Test Page: Privacy Blur (WebSocket)
 *
 * Phase 1: Renders a mock "sensitive content" panel and overlays a blur when
 *          the WebSocket reports a gaze-away / face-lost event.
 *          Even in Phase 1 the blur can be triggered by clicking the button,
 *          which sends a test message through the socket.
 * Phase 2: Blur fires automatically from VisionTracker events.
 */

"use client";

import { useState, useEffect } from "react";
import { useSecuritySocket } from "@/hooks/useSecuritySocket";

export default function PrivacyTestPage() {
  const { status, lastEvent, send } = useSecuritySocket();
  const [isBlurred, setIsBlurred] = useState(false);

  // In Phase 1 we manually toggle; Phase 2 replaces this with event-driven logic.
  useEffect(() => {
    if (lastEvent?.event === "gaze_away") setIsBlurred(true);
    if (lastEvent?.event === "gaze_return") setIsBlurred(false);
  }, [lastEvent]);

  return (
    <main style={{ padding: "2rem" }}>
      <h1>Test — Privacy Blur</h1>
      <p style={{ color: "var(--color-muted)", marginTop: "0.25rem" }}>
        WebSocket status: <strong>{status}</strong>
      </p>

      {/* Simulated sensitive content */}
      <section style={{ marginTop: "2rem", position: "relative", maxWidth: "480px" }}>
        <div
          style={{
            padding: "1.5rem",
            background: "var(--color-surface)",
            borderRadius: "0.5rem",
            filter: isBlurred ? "blur(8px)" : "none",
            transition: "filter 0.3s ease",
            userSelect: isBlurred ? "none" : "auto",
          }}
        >
          <h2 style={{ marginBottom: "0.75rem" }}>Confidential Document Preview</h2>
          <p>Project codename: SENTRY. Q2 budget allocation: $2.4M. Access tier: RESTRICTED.</p>
        </div>

        {isBlurred && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "0.5rem",
              background: "rgba(0,0,0,0.55)",
              color: "var(--color-danger)",
              fontWeight: 700,
              fontSize: "1.1rem",
            }}
          >
            PRIVACY LOCK ACTIVE
          </div>
        )}
      </section>

      {/* Manual test controls */}
      <div style={{ marginTop: "1.5rem", display: "flex", gap: "1rem" }}>
        <button
          onClick={() => setIsBlurred(true)}
          style={{ padding: "0.5rem 1rem", cursor: "pointer" }}
        >
          Simulate: gaze away
        </button>
        <button
          onClick={() => setIsBlurred(false)}
          style={{ padding: "0.5rem 1rem", cursor: "pointer" }}
        >
          Simulate: gaze return
        </button>
        <button
          onClick={() => send(JSON.stringify({ event: "ping" }))}
          style={{ padding: "0.5rem 1rem", cursor: "pointer" }}
        >
          Send ping over WS
        </button>
      </div>

      <pre
        style={{
          marginTop: "1.5rem",
          fontSize: "0.75rem",
          color: "var(--color-muted)",
          whiteSpace: "pre-wrap",
        }}
      >
        {lastEvent ? JSON.stringify(lastEvent, null, 2) : "No WS events yet."}
      </pre>
    </main>
  );
}
