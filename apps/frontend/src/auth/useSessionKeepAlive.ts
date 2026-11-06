import { useEffect } from "react";
import { refreshSession } from "../api/httpClient";
import { getLastActivity, getSession, markActivity } from "../api/tokenStorage";
import type { SessionEndReason } from "./AuthContext";

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"];
// Activity is written to shared storage at most this often.
const ACTIVITY_THROTTLE_MS = 5_000;
const CHECK_INTERVAL_MS = 15_000;
// Renew this long before the access token expires.
const RENEW_MARGIN_MS = 60_000;

// While the panel is open: closes the session after the idle limit or at its
// absolute end, and renews the access token shortly before it expires as long
// as the Administrator has been using the panel. An idle session is not
// renewed, so the backend lets it lapse on its own too.
export function useSessionKeepAlive(
  active: boolean,
  onSessionEnd: (reason: SessionEndReason) => void,
) {
  useEffect(() => {
    if (!active) {
      return;
    }

    let lastMarked = 0;
    const handleActivity = () => {
      const now = Date.now();
      if (now - lastMarked >= ACTIVITY_THROTTLE_MS) {
        lastMarked = now;
        markActivity();
      }
    };

    const check = () => {
      const session = getSession();
      if (!session) {
        return;
      }
      const now = Date.now();
      const lastActivity = getLastActivity();
      if (now - lastActivity >= session.idleTimeoutMs) {
        onSessionEnd("inactivity");
        return;
      }
      if (now >= session.sessionExpiresAt) {
        onSessionEnd("expired");
        return;
      }
      if (
        now >= session.accessTokenExpiresAt - RENEW_MARGIN_MS &&
        lastActivity > session.refreshedAt
      ) {
        // A failure here is not final: the next request retries, and closes
        // the session if it really ended.
        refreshSession().catch(() => undefined);
      }
    };

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, handleActivity, { passive: true });
    }
    // Timers are throttled in background tabs, so check again on return.
    document.addEventListener("visibilitychange", check);
    const interval = window.setInterval(check, CHECK_INTERVAL_MS);

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, handleActivity);
      }
      document.removeEventListener("visibilitychange", check);
      window.clearInterval(interval);
    };
  }, [active, onSessionEnd]);
}
