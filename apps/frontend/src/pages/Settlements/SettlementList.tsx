import { useRef } from "react";
import type { CSSProperties, KeyboardEvent, MouseEvent } from "react";
import type { SettlementSearchResult } from "../../api/settlements";
import type { SettlementStatus } from "../../domain/settlementStatus";
import { formatPeriods } from "../../utils/formatPeriods";
import { formatCop } from "./formatCop";
import { SettlementStatusCell } from "./SettlementStatusCell";
import "./SettlementList.css";

export type ListState = "idle" | "loading" | "results" | "empty";

interface SettlementListProps {
  state: ListState;
  results: SettlementSearchResult[];
  selectedId: number | null;
  editingId: number | null;
  editLocked: boolean;
  statusChangeId: number | null;
  detailId: string;
  onToggle: (id: number) => void;
  onEdit: (id: number) => void;
  onSave: (entry: SettlementSearchResult, status: SettlementStatus) => void;
  onCancel: () => void;
}

export function SettlementList({
  state,
  results,
  selectedId,
  editingId,
  editLocked,
  statusChangeId,
  detailId,
  onToggle,
  onEdit,
  onSave,
  onCancel,
}: SettlementListProps) {
  const listRef = useRef<HTMLDivElement>(null);

  if (state === "idle") {
    return (
      <div className="settlement-list__message">
        <strong>Busca una liquidación</strong>
        <p>Elige un criterio, escríbelo y pulsa Buscar.</p>
      </div>
    );
  }

  if (state === "empty") {
    return (
      <div className="settlement-list__message" role="status">
        <strong>Sin resultados</strong>
        <p>
          No encontramos liquidaciones con ese criterio. Revisa lo escrito o
          prueba con otro criterio.
        </p>
      </div>
    );
  }

  if (state === "loading") {
    return (
      <div role="status" aria-label="Buscando liquidaciones">
        <span className="settlement-list__sr">Buscando liquidaciones…</span>
        {Array.from({ length: 8 }, (_, index) => (
          <div className="settlement-list__skeleton" key={index} aria-hidden>
            <span />
            <span />
          </div>
        ))}
      </div>
    );
  }

  function handleRowClick(event: MouseEvent, id: number) {
    if ((event.target as HTMLElement).closest("button, select, a")) return;
    onToggle(id);
  }

  // Arrow keys walk the rows; with the detail open they also change the
  // selection so the panel follows.
  function handleLinkKeyDown(event: KeyboardEvent) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const links = [
      ...listRef.current!.querySelectorAll<HTMLElement>("[data-rowlink]"),
    ];
    const next =
      links[
        links.indexOf(event.currentTarget as HTMLElement) +
          (event.key === "ArrowDown" ? 1 : -1)
      ];
    if (!next) return;
    event.preventDefault();
    next.focus();
    if (selectedId !== null) next.click();
  }

  return (
    <div ref={listRef} role="table" aria-label="Liquidaciones">
      <div role="rowgroup" className="settlement-list__head">
        <div role="row" className="settlement-list__row">
          <div role="columnheader">Cédula catastral</div>
          <div role="columnheader">Propietario</div>
          <div role="columnheader">Periodos</div>
          <div role="columnheader" className="settlement-list__num">
            Total
          </div>
          <div role="columnheader">Estado</div>
        </div>
      </div>
      <div role="rowgroup">
        {results.map((entry, index) => {
          const selected = entry.settlementId === selectedId;
          const periods = formatPeriods(entry.periods);
          return (
            <div
              key={entry.settlementId}
              role="row"
              className="settlement-list__row settlement-list__row--body"
              aria-current={selected ? "true" : undefined}
              style={{ "--i": Math.min(index, 12) } as CSSProperties}
              onClick={(event) => handleRowClick(event, entry.settlementId)}
            >
              <div role="cell" className="settlement-list__code">
                <button
                  type="button"
                  data-rowlink={entry.settlementId}
                  aria-expanded={selected}
                  aria-controls={detailId}
                  onClick={() => onToggle(entry.settlementId)}
                  onKeyDown={handleLinkKeyDown}
                >
                  {entry.cadastralCode}
                </button>
              </div>
              <div
                role="cell"
                className="settlement-list__owner"
                title={entry.ownerName}
              >
                {entry.ownerName}
              </div>
              <div role="cell" className="settlement-list__periods">
                {periods}
              </div>
              <div role="cell" className="settlement-list__num">
                {formatCop(entry.totalAmount)}
              </div>
              <div role="cell" className="settlement-list__status">
                <SettlementStatusCell
                  status={entry.status}
                  description={`${entry.cadastralCode}, periodos ${periods}`}
                  editing={editingId === entry.settlementId}
                  saving={statusChangeId === entry.settlementId}
                  editLocked={editLocked}
                  onEdit={() => onEdit(entry.settlementId)}
                  onSave={(status) => onSave(entry, status)}
                  onCancel={onCancel}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
