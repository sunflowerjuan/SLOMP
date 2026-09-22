import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { login } from "../api/auth";
import { setUnauthorizedHandler } from "../api/httpClient";
import { clearToken, getToken, setToken } from "../api/tokenStorage";
import { AuthContext } from "./AuthContext";
import type { AuthContextValue } from "./AuthContext";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => getToken() !== null,
  );
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    // El cliente HTTP ya borro el token; aqui solo se sincroniza la UI.
    setUnauthorizedHandler(() => {
      setIsAuthenticated(false);
      setSessionExpired(true);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { accessToken } = await login(email, password);
    setToken(accessToken);
    setSessionExpired(false);
    setIsAuthenticated(true);
  }, []);

  const signOut = useCallback(() => {
    clearToken();
    setSessionExpired(false);
    setIsAuthenticated(false);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ isAuthenticated, sessionExpired, signIn, signOut }),
    [isAuthenticated, sessionExpired, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
