import { request } from "./httpClient";
import type { SessionResponse } from "./tokenStorage";

export function login(email: string, password: string) {
  return request<SessionResponse>("/login", {
    method: "POST",
    body: { email, password },
    authenticated: false,
    withCredentials: true,
  });
}

// Revokes the session on the backend and clears the refresh cookie.
export function logout() {
  return request<null>("/auth/logout", {
    method: "POST",
    authenticated: false,
    withCredentials: true,
  });
}
