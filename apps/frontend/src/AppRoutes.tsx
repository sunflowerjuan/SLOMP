import { AdminPanel } from "./AdminPanel";
import { useAuth } from "./auth/useAuth";
import { LoginPage } from "./pages/Login/LoginPage";

export function AppRoutes() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <AdminPanel /> : <LoginPage />;
}
