import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { flushSync } from "react-dom";
import {
  changePassword as requestPasswordChange,
  login,
  logout,
} from "../api/auth";
import { refreshSession, setUnauthorizedHandler } from "../api/httpClient";
import {
  clearActivity,
  clearToken,
  getLastActivity,
  hasSessionHint,
  markActivity,
  markPasswordChanged,
  setSession,
} from "../api/tokenStorage";
import { AuthContext } from "./AuthContext";
import type { AuthContextValue, SessionEndReason } from "./AuthContext";
import { useSessionKeepAlive } from "./useSessionKeepAlive";

type Status = "restoring" | "authenticated" | "anonymous";

export function AuthProvider({ children }: { children: ReactNode }) {
  // The access token doesn't survive a reload; when this browser had a
  // session, the refresh cookie is asked for a new one before deciding which
  // screen to show.
  const [status, setStatus] = useState<Status>(() =>
    hasSessionHint() ? "restoring" : "anonymous",
  );
  const [sessionEndReason, setSessionEndReason] =
    useState<SessionEndReason | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  const endSession = useCallback((reason: SessionEndReason | null) => {
    // The screen changes right away; if the backend can't be reached, the
    // session it keeps still ends by itself at the idle limit.
    logout().catch(() => undefined);
    clearToken();
    clearActivity();
    setSessionEndReason(reason);
    setMustChangePassword(false);
    setStatus("anonymous");
  }, []);

  useEffect(() => {
    if (!hasSessionHint()) {
      return;
    }
    let cancelled = false;
    refreshSession()
      .then((session) => {
        if (cancelled) return;
        if (!session) {
          clearActivity();
          setStatus("anonymous");
        } else if (Date.now() - getLastActivity() >= session.idleTimeoutMs) {
          // The cookie was still good, but the panel sat unused past the
          // idle limit before this page was opened.
          endSession("inactivity");
        } else {
          setMustChangePassword(session.mustChangePassword);
          setStatus("authenticated");
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("anonymous");
      });
    return () => {
      cancelled = true;
    };
  }, [endSession]);

  useEffect(() => {
    // The HTTP client already cleared the token; this just syncs the UI.
    setUnauthorizedHandler(() => {
      clearActivity();
      setSessionEndReason("expired");
      setStatus("anonymous");
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const session = setSession(await login(email, password));
    markActivity();
    const enterPanel = () => {
      setSessionEndReason(null);
      setMustChangePassword(session.mustChangePassword);
      setStatus("authenticated");
    };
    // Cross-fade login -> panel instead of swapping the screens in one frame.
    if (document.startViewTransition) {
      document.startViewTransition(() => flushSync(enterPanel));
    } else {
      enterPanel();
    }
  }, []);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      await requestPasswordChange(currentPassword, newPassword);
      markPasswordChanged();
      markActivity();
      const enterPanel = () => setMustChangePassword(false);
      if (document.startViewTransition) {
        document.startViewTransition(() => flushSync(enterPanel));
      } else {
        enterPanel();
      }
    },
    [],
  );

  const signOut = useCallback(() => endSession(null), [endSession]);

  useSessionKeepAlive(status === "authenticated", endSession);

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated: status === "authenticated",
      mustChangePassword,
      isRestoring: status === "restoring",
      sessionEndReason,
      signIn,
      changePassword,
      signOut,
    }),
    [
      status,
      mustChangePassword,
      sessionEndReason,
      signIn,
      changePassword,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
