import { useState } from "react";
import { AdminLayout } from "./components/layout/AdminLayout";
import type { AdminNavItem } from "./components/layout/AdminLayout";
import { AuthProvider } from "./auth/AuthProvider";
import { useAuth } from "./auth/useAuth";
import { TaxRollUploadPage } from "./pages/TaxRollUpload/TaxRollUploadPage";
import { PublicConsultationPage } from "./pages/PublicConsultation/PublicConsultationPage";
import { SettlementsPage } from "./pages/Settlements/SettlementsPage";
import { LoginPage } from "./pages/Login/LoginPage";
import { useIsPublicConsultationRoute } from "./routes";

const NAV_ITEMS: AdminNavItem[] = [
  { id: "tax-roll-upload", label: "Carga de Excel" },
  { id: "settlements", label: "Liquidaciones" },
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
      {activeId === "settlements" ? <SettlementsPage /> : <TaxRollUploadPage />}
    </AdminLayout>
  );
}

function AppRoutes() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <AdminPanel /> : <LoginPage />;
}

function App() {
  const isPublicConsultation = useIsPublicConsultationRoute();

  // The public consultation lives OUTSIDE AuthProvider and the login flow:
  // it neither depends on nor touches the Administrator's session.
  if (isPublicConsultation) {
    return <PublicConsultationPage />;
  }

  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

export default App;
