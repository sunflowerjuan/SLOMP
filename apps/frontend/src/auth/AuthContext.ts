import { createContext } from "react";

export interface AuthContextValue {
  isAuthenticated: boolean;
  // true cuando la sesion se cerro porque el backend rechazo el token.
  sessionExpired: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
