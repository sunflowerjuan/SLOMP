import { useId } from "react";
import type { MarkerCatalogEntry } from "../../api/templates";
import { StatusBadge } from "../../components/ui/StatusBadge";
import {
  isTableField,
  isTableLoop,
  progressText,
} from "../../domain/templateMarking";
import type { RequiredProgress } from "../../domain/templateMarking";

interface MarkerChecklistProps {
  catalog: MarkerCatalogEntry[];
  // How many times each marker is in the document (the file's and the
  // lawyer's), by key; a table counts its fields.
  counts: ReadonlyMap<string, number>;
  progress: RequiredProgress;
  // "liquidación" or "mandamiento".
  documentName: string;
  onLocate: (entry: MarkerCatalogEntry) => void;
}

function Status({
  entry,
  count,
}: {
  entry: MarkerCatalogEntry;
  count: number;
}) {
  if (count > 0) {
    return (
      <StatusBadge variant="success">
        {count > 1 ? `Asignado ${count} veces` : "Asignado"}
      </StatusBadge>
    );
  }
  return entry.required ? (
    <StatusBadge variant="warning">Falta</StatusBadge>
  ) : null;
}

// What the template needs: every marker of the type, required first, with
// whether it is already somewhere in the document.
export function MarkerChecklist({
  catalog,
  counts,
  progress,
  documentName,
  onLocate,
}: MarkerChecklistProps) {
  const titleId = useId();
  const loops = catalog.filter(isTableLoop);
  const tableFields = catalog.filter(isTableField);
  const others = catalog.filter(
    (entry) => !isTableLoop(entry) && !isTableField(entry),
  );

  function renderEntry(entry: MarkerCatalogEntry, locatable = true) {
    const count = counts.get(entry.key) ?? 0;
    return (
      <li key={entry.key} className="marker-list__item">
        <div className="marker-list__item-head">
          <span className="marker-list__label">{entry.label}</span>
          <Status entry={entry} count={count} />
        </div>
        <p className="marker-list__description">{entry.description}</p>
        <div className="marker-list__meta">
          {entry.required && (
            <span className="marker-list__required">Obligatorio</span>
          )}
          {locatable && count > 0 && (
            <button
              type="button"
              className="marker-list__locate"
              aria-label={`Ver ${entry.label} en el documento`}
              onClick={() => onLocate(entry)}
            >
              Ver en el documento
            </button>
          )}
        </div>
      </li>
    );
  }

  return (
    <section className="marker-list" aria-labelledby={titleId}>
      <div className="marker-list__head">
        <h2 id={titleId} className="marker-list__title">
          Marcadores
        </h2>
        <p className="marker-list__progress" aria-live="polite">
          <strong>{progressText(progress)}</strong>
          {progress.done === progress.total
            ? " · listo para guardar"
            : ` · ${progress.total - progress.done === 1 ? "falta 1" : `faltan ${progress.total - progress.done}`}`}
        </p>
        <div className="marker-list__bar" aria-hidden="true">
          <span
            style={{
              width: `${progress.total ? (progress.done / progress.total) * 100 : 100}%`,
            }}
          />
        </div>
      </div>
      <p className="marker-list__hint">
        Selecciona en el documento el texto que cambia en cada {documentName} y
        elige qué dato es. Un mismo marcador se puede usar en varios lugares.
      </p>
      <ul className="marker-list__items">
        {others.map((entry) => renderEntry(entry))}
        {loops.map((loop) => (
          <li key={loop.key} className="marker-list__group">
            <div className="marker-list__item">
              <div className="marker-list__item-head">
                <span className="marker-list__label">{loop.label}</span>
                <Status entry={loop} count={counts.get(loop.key) ?? 0} />
              </div>
              <p className="marker-list__description">
                Se repite una fila por cada año. Se activa al marcar cualquier
                dato de la tabla en su fila de ejemplo.
              </p>
              {loop.required && (
                <div className="marker-list__meta">
                  <span className="marker-list__required">Obligatorio</span>
                </div>
              )}
            </div>
            <ul className="marker-list__items" aria-label={loop.label}>
              {tableFields
                .filter((field) => field.key.startsWith(`${loop.key}.`))
                .map((field) => renderEntry(field))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
