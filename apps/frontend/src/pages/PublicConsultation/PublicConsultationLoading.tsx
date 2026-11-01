import { Card } from "../../components/ui/Card";
import "./PublicConsultationPage.css";

const PLACEHOLDERS = [0, 1, 2];

// While the municipality of the address resolves: its name isn't known yet.
export function PublicConsultationLoading() {
  return (
    <div className="public-consultation public-consultation--single">
      <div className="public-consultation__topbar" aria-hidden="true">
        <div className="public-consultation__topbar-inner">
          <i className="public-consultation__band-placeholder" />
        </div>
      </div>
      <main className="public-consultation__main">
        <Card label="Consulta de liquidaciones">
          <div
            className="public-consultation__loading"
            role="status"
            aria-label="Cargando la consulta"
          >
            {PLACEHOLDERS.map((row) => (
              <i key={row} aria-hidden="true" />
            ))}
          </div>
        </Card>
      </main>
    </div>
  );
}
