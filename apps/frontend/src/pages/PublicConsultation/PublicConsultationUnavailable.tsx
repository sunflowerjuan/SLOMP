import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import "./PublicConsultationPage.css";

interface PublicConsultationUnavailableProps {
  // The backend couldn't answer: it may work on another try.
  failure?: { message: string; onRetry: () => void };
}

// Shown for `#/consulta` without a municipality or for an unknown slug. It
// says nothing else on purpose: no list of municipalities and no link to the
// panel.
export function PublicConsultationUnavailable({
  failure,
}: PublicConsultationUnavailableProps) {
  return (
    <div className="public-consultation public-consultation--single">
      <main className="public-consultation__main">
        <Card
          title={
            failure ? "No pudimos cargar la consulta" : "Consulta no disponible"
          }
          subtitle={
            failure?.message ??
            "Esta consulta no está disponible en este momento. Si llegaste desde la página de tu municipio, acércate a la Secretaría de Hacienda."
          }
        >
          {failure && (
            <Button
              className="public-consultation__retry"
              onClick={failure.onRetry}
            >
              Reintentar
            </Button>
          )}
        </Card>
      </main>
    </div>
  );
}
