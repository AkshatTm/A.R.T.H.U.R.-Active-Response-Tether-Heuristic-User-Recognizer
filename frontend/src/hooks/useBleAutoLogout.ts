/**
 * useBleAutoLogout — BLE Disconnect → Auto-Logout Watchdog
 *
 * Watches the bleConnected flag from the WebSocket feed. When the device
 * disconnects, starts an 8-second grace-period countdown. If the device
 * reconnects during that window the timer resets. If the countdown expires
 * the provided logout callback is invoked, clearing the session.
 *
 * Safety: The watchdog only activates after bleConnected has been true at
 * least once in this session. This prevents premature logout during the
 * initial WebSocket connection delay.
 *
 * Returns:
 *   isGracePeriod    — true while the countdown is running
 *   remainingSeconds — current countdown value (0 when not in grace period)
 */
"use client";

import { useEffect, useRef, useState } from "react";

const GRACE_SECONDS = 8;

export interface BleAutoLogoutResult {
  isGracePeriod: boolean;
  remainingSeconds: number;
}

export function useBleAutoLogout(
  bleConnected: boolean,
  logout: () => void
): BleAutoLogoutResult {
  // Has the device been connected at least once this session?
  const everConnectedRef = useRef(false);
  // Previous tick's connection state
  const prevConnectedRef = useRef<boolean>(bleConnected);

  const [isGracePeriod, setIsGracePeriod] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  // Track interval so we can cancel it
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Snapshot the remaining time in a ref so the interval closure can read it
  const remainingRef = useRef(0);

  const clearTimer = () => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsGracePeriod(false);
    setRemainingSeconds(0);
    remainingRef.current = 0;
  };

  const startTimer = () => {
    clearTimer(); // Ensure no duplicate timers
    remainingRef.current = GRACE_SECONDS;
    setRemainingSeconds(GRACE_SECONDS);
    setIsGracePeriod(true);

    intervalRef.current = setInterval(() => {
      remainingRef.current -= 1;
      setRemainingSeconds(remainingRef.current);

      if (remainingRef.current <= 0) {
        clearTimer();
        logout();
      }
    }, 1000);
  };

  useEffect(() => {
    // Mark the device as ever-connected once it comes online
    if (bleConnected) {
      everConnectedRef.current = true;
    }

    const prev = prevConnectedRef.current;
    prevConnectedRef.current = bleConnected;

    // Don't watch until we've seen at least one successful connection
    if (!everConnectedRef.current) return;

    if (prev === true && bleConnected === false) {
      // Disconnection event → start grace period
      startTimer();
    } else if (prev === false && bleConnected === true) {
      // Reconnection during grace period → cancel timer
      clearTimer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bleConnected]);

  // Clean up timer on unmount
  useEffect(() => () => clearTimer(), []);

  return { isGracePeriod, remainingSeconds };
}
