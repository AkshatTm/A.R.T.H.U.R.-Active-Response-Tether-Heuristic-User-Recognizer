import type { Config } from "tailwindcss";

/**
 * SentryOS — Tailwind CSS v3 Configuration
 *
 * Design decisions:
 * - Chameleon variables (--theme-primary, --theme-glow, --theme-border) are wired
 *   to Tailwind color tokens so that Tailwind utilities pick up runtime JS changes.
 * - Three-tier typography system: Satoshi (display), Space Grotesk (body), IBM Plex Mono (data)
 */
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // ── CSS-variable-backed color tokens ────────────────────────────────────
      colors: {
        "theme-primary": "var(--theme-primary)",
        "theme-glow": "var(--theme-glow)",
        "theme-border": "var(--theme-border)",
        surface: "var(--color-surface)",
        "surface-raised": "var(--color-surface-raised)",
        "surface-overlay": "var(--color-surface-overlay)",
        "sentry-bg": "var(--color-bg)",
        accent: "var(--color-accent)",
        muted: "var(--color-muted)",
        danger: "var(--color-danger)",
        success: "var(--color-success)",
        warning: "var(--color-warning)",
        info: "var(--color-info)",
        border: "var(--color-border)",
        "border-subtle": "var(--color-border-subtle)",
      },

      // ── Three-Tier Typography Design System ──────────────────────────────────
      fontFamily: {
        display: ["Satoshi", "var(--font-space-grotesk)", "system-ui", "sans-serif"],
        sans: ["var(--font-space-grotesk)", "Space Grotesk", "system-ui", "-apple-system", "sans-serif"],
        mono: ["var(--font-ibm-plex-mono)", "IBM Plex Mono", "Consolas", "monospace"],
      },

      // ── Extended blur values ──────────────────────────────────────────────────
      backdropBlur: {
        xs: "2px",
        "4xl": "72px",
      },
      blur: {
        "4xl": "72px",
      },

      // ── Animation curves ──────────────────────────────────────────────────────
      transitionTimingFunction: {
        "premium-ease": "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
        "lock-snap": "cubic-bezier(0.55, 0, 1, 0.45)",
        "soft-land": "cubic-bezier(0.33, 1, 0.68, 1)",
      },

      // ── Box shadows ───────────────────────────────────────────────────────────
      boxShadow: {
        "glow-sm": "0 0 8px var(--theme-glow)",
        "glow-md": "0 0 20px var(--theme-glow)",
        "glow-lg": "0 0 40px var(--theme-glow)",
      },
    },
  },
  plugins: [],
};

export default config;
