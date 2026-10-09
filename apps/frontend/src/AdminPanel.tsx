import { AdminLayout } from "./components/layout/AdminLayout";
import type {
  AdminMenuItem,
  AdminNavItem,
} from "./components/layout/AdminLayout";
import { Icon } from "./components/ui/Icon";
import { useAuth } from "./auth/useAuth";
import { TaxRollUploadPage } from "./pages/TaxRollUpload/TaxRollUploadPage";
import { SettlementsPage } from "./pages/Settlements/SettlementsPage";
import { ADMIN_SECTION_HREF, useAdminSection } from "./routes";

const NAV_ITEMS: AdminNavItem[] = [
  {
    id: "cargas",
    label: "Carga de Excel",
    href: ADMIN_SECTION_HREF.cargas,
    icon: (
      <Icon box={24}>
        <path d="M12 16V4M8 8l4-4 4 4" />
        <path d="M4 20h16" />
      </Icon>
    ),
  },
  {
    id: "liquidaciones",
    label: "Liquidaciones",
    href: ADMIN_SECTION_HREF.liquidaciones,
    icon: (
      <Icon box={24}>
        <path d="M6 3h8l4 4v14H6z" />
        <path d="M14 3v4h4M9 13h6M9 17h6" />
      </Icon>
    ),
  },
];

function menuItems(signOut: () => void): AdminMenuItem[] {
  return [
    {
      id: "sign-out",
      label: "Cerrar sesión",
      icon: (
        <Icon box={24}>
          <path d="M9 4H5v16h4M16 8l4 4-4 4M20 12H9" />
        </Icon>
      ),
      onSelect: signOut,
    },
  ];
}

export function AdminPanel() {
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
