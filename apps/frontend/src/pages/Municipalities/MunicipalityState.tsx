import { Button } from "../../components/ui/Button";
import "./MunicipalityState.css";

// What the panel shows instead of a screen when there is no municipality to
// work in: none created yet, the list didn't load, or the address names one
// that doesn't exist (SL-122, section 7).
type MunicipalityStateProps =
  | { kind: "empty"; onAdd: () => void }
  | { kind: "error"; message: string; onRetry: () => void }
  | {
      kind: "not-found";
      slug: string;
      // Where the "go" button leads: the last municipality used, or the first.
      fallback: { label: string; href: string } | null;
    };

export function MunicipalityState(props: MunicipalityStateProps) {
  return (
    <div className="page municipality-state">
      <div className="municipality-state__box" role="status">
        {props.kind === "empty" && (
          <>
            <h1 className="municipality-state__title">
              Todavía no hay municipios
            </h1>
            <p>Agrega el primero para cargar su cartera y sus plantillas.</p>
            <Button onClick={props.onAdd}>Agregar municipio</Button>
          </>
        )}
        {props.kind === "error" && (
          <>
            <h1 className="municipality-state__title">
              No se pudieron cargar los municipios
            </h1>
            <p>{props.message}</p>
            <Button variant="secondary" onClick={props.onRetry}>
              Reintentar
            </Button>
          </>
        )}
        {props.kind === "not-found" && (
          <>
            <h1 className="municipality-state__title">
              No encontramos el municipio «{props.slug}»
            </h1>
            <p>Revisa la dirección o elige otro municipio.</p>
            {props.fallback && (
              <a
                className="ui-button ui-button--secondary ui-button--md"
                href={props.fallback.href}
              >
                <span className="ui-button__label">
                  Ir a {props.fallback.label}
                </span>
              </a>
            )}
          </>
        )}
      </div>
    </div>
  );
}
