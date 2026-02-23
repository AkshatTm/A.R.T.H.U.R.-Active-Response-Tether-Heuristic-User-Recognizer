/**
 * useSecuritySocket
 * -----------------
 * Boilerplate hook that opens a WebSocket connection to the SentryOS backend.
 *
 * Phase 1: connects, reads incoming JSON messages, and surfaces them through
 *          a simple state object.
 * Phase 2: will dispatch parsed security events (gaze-away, face-lost, etc.)
 *          to trigger privacy blur, lock-screen, or audit-log actions.
 */

"use client";

import { useEffect, useRef, useState, useCallback } from "react";

// ── Types ──────────────────────────────────────────────────────────────────

export type SocketStatus = "idle" | "connecting" | "open" | "closed" | "error";

export interface SecurityEvent {
  event: string;
  payload?: unknown;
  message?: string;
}

export interface UseSecuritySocketReturn {
  status: SocketStatus;
  lastEvent: SecurityEvent | null;
  send: (data: string) => void;
}

// ── Constants ──────────────────────────────────────────────────────────────

const WS_URL = "ws://localhost:8000/ws";
const RECONNECT_DELAY_MS = 3_000;

// ── Hook ───────────────────────────────────────────────────────────────────

export function useSecuritySocket(): UseSecuritySocketReturn {
  const [status, setStatus] = useState<SocketStatus>("idle");
  const [lastEvent, setLastEvent] = useState<SecurityEvent | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    // Prevent duplicate connections
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus("connecting");
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("open");
      console.log("[useSecuritySocket] Connected to", WS_URL);
    };

    ws.onmessage = (event) => {
      try {
        const parsed: SecurityEvent = JSON.parse(event.data as string);
        setLastEvent(parsed);
      } catch {
        console.warn("[useSecuritySocket] Non-JSON message received:", event.data);
      }
    };

    ws.onerror = (err) => {
      console.error("[useSecuritySocket] WebSocket error:", err);
      setStatus("error");
    };

    ws.onclose = () => {
      setStatus("closed");
      console.log("[useSecuritySocket] Connection closed. Reconnecting in", RECONNECT_DELAY_MS, "ms…");
      reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
    };
  }, []);

  // Open connection on mount; clean up on unmount
  useEffect(() => {
    connect();
    return () => {
      reconnectTimerRef.current && clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
    } else {
      console.warn("[useSecuritySocket] Cannot send — socket not open.");
    }
  }, []);

  return { status, lastEvent, send };
}
