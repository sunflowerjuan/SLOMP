import type { ReactNode } from "react";
import { AdminLayout } from "./components/layout/AdminLayout";
import type {
  AdminMenuItem,
  AdminNavItem,
} from "./components/layout/AdminLayout";
import { AuthProvider } from "./auth/AuthProvider";
import { useAuth } from "./auth/useAuth";
import { TaxRollUploadPage } from "./pages/TaxRollUpload/TaxRollUploadPage";
import { PublicConsultationPage } from "./pages/PublicConsultation/PublicConsultationPage";
import { SettlementsPage } from "./pages/Settlements/SettlementsPage";
import { LoginPage } from "./pages/Login/LoginPage";
import {
  ADMIN_SECTION_HREF,
  useAdminSection,
  useIsPublicConsultationRoute,
} from "./routes";

function NavIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const NAV_ITEMS: AdminNavItem[] = [
  {
    id: "cargas",
    label: "Carga de Excel",
    href: ADMIN_SECTION_HREF.cargas,
    icon: (
      <NavIcon>
        <path d="M12 16V4M8 8l4-4 4 4" />
        <path d="M4 20h16" />
      </NavIcon>
    ),
  },
  {
    id: "liquidaciones",
    label: "Liquidaciones",
    href: ADMIN_SECTION_HREF.liquidaciones,
    icon: (
      <NavIcon>
        <path d="M6 3h8l4 4v14H6z" />
        <path d="M14 3v4h4M9 13h6M9 17h6" />
      </NavIcon>
    ),
  },
];

function menuItems(signOut: () => void): AdminMenuItem[] {
  return [
    {
      id: "sign-out",
      label: "Cerrar sesión",
      icon: (
        <NavIcon>
          <path d="M9 4H5v16h4M16 8l4 4-4 4M20 12H9" />
        </NavIcon>
      ),
      onSelect: signOut,
    },
  ];
}

function AdminPanel() {
  const { signOut } = useAuth();
  const section = useAdminSection();

  return (
    <AdminLayout
      items={NAV_ITEMS}
      activeId={section}
      menuItems={menuItems(signOut)}
    >
      {section === "liquidaciones" ? (
        <SettlementsPage />
      ) : (
        <TaxRollUploadPage />
      )}
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
