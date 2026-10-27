import { missingLiquidationDataText } from "../../api/errorMessages";
import type { IncompleteDocument } from "../../domain/pdfJob";
import { formatPeriods } from "../../utils/formatPeriods";
import "./IncompleteDocumentList.css";

// Every document that keeps a bulk ZIP from starting (400
// LIQUIDATION_DATA_INCOMPLETE), so they can all be fixed in one pass. A long
// list scrolls inside instead of pushing the page.
export function IncompleteDocumentList({
  documents,
  label,
}: {
  documents: IncompleteDocument[];
  // Names the list, e.g. "Liquidaciones con datos incompletos".
  label: string;
}) {
  return (
    <ul className="ui-incomplete-documents" aria-label={label}>
      {documents.map((document, index) => (
        <li key={`${document.cadastralCode}-${index}`}>
          <span className="ui-incomplete-documents__code">
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
