import { useEffect, useState } from "react";
import { ACTIVE_MUNICIPALITY_SLUG } from "../../api/municipality";
import { getPublicMunicipality } from "../../api/publicConsultation";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { consultationUrl } from "../../utils/consultationUrl";
import "./EmbedPage.css";

// Where the frontend is served, without the hash.
function appUrl(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

// Read-only: a link to the public consultation of the municipality the panel
// works in. The Administrator cannot change the page it points to.
export function EmbedPage() {
  const slug = ACTIVE_MUNICIPALITY_SLUG;
  const url = consultationUrl(appUrl(), slug);
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getPublicMunicipality(slug, controller.signal)
      .then((municipality) => setName(municipality.name))
      .catch(() => setName(null));
    return () => controller.abort();
  }, [slug]);

  return (
    <div className="embed-page">
      <PageHeader
        title="Consulta pública"
        subtitle="Enlace a la consulta de liquidaciones de este municipio."
      />

      <Card title="Municipio">
        <p className="embed-page__link">
          <a href={url} target="_blank" rel="noreferrer">
            {name ?? slug}
          </a>
        </p>
      </Card>
    </div>
  );
}
