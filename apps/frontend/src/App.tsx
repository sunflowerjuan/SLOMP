import { useState } from "react";
import { AdminLayout } from "./components/layout/AdminLayout";
import type { AdminNavItem } from "./components/layout/AdminLayout";
import { AuthProvider } from "./auth/AuthProvider";
import { useAuth } from "./auth/useAuth";
import { CargaExcelPage } from "./pages/CargaExcel/CargaExcelPage";
import { LiquidacionesPage } from "./pages/Liquidaciones/LiquidacionesPage";
import { LoginPage } from "./pages/Login/LoginPage";

const NAV_ITEMS: AdminNavItem[] = [
  { id: "carga-excel", label: "Carga de Excel" },
  { id: "liquidaciones", label: "Liquidaciones" },
];

function AdminPanel() {
  const { signOut } = useAuth();
  const [activeId, setActiveId] = useState(NAV_ITEMS[0].id);

  return (
    <AdminLayout
      items={NAV_ITEMS}
      activeId={activeId}
      onNavigate={setActiveId}
      onSignOut={signOut}
    >
      {activeId === "liquidaciones" ? (
        <LiquidacionesPage />
      ) : (
        <CargaExcelPage />
      )}
    </AdminLayout>
  );
}

function AppRoutes() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <AdminPanel /> : <LoginPage />;
}

function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

export default App;
