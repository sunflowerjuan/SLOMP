import { Fragment, useEffect, useState } from "react";
import {
  readLastMunicipalitySlug,
  rememberMunicipality,
} from "./api/lastMunicipality";
import type { Municipality } from "./api/municipalities";
import { AdminLayout } from "./components/layout/AdminLayout";
import type {
  AdminMenuItem,
  AdminNavGroup,
  AdminNavItem,
} from "./components/layout/AdminLayout";
import type { MunicipalitySwitch } from "./components/layout/MunicipalityOptions";
import { Icon } from "./components/ui/Icon";
import { useAuth } from "./auth/useAuth";
import {
  municipalityLabel,
  pickInitialMunicipality,
} from "./domain/municipality";
import { useMunicipalities } from "./hooks/useMunicipalities";
import { AddMunicipalityDialog } from "./pages/Municipalities/AddMunicipalityDialog";
import { MunicipalityState } from "./pages/Municipalities/MunicipalityState";
import { PaymentOrdersPage } from "./pages/PaymentOrders/PaymentOrdersPage";
import { SettingsPage } from "./pages/Settings/SettingsPage";
import { TemplatesPage } from "./pages/Templates/TemplatesPage";
import { SettlementsPage } from "./pages/Settlements/SettlementsPage";
import { TaxRollUploadPage } from "./pages/TaxRollUpload/TaxRollUploadPage";
import {
  adminHref,
  adminSectionOf,
  templatesSegmentOf,
  useAdminRoute,
} from "./routes";
import type { AdminSection, AdminView } from "./routes";

type NavEntry = Omit<AdminNavItem, "href"> & {
  id: AdminSection;
  // Where the entry leads: Configuración opens its first tab.
  view: AdminView;
};

const OPERATION_ITEMS: NavEntry[] = [
  {
    id: "cargas",
    view: "cargas",
    label: "Cartera",
    icon: (
      <Icon box={24}>
        <path d="M12 16V4M8 8l4-4 4 4" />
        <path d="M4 20h16" />
      </Icon>
    ),
  },
  {
    id: "liquidaciones",
    view: "liquidaciones",
    label: "Liquidaciones",
    icon: (
      <Icon box={24}>
        <path d="M6 3h8l4 4v14H6z" />
        <path d="M14 3v4h4M9 13h6M9 17h6" />
      </Icon>
    ),
  },
  {
    id: "mandamientos",
    view: "mandamientos",
    label: "Mandamientos",
    icon: (
      <Icon box={24}>
        <path d="M6 3h8l4 4v14H6z" />
        <path d="M14 3v4h4M9 12h6M9 16h3" />
        <path d="M14.5 15.5l1.5 1.5 3-3" />
      </Icon>
    ),
  },
];

const SETTINGS_ITEMS: NavEntry[] = [
  {
    id: "configuracion",
    view: "configuracion",
    label: "Configuración",
    icon: (
      <Icon box={24}>
        <path d="M10.2 4.8L10.7 2.5L13.3 2.5L13.8 4.8L15.8 5.7L17.8 4.3L19.7 6.2L18.3 8.2L19.2 10.2L21.5 10.7L21.5 13.3L19.2 13.8L18.3 15.8L19.7 17.8L17.8 19.7L15.8 18.3L13.8 19.2L13.3 21.5L10.7 21.5L10.2 19.2L8.2 18.3L6.2 19.7L4.3 17.8L5.7 15.8L4.8 13.8L2.5 13.3L2.5 10.7L4.8 10.2L5.7 8.2L4.3 6.2L6.2 4.3L8.2 5.7z" />
        <circle cx="12" cy="12" r="3" />
      </Icon>
    ),
  },
];

