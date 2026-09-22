const TOKEN_KEY = "slomp.accessToken";

// sessionStorage puede lanzar (modo privado, almacenamiento bloqueado); sin
// el, la sesion simplemente no sobrevive a una recarga.
export function getToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Ignorado: ver comentario arriba.
  }
}

export function clearToken(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Ignorado: ver comentario arriba.
  }
}
