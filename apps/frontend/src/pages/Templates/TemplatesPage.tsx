import { useCallback, useEffect, useState } from "react";
import { getErrorMessage } from "../../api/ApiError";
import {
  activateTemplate,
  listTemplates,
  uploadTemplate,
} from "../../api/templates";
import type { TemplateVersion } from "../../api/templates";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Dialog } from "../../components/ui/Dialog";
import { Dropzone } from "../../components/ui/Dropzone";
import { Icon } from "../../components/ui/Icon";
import { Notice } from "../../components/ui/Notice";
import { PageHeader } from "../../components/ui/PageHeader";
import { StatusBadge } from "../../components/ui/StatusBadge";
import "./TemplatesPage.css";

// Same limit the backend enforces (TEMPLATE_UPLOAD_LIMITS).
const MAX_TEMPLATE_SIZE_MB = 5;

const DATE_FORMATTER = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "short",
  timeStyle: "short",
});

type Outcome = { variant: "success" | "info" | "error"; text: string };

// The municipality's liquidation template (SL-91): a valid upload becomes the
// active version at once; an invalid one is refused with the marker that
// fails, and the active version stays. Payment orders get their own template
// with SL-129.
export function TemplatesPage() {
  const [versions, setVersions] = useState<TemplateVersion[] | null>(null);
  const [listError, setListError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [toActivate, setToActivate] = useState<TemplateVersion | null>(null);
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState("");

  const reload = useCallback(async () => {
    try {
      setVersions(await listTemplates("LIQUIDACION"));
      setListError("");
    } catch (caught) {
      setListError(getErrorMessage(caught));
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    listTemplates("LIQUIDACION", controller.signal)
      .then(setVersions)
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) setListError(getErrorMessage(caught));
      });
    return () => controller.abort();
  }, []);

  const active = versions?.find((version) => version.isActive) ?? null;

  async function handleUpload() {
    if (!file) return;
    setOutcome(null);
    setUploading(true);
    try {
      const uploaded = await uploadTemplate("LIQUIDACION", file);
      // The backend answers the active version itself for an identical file.
      setOutcome(
        uploaded.id === active?.id
          ? { variant: "info", text: "Esta plantilla ya es la versión activa." }
          : {
              variant: "success",
              text: `La versión ${uploaded.version} quedó activa.`,
            },
      );
      setFile(null);
      void reload();
    } catch (caught) {
      setOutcome({ variant: "error", text: getErrorMessage(caught) });
    } finally {
      setUploading(false);
    }
  }

  async function handleActivate() {
    if (!toActivate) return;
    setActivateError("");
    setActivating(true);
    try {
      const activated = await activateTemplate(toActivate.id);
      setOutcome({
        variant: "success",
        text: `La versión ${activated.version} quedó activa.`,
      });
      setToActivate(null);
      void reload();
    } catch (caught) {
      setActivateError(getErrorMessage(caught));
    } finally {
      setActivating(false);
    }
  }

  return (
    <div className="page templates-page">
      <PageHeader title="Plantillas" />

      <div className="templates-page__layout">
        <Card title="Liquidación oficial" className="templates-page__upload">
          {active ? (
            <div className="templates-page__active">
              <p>
                En uso: <strong>versión {active.version}</strong> ·{" "}
                <span className="templates-page__file">{active.fileName}</span>
              </p>
              <details className="templates-page__fields">
                <summary>
                  Campos de la plantilla ({active.fields.length})
                  <Icon>
                    <path d="M4 6l4 4 4-4" />
                  </Icon>
                </summary>
                <ul>
                  {active.fields.map((field) => (
                    <li key={field}>
                      <code>{`{${field}}`}</code>
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          ) : (
            versions !== null && (
              <Notice variant="info">
                Este municipio todavía no tiene plantilla de liquidación: sin
                ella no se pueden generar los PDF.
              </Notice>
            )
          )}

          <Dropzone
            file={file}
            accept=".docx"
            maxSizeMb={MAX_TEMPLATE_SIZE_MB}
            onFileSelect={(selected) => {
              setFile(selected);
              setOutcome(null);
            }}
            onClear={() => {
              setFile(null);
              setOutcome(null);
            }}
          />

          {outcome && <Notice variant={outcome.variant}>{outcome.text}</Notice>}

          <div className="templates-page__actions">
            <Button
              type="button"
              disabled={!file}
              loading={uploading}
              onClick={handleUpload}
            >
              Subir plantilla
            </Button>
          </div>
        </Card>

        <Card title="Versiones" className="templates-page__versions">
          {listError && (
            <Notice className="templates-page__retry">
              {listError}
              <Button variant="secondary" onClick={() => void reload()}>
                Reintentar
              </Button>
            </Notice>
          )}

          {versions === null && !listError && (
            <ul
              className="templates-page__list"
              role="status"
              aria-label="Cargando versiones"
            >
              {[0, 1].map((row) => (
                <li
                  key={row}
                  className="templates-page__version templates-page__version--skeleton"
                  aria-hidden="true"
                >
                  <div>
                    <i />
                    <i />
                  </div>
                </li>
              ))}
            </ul>
          )}

          {versions?.length === 0 && (
            <p className="templates-page__muted">
              Todavía no se ha subido ninguna plantilla.
            </p>
          )}

          {versions && versions.length > 0 && (
            <ul className="templates-page__list">
              {versions.map((version) => (
                <li key={version.id} className="templates-page__version">
                  <div>
                    <strong>Versión {version.version}</strong>
                    <span className="templates-page__file">
                      {version.fileName}
                    </span>
                    <span>
                      {DATE_FORMATTER.format(new Date(version.createdAt))}
                    </span>
                  </div>
                  {version.isActive ? (
                    <StatusBadge variant="success">Activa</StatusBadge>
                  ) : (
                    <Button
                      variant="secondary"
                      aria-label={`Activar la versión ${version.version}`}
                      onClick={() => {
                        setActivateError("");
                        setToActivate(version);
                      }}
                    >
                      Activar
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Dialog
        open={toActivate !== null}
        title={`Activar la versión ${toActivate?.version ?? ""}`}
        onClose={() => {
          if (!activating) setToActivate(null);
        }}
      >
        <div className="ui-dialog__body">
          <p>Los próximos PDF de liquidación usarán esta versión.</p>
        </div>
        {activateError && (
          <Notice className="ui-dialog__notice">{activateError}</Notice>
        )}
        <div className="ui-dialog__actions">
          <Button
            variant="secondary"
            disabled={activating}
            onClick={() => setToActivate(null)}
          >
            Cancelar
          </Button>
          <Button loading={activating} onClick={handleActivate}>
            Activar
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
