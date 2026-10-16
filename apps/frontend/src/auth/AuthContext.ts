import { createContext } from "react";

// Why the panel sent the Administrator back to the login screen.
export type SessionEndReason = "expired" | "inactivity";

export interface AuthContextValue {
  isAuthenticated: boolean;
  // Signed in with a password someone else chose: it must be replaced
  // before the panel opens.
  mustChangePassword: boolean;
  // true while the page checks whether a previous session can be restored.
  isRestoring: boolean;
  // Set when the session closed without the Administrator asking for it.
  sessionEndReason: SessionEndReason | null;
  signIn: (email: string, password: string) => Promise<void>;
  changePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<void>;
  signOut: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
