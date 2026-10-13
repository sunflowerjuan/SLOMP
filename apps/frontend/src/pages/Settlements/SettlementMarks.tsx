import { primaryMark } from "../../domain/settlementMarks";
import type { MarkedSettlement } from "../../domain/settlementMarks";
import { formatPeriods } from "../../utils/formatPeriods";
import "./SettlementMarks.css";

interface SettlementMarksProps {
  entry: MarkedSettlement;
}

// The labels always carry text: the highlight never depends on color alone.
export function SettlementMarks({ entry }: SettlementMarksProps) {
  const missing = entry.missingPeriods;
  if (primaryMark(entry) === null) return null;

  return (
    <ul className="settlement-marks" aria-label="Alertas">
      {missing.length > 0 && (
        <li className="settlement-marks__tag settlement-marks__tag--missing">
          {missing.length === 1 ? "Periodo perdido" : "Periodos perdidos"}:{" "}
          {formatPeriods(missing)}
        </li>
      )}
      {entry.kind === "PRESCRIPTION_RISK" && (
        <li className="settlement-marks__tag settlement-marks__tag--risk">
          Riesgo de prescripción
        </li>
      )}
    </ul>
  );
}
