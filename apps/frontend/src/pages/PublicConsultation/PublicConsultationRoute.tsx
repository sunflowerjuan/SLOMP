import { useEffect, useState } from "react";
import { getErrorMessage, isRetryable } from "../../api/ApiError";
import { getPublicMunicipality } from "../../api/publicConsultation";
import type { PublicMunicipality } from "../../api/publicConsultation";
import { PublicConsultationLoading } from "./PublicConsultationLoading";
import { PublicConsultationPage } from "./PublicConsultationPage";
import { PublicConsultationUnavailable } from "./PublicConsultationUnavailable";

type MunicipalityState =
  | { kind: "loading" }
  | { kind: "ready"; municipality: PublicMunicipality }
  | { kind: "unavailable" }
  | { kind: "failed"; message: string };

// Resolves the municipality of `#/consulta/:slug` before showing its page.
// Anything that is not a known municipality (no slug or an unknown one) is the
// same neutral "Consulta no disponible"; when the backend can't answer, the
// page says so and offers to try again.
export function PublicConsultationRoute({ slug }: { slug: string | null }) {
  const [state, setState] = useState<{
    slug: string | null;
    value: MunicipalityState;
  }>({ slug, value: slug ? { kind: "loading" } : { kind: "unavailable" } });
  const [attempt, setAttempt] = useState(0);

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
        setState({
          slug,
          value: isRetryable(error)
            ? {
                kind: "failed",
                message: getErrorMessage(error, { audience: "public" }),
              }
            : { kind: "unavailable" },
        });
      });
    return () => controller.abort();
  }, [slug, attempt]);

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
    return <PublicConsultationLoading />;
  }
  if (value.kind === "failed") {
    return (
      <PublicConsultationUnavailable
        failure={{
          message: value.message,
          onRetry: () => {
            setState({ slug, value: { kind: "loading" } });
            setAttempt((current) => current + 1);
          },
        }}
      />
    );
  }
  return <PublicConsultationUnavailable />;
}
