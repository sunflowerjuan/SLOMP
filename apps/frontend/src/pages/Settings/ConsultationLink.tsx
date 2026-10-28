import { useEffect, useState } from "react";
import { getPublicMunicipality } from "../../api/publicConsultation";
import { Card } from "../../components/ui/Card";
import { consultationUrl } from "../../utils/consultationUrl";
import "./ConsultationLink.css";

// Where the frontend is served, without the hash.
function appUrl(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

// Read-only: a link to the public consultation of the municipality the panel
// works in. The Administrator cannot change the page it points to. A tab of
// Configuración (SL-170).
export function ConsultationLink({ slug }: { slug: string }) {
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
    <Card title="Municipio">
      <p className="consultation-link__url">
        <a href={url} target="_blank" rel="noreferrer">
          {name ?? slug}
        </a>
      </p>
    </Card>
  );
}