// Daily work first, then setup (SL-170). The titles are not links.
const NAV_GROUPS: (Omit<AdminNavGroup, "items"> & { items: NavEntry[] })[] = [
  { id: "operation", label: "Operación", items: OPERATION_ITEMS },
  {
    id: "settings",
    label: "Configuración",
    items: SETTINGS_ITEMS,
    iconsOnPhone: true,
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

function viewPage(view: AdminView, municipality: Municipality) {
  if (view === "configuracion") {
    return <SettingsPage slug={municipality.slug} />;
  }
  // Both documents are one screen too: switching keeps the chosen file.
  const segment = templatesSegmentOf(view);
  if (segment) {
    return <TemplatesPage slug={municipality.slug} segment={segment} />;
  }
  switch (view) {
    case "liquidaciones":
      return <SettlementsPage />;
    case "mandamientos":
      return <PaymentOrdersPage />;
    default:
      return <TaxRollUploadPage />;
  }
}

// The panel works in the municipality of its URL (#/municipio-a/cargas).
// Switching municipality only changes the URL; the screens are keyed by the
// slug, so nothing of the previous municipality survives (SL-122, section 7).
export function AdminPanel() {
  const { signOut } = useAuth();
  const route = useAdminRoute();
  const { state, retry, refresh, add } = useMunicipalities();
  const [isAddOpen, setIsAddOpen] = useState(false);
  // Slug already looked up again after not being found in the list (it may
  // have been created in another tab a moment ago).
  const [checkedSlug, setCheckedSlug] = useState<string | null>(null);

  const municipalities = state.status === "ready" ? state.municipalities : [];
  const active = route.slug
    ? (municipalities.find((m) => m.slug === route.slug) ?? null)
    : null;
  const fallback =
    state.status === "ready"
      ? pickInitialMunicipality(municipalities, readLastMunicipalitySlug())
      : null;

  // No municipality in the address: open the last one used, or the first.
  // An old address of a view (#/municipio-a/plantillas) moves to the view's
  // own.
  // replace() keeps the address replaced out of the history.
  let redirectTo: string | null = null;
  if (!route.slug) {
    if (state.status === "ready" && fallback) {
      redirectTo = adminHref(fallback.slug, route.view);
    }
  } else if (route.isAlias) {
    redirectTo = adminHref(route.slug, route.view);
  }
  useEffect(() => {
    if (redirectTo) window.location.replace(redirectTo);
  }, [redirectTo]);

  useEffect(() => {
    if (active) rememberMunicipality(active.slug);
  }, [active]);

  const missingSlug =
    state.status === "ready" && route.slug && !active ? route.slug : null;
  useEffect(() => {
    if (!missingSlug || checkedSlug === missingSlug) return;
    let cancelled = false;
    void refresh().then(() => {
      if (!cancelled) setCheckedSlug(missingSlug);
    });
    return () => {
      cancelled = true;
    };
  }, [missingSlug, checkedSlug, refresh]);

  const switcher: MunicipalitySwitch | undefined =
    state.status === "ready"
      ? {
          options: municipalities.map((municipality) => ({
            slug: municipality.slug,
            label: municipalityLabel(municipality),
          })),
          activeSlug: active?.slug ?? null,
          activeLabel: active ? municipalityLabel(active) : null,
          onSelect: (slug) => {
            window.location.hash = adminHref(slug, route.view);
          },
          onAdd: () => setIsAddOpen(true),
        }
      : undefined;

  const navGroups: AdminNavGroup[] = active
    ? NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.map(({ view, ...item }) => ({
          ...item,
          href: adminHref(active.slug, view),
        })),
      }))
    : [];

  let content = null;
  if (state.status === "error") {
    content = (
      <MunicipalityState kind="error" message={state.message} onRetry={retry} />
    );
  } else if (state.status === "ready" && municipalities.length === 0) {
    content = (
      <MunicipalityState kind="empty" onAdd={() => setIsAddOpen(true)} />
    );
  } else if (active) {
    content = (
      <Fragment key={active.slug}>{viewPage(route.view, active)}</Fragment>
    );
  } else if (missingSlug && checkedSlug === missingSlug) {
    content = (
      <MunicipalityState
        kind="not-found"
        slug={missingSlug}
        fallback={
          fallback && {
            label: municipalityLabel(fallback),
            href: adminHref(fallback.slug, route.view),
          }
        }
      />
    );
  }

  return (
    <>
      <AdminLayout
        groups={navGroups}
        activeId={adminSectionOf(route.view)}
        menuItems={menuItems(signOut)}
        switcher={switcher}
      >
        {content}
      </AdminLayout>
      <AddMunicipalityDialog
        open={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onCreated={(municipality) => {
          add(municipality);
          setIsAddOpen(false);
          window.location.hash = adminHref(municipality.slug);
        }}
      />
    </>
  );
}
