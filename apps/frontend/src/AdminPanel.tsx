import { Fragment, useEffect, useState } from "react";
import {
  readLastMunicipalitySlug,
  rememberMunicipality,
} from "./api/lastMunicipality";
import type { Municipality } from "./api/municipalities";
import { AdminLayout } from "./components/layout/AdminLayout";
import type {
  AdminMenuItem,
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
import { EmbedPage } from "./pages/ConsultaPublica/EmbedPage";
import { AddMunicipalityDialog } from "./pages/Municipalities/AddMunicipalityDialog";
import { MunicipalityState } from "./pages/Municipalities/MunicipalityState";
import { SettlementsPage } from "./pages/Settlements/SettlementsPage";
import { TaxRollUploadPage } from "./pages/TaxRollUpload/TaxRollUploadPage";
import { TemplatesPage } from "./pages/Templates/TemplatesPage";
import { adminHref, useAdminRoute } from "./routes";
import type { AdminSection } from "./routes";

const NAV_ITEMS: (Omit<AdminNavItem, "href"> & { id: AdminSection })[] = [
  {
    id: "cargas",
    label: "Carga de Excel",
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
    icon: (
      <Icon box={24}>
        <path d="M6 3h8l4 4v14H6z" />
        <path d="M14 3v4h4M9 13h6M9 17h6" />
      </Icon>
    ),
  },
  {
    id: "plantillas",
    label: "Plantillas",
    icon: (
      <Icon box={24}>
        <path d="M6 3h8l4 4v14H6z" />
        <path d="M14 3v4h4M10.5 11.5L9 13l1.5 1.5M13.5 11.5L15 13l-1.5 1.5" />
      </Icon>
    ),
  },
  {
    id: "consulta-publica",
    label: "Consulta pública",
    icon: (
      <Icon box={24}>
        <path d="M8 8l-4 4 4 4M16 8l4 4-4 4M14 5l-4 14" />
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

function sectionPage(section: AdminSection, municipality: Municipality) {
  switch (section) {
    case "liquidaciones":
      return <SettlementsPage />;
    case "plantillas":
      return <TemplatesPage />;
    case "consulta-publica":
      return <EmbedPage slug={municipality.slug} />;
    default:
      return <TaxRollUploadPage />;
  }
}

// The panel works in the municipality of its URL (#/paez/cargas). Switching
// municipality only changes the URL; the screens are keyed by the slug, so
// nothing of the previous municipality survives (SL-122, section 7).
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
  // replace() keeps the address without slug out of the history.
  const redirectTo =
    state.status === "ready" && !route.slug && fallback
      ? adminHref(fallback.slug, route.section)
      : null;
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
            window.location.hash = adminHref(slug, route.section);
          },
          onAdd: () => setIsAddOpen(true),
        }
      : undefined;

  const navItems: AdminNavItem[] = active
    ? NAV_ITEMS.map((item) => ({
        ...item,
        href: adminHref(active.slug, item.id),
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
      <Fragment key={active.slug}>
        {sectionPage(route.section, active)}
      </Fragment>
    );
  } else if (missingSlug && checkedSlug === missingSlug) {
    content = (
      <MunicipalityState
        kind="not-found"
        slug={missingSlug}
        fallback={
          fallback && {
            label: municipalityLabel(fallback),
            href: adminHref(fallback.slug, route.section),
          }
        }
      />
    );
  }

  return (
    <>
      <AdminLayout
        items={navItems}
        activeId={route.section}
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
