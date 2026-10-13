import { useEffect, useState } from "react";
import { getPublicMunicipality } from "../../api/publicConsultation";
import type { PublicMunicipality } from "../../api/publicConsultation";
import { PublicConsultationPage } from "./PublicConsultationPage";
import { PublicConsultationUnavailable } from "./PublicConsultationUnavailable";

type MunicipalityState =
  | { kind: "loading" }
  | { kind: "ready"; municipality: PublicMunicipality }
  | { kind: "unavailable" };

// Resolves the municipality of `#/consulta/:slug` before showing its page.
// Anything that is not a known municipality (no slug, an unknown one, or the
// backend failing) is the same neutral "Consulta no disponible".
export function PublicConsultationRoute({ slug }: { slug: string | null }) {
  const [state, setState] = useState<{
    slug: string | null;
    value: MunicipalityState;
  }>({ slug, value: slug ? { kind: "loading" } : { kind: "unavailable" } });

  // A different slug (the hash changed) starts over; the setState during
  // render is the documented way to reset state when a prop changes.
  if (state.slug !== slug) {
    setState({
      slug,
      value: slug ? { kind: "loading" } : { kind: "unavailable" },
    });
  }

  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();
    getPublicMunicipality(slug, controller.signal)
      .then((municipality) =>
        setState({ slug, value: { kind: "ready", municipality } }),
      )
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setState({ slug, value: { kind: "unavailable" } });
      });
    return () => controller.abort();
  }, [slug]);

  const { value } = state;
  if (value.kind === "ready" && slug) {
    return (
      <PublicConsultationPage
        key={slug}
        slug={slug}
        municipalityName={value.municipality.name}
      />
    );
  }
  if (value.kind === "loading") {
    return <div className="public-consultation" aria-busy="true" />;
  }
  return <PublicConsultationUnavailable />;
}
