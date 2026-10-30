import { useId } from "react";
import type { MarkerCatalogEntry } from "../../api/templates";
import { Icon } from "../../components/ui/Icon";
import { StatusBadge } from "../../components/ui/StatusBadge";
import {
  isTableField,
  isTableLoop,
  progressText,
  splitByAssigned,
} from "../../domain/templateMarking";
import type { RequiredProgress } from "../../domain/templateMarking";
import "./MarkerChecklist.css";

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

function TableIcon() {
  return (
    <Icon>
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <path d="M2 6.5h12M2 10h12M6.5 6.5V13" />
    </Icon>
  );
}

// What the template needs: every marker of the type, with whether it is
// already somewhere in the document. What is still missing comes first and
// what is assigned last; the fields of the table (marked in its example row)
// go in a box of their own at the end.
export function MarkerChecklist({
  catalog,
  counts,
  progress,
  documentName,
  onLocate,
}: MarkerChecklistProps) {
  const titleId = useId();
  const others = splitByAssigned(
    catalog.filter((entry) => !isTableLoop(entry) && !isTableField(entry)),
    counts,
  );
  const tables = catalog.filter(isTableLoop).map((loop) => ({
    loop,
    fields: splitByAssigned(
      catalog.filter((entry) => entry.key.startsWith(`${loop.key}.`)),
      counts,
    ),
  }));

  function renderEntry(entry: MarkerCatalogEntry, inTable: boolean) {
    const count = counts.get(entry.key) ?? 0;
    const assigned = count > 0;
    return (
      <li
        key={entry.key}
        className="marker-list__item"
        data-assigned={assigned || undefined}
      >
        <div className="marker-list__item-head">
          <span className="marker-list__label">{entry.label}</span>
          <Status entry={entry} count={count} />
        </div>
        {/* Once assigned, the name is enough: the list stays short. */}
        {!assigned && (
          <p className="marker-list__description">{entry.description}</p>
        )}
        <div className="marker-list__meta">
          {inTable && (
            <span className="marker-list__in-table">
              <TableIcon />
              En la tabla
            </span>
          )}
          {entry.required && (
            <span className="marker-list__required">Obligatorio</span>
          )}
          {assigned && (
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

  function renderTable({ loop, fields }: (typeof tables)[number]) {
    const headingId = `${titleId}-${loop.key}`;
    return (
      <li key={loop.key} className="marker-list__table">
        <section aria-labelledby={headingId}>
          <div className="marker-list__table-head">
            <span className="marker-list__table-icon" aria-hidden="true">
              <TableIcon />
            </span>
            <h4 id={headingId} className="marker-list__table-title">
              {loop.label}
            </h4>
            <Status entry={loop} count={counts.get(loop.key) ?? 0} />
          </div>
          <p className="marker-list__table-text">
            Estos datos se marcan en la fila de ejemplo de la tabla del
            documento: esa fila se repite una vez por cada vigencia y concepto
            que cobre la {documentName}.
          </p>
          <ul className="marker-list__items" aria-label={loop.label}>
            {fields.pending.map((field) => renderEntry(field, true))}
            {fields.assigned.map((field) => renderEntry(field, true))}
          </ul>
        </section>
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

      {/* One list: what is still to assign first and what is assigned
          last; the table's fields, in their own box, always at the end. */}
      <ul className="marker-list__items">
        {others.pending.map((entry) => renderEntry(entry, false))}
        {others.assigned.map((entry) => renderEntry(entry, false))}
        {tables.map(renderTable)}
      </ul>
    </section>
  );
}
