import { AdminPanel } from "./AdminPanel";
import { useAuth } from "./auth/useAuth";
import { LoginPage } from "./pages/Login/LoginPage";

export function AppRoutes() {
  const { isAuthenticated, isRestoring } = useAuth();
  // Nothing is drawn for the instant it takes to restore a session, so a
  // reload doesn't flash the login screen before the panel.
  if (isRestoring) {
    return null;
  }
  return isAuthenticated ? <AdminPanel /> : <LoginPage />;
}
