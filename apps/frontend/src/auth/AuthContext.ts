import { createContext } from "react";

export interface AuthContextValue {
  isAuthenticated: boolean;
  // true when the session closed because the backend rejected the token.
  sessionExpired: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
