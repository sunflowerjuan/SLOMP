import { useState } from "react";
import { ACTIVE_MUNICIPALITY_SLUG } from "../../api/municipality";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Notice } from "../../components/ui/Notice";
import { PageHeader } from "../../components/ui/PageHeader";
import {
  EMBED_HEIGHT_PX,
  buildEmbedSnippet,
  consultationUrl,
} from "../../utils/embedSnippet";
import "./EmbedPage.css";

// Where the frontend is served, without the hash.
function appUrl(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

// Read-only: the Administrator hands this snippet to the municipality, they
// cannot change the page it points to.
export function EmbedPage() {
  const slug = ACTIVE_MUNICIPALITY_SLUG;
  const url = consultationUrl(appUrl(), slug);
  const snippet = buildEmbedSnippet(
    appUrl(),
    slug,
    "Consulta de liquidaciones del impuesto predial",
  );
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied("done");
    } catch {
      setCopied("failed");
    }
  }

  return (
    <div className="embed-page">
      <PageHeader
        title="Consulta pública"
        subtitle="Fragmento para incrustar la consulta de este municipio en su sitio web."
      />

      <Card
        title="Fragmento iframe"
        subtitle={`Altura fija de ${EMBED_HEIGHT_PX} px: el contenido se desplaza dentro del marco.`}
        action={
          <Button variant="secondary" onClick={handleCopy}>
            Copiar
          </Button>
        }
      >
        <textarea
          className="embed-page__snippet"
          readOnly
          rows={8}
          aria-label="Fragmento iframe de la consulta pública"
          value={snippet}
          onFocus={(event) => event.currentTarget.select()}
        />
        {copied === "done" && <Notice variant="success">Copiado.</Notice>}
        {copied === "failed" && (
          <Notice>No se pudo copiar. Selecciona el texto y cópialo.</Notice>
        )}
        <p className="embed-page__link">
          <a href={url} target="_blank" rel="noreferrer">
            Abrir la consulta en una pestaña nueva
          </a>
        </p>
      </Card>
    </div>
  );
}
