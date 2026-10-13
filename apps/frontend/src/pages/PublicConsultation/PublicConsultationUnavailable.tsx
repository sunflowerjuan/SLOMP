import { Card } from "../../components/ui/Card";
import "./PublicConsultationPage.css";

// Shown for `#/consulta` without a municipality, an unknown slug, or when the
// municipality cannot be loaded. It says nothing else on purpose: no list of
// municipalities and no link to the panel.
export function PublicConsultationUnavailable() {
  return (
    <div className="public-consultation public-consultation--unavailable">
      <main className="public-consultation__main">
        <Card
          title="Consulta no disponible"
          subtitle="Esta consulta no está disponible en este momento. Si llegaste desde la página de tu municipio, acércate a la Secretaría de Hacienda."
        >
          {null}
        </Card>
      </main>
    </div>
  );
}
