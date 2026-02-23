import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{ padding: "2rem" }}>
      <h1>SentryOS</h1>
      <p style={{ marginTop: "0.5rem", color: "var(--color-muted)" }}>
        Zero-Trust Remote Workspace — Phase 1 Scaffold
      </p>

      <nav style={{ marginTop: "2rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <Link href="/dashboard">→ Dashboard</Link>
        <Link href="/test/bluetooth">→ Test: Bluetooth / Proximity Tether</Link>
        <Link href="/test/privacy">→ Test: Privacy Blur (WebSocket)</Link>
        <Link href="/test/chameleon">→ Test: Chameleon UI Theming</Link>
      </nav>
    </main>
  );
}
