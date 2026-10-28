import { useEffect, useRef, useState } from "react";
import { getPublicMunicipality } from "../../api/publicConsultation";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { consultationUrl } from "../../utils/consultationUrl";
import "./ConsultationLink.css";

// Where the frontend is served, without the hash.
function appUrl(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

const COPIED_MS = 3000;

// Read-only: the address of the municipality's public consultation, to copy
// and share or put on its website, or to open. The Administrator cannot
// change the page it points to.
export function ConsultationLink({ slug }: { slug: string }) {
  const url = consultationUrl(appUrl(), slug);
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState<string | null>(null);
  const [copied, setCopied] = useState<"done" | "manual" | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getPublicMunicipality(slug, controller.signal)
      .then((municipality) => setName(municipality.name))
      .catch(() => setName(null));
    return () => controller.abort();
  }, [slug]);

  useEffect(() => {
    if (copied !== "done") return;
    const timer = setTimeout(() => setCopied(null), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied("done");
    } catch {
      // No clipboard (an insecure address, a blocked permission): the
      // address is left selected, to copy by hand.
      inputRef.current?.select();
      setCopied("manual");
    }
  }

  return (
    <Card
      title="Enlace de consulta pública"
      subtitle={`Aquí los contribuyentes${name ? ` de ${name}` : ""} consultan y descargan sus liquidaciones sin iniciar sesión. Compártelo o ponlo en el sitio web del municipio.`}
      className="consultation-link"
    >
      <div className="consultation-link__row">
        <Input
          ref={inputRef}
          label="Dirección de la consulta"
          className="consultation-link__url"
          value={url}
          readOnly
          onFocus={(event) => event.target.select()}
        />
        <div className="consultation-link__actions">
          <Button onClick={() => void copy()}>Copiar enlace</Button>
          <Button
            variant="secondary"
            onClick={() => window.open(url, "_blank", "noreferrer")}
          >
            Abrir
          </Button>
        </div>
      </div>
      <p className="consultation-link__status" role="status">
        {copied === "done" && "Enlace copiado."}
        {copied === "manual" &&
          "No se pudo copiar solo: la dirección quedó seleccionada, cópiala con Ctrl + C."}
      </p>
    </Card>
  );
}
