import { request } from "./httpClient";

interface LoginResponse {
  accessToken: string;
}

export function login(email: string, password: string) {
  return request<LoginResponse>("/login", {
    method: "POST",
    body: { email, password },
    authenticated: false,
  });
}
