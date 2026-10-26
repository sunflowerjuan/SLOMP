const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export interface Target {
  baseUrl: string;
  apiUrl: string;
}

// The suite writes data (it creates the e2e-prueba municipality), so it only
// runs against this machine unless E2E_ALLOW_REMOTE=1 says otherwise. The host
// is compared exactly: "localhost.evil.com" is not local.
export function assertSafeTarget(target: Target, allowRemote: boolean): void {
  if (allowRemote) return;
  for (const [name, value] of Object.entries(target)) {
    let host: string;
    try {
      host = new URL(value).hostname;
    } catch {
      throw new Error(`${name} "${value}" no es una URL válida.`);
    }
    if (!LOCAL_HOSTS.has(host)) {
      throw new Error(
        `${name} "${value}" no es local. La suite se detuvo sin hacer ninguna petición. Si de verdad quieres correrla contra ese servidor (solo opera sobre el municipio e2e-prueba), define E2E_ALLOW_REMOTE=1.`,
      );
    }
  }
}
