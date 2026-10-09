import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import {
  SETTLEMENT_STATUSES,
  SETTLEMENT_STATUS_LABEL,
  SETTLEMENT_STATUS_VARIANT,
} from "../../domain/settlementStatus";
import type { SettlementStatus } from "../../domain/settlementStatus";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Icon } from "../../components/ui/Icon";
import "./SettlementStatusCell.css";

interface SettlementStatusCellProps {
  status: SettlementStatus | "MIXED";
  description: string;
  editing: boolean;
  saving: boolean;
  editLocked: boolean;
  onEdit: () => void;
  onSave: (status: SettlementStatus) => void;
  onCancel: () => void;
}

export function SettlementStatusCell({
  status,
  description,
  editing,
  saving,
  editLocked,
  onEdit,
  onSave,
  onCancel,
}: SettlementStatusCellProps) {
  const [draft, setDraft] = useState<SettlementStatus>(
    status === "MIXED" ? "VIGENTE" : status,
  );
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const wasEditing = useRef(false);

  useEffect(() => {
    if (editing) selectRef.current?.focus();
    else if (wasEditing.current) editButtonRef.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  function startEditing() {
    setDraft(status === "MIXED" ? "VIGENTE" : status);
    onEdit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!editing || saving) return;
    if (event.key === "Escape") {
      // Cancels the edit only; a second Escape closes the detail panel.
      event.stopPropagation();
      onCancel();
    }
    if (event.key === "Enter" && event.target instanceof HTMLSelectElement) {
      event.preventDefault();
      onSave(draft);
    }
  }

  return (
    <div className="status-cell" role="presentation" onKeyDown={handleKeyDown}>
      {editing ? (
        <>
          <select
            ref={selectRef}
            aria-label={`Estado de la liquidación: ${description}`}
            className="status-cell__select"
            value={draft}
            disabled={saving}
            onChange={(event) =>
              setDraft(event.target.value as SettlementStatus)
            }
          >
            {SETTLEMENT_STATUSES.map((estado) => (
              <option key={estado} value={estado}>
                {SETTLEMENT_STATUS_LABEL[estado]}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="status-cell__button status-cell__button--confirm"
            aria-label="Confirmar cambio de estado"
            disabled={saving}
            onClick={() => onSave(draft)}
          >
            <Icon>
              <path d="M3 8.5l3.2 3.2L13 4.5" />
            </Icon>
          </button>
          <button
            type="button"
            className="status-cell__button"
            aria-label="Cancelar cambio de estado"
            disabled={saving}
            onClick={onCancel}
          >
            <Icon>
              <path d="M4 4l8 8M12 4l-8 8" />
            </Icon>
          </button>
        </>
      ) : (
        <>
          {status === "MIXED" ? (
            <StatusBadge variant="neutral">Mixto</StatusBadge>
          ) : (
            <StatusBadge variant={SETTLEMENT_STATUS_VARIANT[status]}>
              {SETTLEMENT_STATUS_LABEL[status]}
            </StatusBadge>
          )}
          <button
            ref={editButtonRef}
            type="button"
            className="status-cell__button"
            aria-label={`Cambiar estado de ${description}`}
            disabled={editLocked}
            onClick={startEditing}
          >
            <Icon>
              <path d="M11 2.5l2.5 2.5L5.5 13H3v-2.5z" />
            </Icon>
          </button>
        </>
      )}
    </div>
  );
}
