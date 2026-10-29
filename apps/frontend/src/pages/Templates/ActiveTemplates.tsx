import { useEffect, useState } from "react";
import { getErrorMessage } from "../../api/ApiError";
import { readStoredDraft } from "../../api/templateDraftStorage";
import { getMarkerCatalog, listTemplates } from "../../api/templates";
import type {
  MarkerCatalogEntry,
  TemplateDocumentType,
  TemplateVersion,
} from "../../api/templates";
import { Button, ButtonLink } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Icon } from "../../components/ui/Icon";
import { Notice } from "../../components/ui/Notice";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { fieldLabels } from "../../domain/templateMarking";
import { adminHref, templatesView } from "../../routes";
import {
  DATE_TIME_FORMATTER,
  DOCUMENT_TEXT,
  TYPE_SEGMENT,
} from "./documentText";
import "./TemplatesPage.css";

const DOCUMENT_TYPES: TemplateDocumentType[] = ["LIQUIDACION", "MANDAMIENTO"];

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; active: TemplateVersion | null };

// In Configuración, only which version of each document is in use, or that
// there is none. The history, activating an earlier version and
// uploading a new one are on each document's templates screen.
export function ActiveTemplates({ slug }: { slug: string }) {
  // A template left half marked in this browser, to come back to.
  const [draft] = useState(() => readStoredDraft());

  return (
    <div className="templates-summary">
      {draft && (
        <Notice variant="info" className="templates-summary__draft">
          <span>
            Tienes una plantilla de {DOCUMENT_TEXT[draft.documentType].name} a
            medio marcar ({draft.fileName}).
          </span>
          <a
            className="templates-page__link"
            href={adminHref(
              slug,
              templatesView(TYPE_SEGMENT[draft.documentType]),
            )}
          >
            Seguir marcando
          </a>
        </Notice>
      )}
      <div className="templates-page__layout templates-page__layout--even">
        {DOCUMENT_TYPES.map((documentType) => (
          <ActiveTemplateCard
            key={documentType}
            slug={slug}
            documentType={documentType}
          />
        ))}
      </div>
    </div>
  );
}

function ActiveTemplateCard({
  slug,
  documentType,
}: {
  slug: string;
  documentType: TemplateDocumentType;
}) {
  const text = DOCUMENT_TEXT[documentType];
  const [state, setState] = useState<State>({ status: "loading" });
  const [catalog, setCatalog] = useState<MarkerCatalogEntry[]>([]);
  const href = adminHref(slug, templatesView(TYPE_SEGMENT[documentType]));

  function readyState(versions: TemplateVersion[]): State {
    return {
      status: "ready",
      active: versions.find((version) => version.isActive) ?? null,
    };
  }

  async function retry() {
    setState({ status: "loading" });
    try {
      setState(readyState(await listTemplates(documentType)));
    } catch (caught) {
      setState({ status: "error", message: getErrorMessage(caught) });
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    listTemplates(documentType, controller.signal)
      .then((versions) => setState(readyState(versions)))
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          setState({ status: "error", message: getErrorMessage(caught) });
        }
      });
    // Only names the active version's markers: without it they just aren't
    // listed.
    getMarkerCatalog(documentType, controller.signal)
      .then(setCatalog)
      .catch(() => undefined);
    return () => controller.abort();
  }, [documentType]);

  const active = state.status === "ready" ? state.active : null;
  const labels = active ? fieldLabels(active.fields, catalog) : [];

  return (
    <Card title={`Plantilla de ${text.name}`} className="templates-page__type">
      {state.status === "loading" && (
        <div
          className="templates-page__version--skeleton"
          role="status"
          aria-label={`Cargando la plantilla de ${text.name}`}
        >
          <div>
            <i />
            <i />
          </div>
        </div>
      )}

      {state.status === "error" && (
        <Notice className="templates-page__retry">
          {state.message}
          <Button variant="secondary" onClick={() => void retry()}>
            Reintentar
          </Button>
        </Notice>
      )}

      {state.status === "ready" && active && (
        <div className="templates-page__active">
          <div className="templates-page__active-head">
            <p>
              <strong>Versión {active.version}</strong>
            </p>
            <StatusBadge variant="success">Activa</StatusBadge>
          </div>
          <p>
            <span className="templates-page__file">{active.fileName}</span>
            <br />
            Subida el {DATE_TIME_FORMATTER.format(new Date(active.createdAt))}
          </p>
          {labels.length > 0 && (
            <details className="templates-page__fields">
              <summary>
                Datos que llena la plantilla ({labels.length})
                <Icon>
                  <path d="M4 6l4 4 4-4" />
                </Icon>
              </summary>
              <ul>
                {labels.map((label) => (
                  <li key={label}>{label}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {state.status === "ready" && !active && (
        <div className="templates-page__empty">
          <StatusBadge variant="warning">Sin plantilla activa</StatusBadge>
          <p>
            Mientras no haya una plantilla de {text.name} activa, no se pueden
            generar sus PDF.
          </p>
        </div>
      )}

      {/* Without a template the next step is uploading one. */}
      {state.status === "ready" && !active ? (
        <ButtonLink className="templates-page__go" href={href}>
          Subir una plantilla
        </ButtonLink>
      ) : (
        <ButtonLink
          variant="secondary"
          className="templates-page__go"
          href={href}
        >
          Ver historial y subir una nueva
        </ButtonLink>
      )}
    </Card>
  );
}
