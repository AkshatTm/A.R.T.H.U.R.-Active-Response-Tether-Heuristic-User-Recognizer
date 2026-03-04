/**
 * useAuthGuard — Ephemeral Session Authentication Guard
 *
 * Session keys:
 *   sentry_auth       — set on successful password login
 *   sentry_ble_paired — set after BLE device is confirmed on /setup
 *
 * Guards:
 *   useSetupGuard()   — requires only auth (used by /setup page)
 *   useAuthGuard()    — requires both auth + BLE pairing (used by /dashboard)
 *
 * logout() clears both keys and redirects to /.
 */
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export const AUTH_SESSION_KEY = "sentry_auth" as const;
export const BLE_SESSION_KEY = "sentry_ble_paired" as const;

/**
 * Clears both session keys and redirects to the login page.
 * Accepts a router instance so it can be called from any component.
 */
export function logout(router: ReturnType<typeof useRouter>): void {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(AUTH_SESSION_KEY);
    sessionStorage.removeItem(BLE_SESSION_KEY);
  }
  router.replace("/");
}

/**
 * Guard for the /setup page — only requires the auth key.
 * Redirects to / if the user hasn't logged in yet.
 */
export function useSetupGuard(): void {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isAuthenticated = sessionStorage.getItem(AUTH_SESSION_KEY) === "1";
    if (!isAuthenticated) {
      router.replace("/");
    }
  }, [router]);
}

/**
 * Guard for the /dashboard page — requires both auth and BLE pairing.
 * Redirects to / if auth is missing, or to /setup if only BLE is missing.
 */
export function useAuthGuard(): void {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const isAuthenticated = sessionStorage.getItem(AUTH_SESSION_KEY) === "1";
    const isBLEPaired = sessionStorage.getItem(BLE_SESSION_KEY) === "1";

    if (!isAuthenticated) {
      router.replace("/");
      return;
    }
    if (!isBLEPaired) {
      router.replace("/setup");
    }
  }, [router]);
}
