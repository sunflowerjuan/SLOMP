import { AdminPanel } from "./AdminPanel";
import { useAuth } from "./auth/useAuth";
import { ChangePasswordPage } from "./pages/ChangePassword/ChangePasswordPage";
import { LoginPage } from "./pages/Login/LoginPage";

export function AppRoutes() {
  const { isAuthenticated, isRestoring, mustChangePassword } = useAuth();
  // Nothing is drawn for the instant it takes to restore a session, so a
  // reload doesn't flash the login screen before the panel.
  if (isRestoring) {
    return null;
  }
  if (!isAuthenticated) {
    return <LoginPage />;
  }
  // The backend refuses everything else until the password is replaced.
  return mustChangePassword ? <ChangePasswordPage /> : <AdminPanel />;
}
