import { missingLiquidationDataText } from "../../api/errorMessages";
import type { IncompleteDocument } from "../../domain/pdfJob";
import { formatPeriods } from "../../utils/formatPeriods";

// Every liquidation that keeps a bulk ZIP from starting (400
// LIQUIDATION_DATA_INCOMPLETE), so they can all be fixed in one pass. A long
// list scrolls inside instead of pushing the page.
export function IncompleteDocumentList({
  documents,
}: {
  documents: IncompleteDocument[];
}) {
  return (
    <ul
      className="bulk-zip-panel__incomplete"
      aria-label="Liquidaciones con datos incompletos"
    >
      {documents.map((document, index) => (
        <li key={`${document.cadastralCode}-${index}`}>
          <span className="bulk-zip-panel__incomplete-code">
            {document.cadastralCode || "Sin cédula catastral"}
          </span>
          <span>
            {document.periods.length > 0 &&
              `${formatPeriods(document.periods)} · `}
            {missingLiquidationDataText(document.missing)}
          </span>
        </li>
      ))}
    </ul>
  );
}
