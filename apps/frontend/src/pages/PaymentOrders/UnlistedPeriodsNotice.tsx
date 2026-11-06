import type { AssistantSettlement } from "../../api/assistant";
import { Button } from "../../components/ui/Button";
import { Notice } from "../../components/ui/Notice";
import { countProperties, unlistedScope } from "../../domain/slompsim";
import { countNoun } from "../../utils/formatCount";
import "./UnlistedPeriodsNotice.css";

interface UnlistedPeriodsNoticeProps {
  rows: AssistantSettlement[];
  onReview: () => void;
}

// A liquidated period the Excel leaves out isn't necessarily paid, and the
// system can't tell: the lawyer decides, with Slompsim.
export function UnlistedPeriodsNotice({
  rows,
  onReview,
}: UnlistedPeriodsNoticeProps) {
  const { periods, properties } = unlistedScope(rows);
  const liquidated = countNoun(rows.length, "liquidado", "liquidados");
  const appears = countNoun(rows.length, "aparece", "aparecen");

  return (
    <Notice variant="info" className="unlisted-periods-notice">
      <div className="unlisted-periods-notice__row">
        <span>
          <strong>
            Hay {periods} {liquidated} que no {appears} en el Excel.
          </strong>{" "}
          {countNoun(rows.length, "Pertenece", "Pertenecen")} a {properties} que
          sí {countNoun(countProperties(rows), "aparece", "aparecen")} en este
          archivo.
        </span>
        <Button variant="secondary" onClick={onReview}>
          Revisar con Slompsim
        </Button>
      </div>
    </Notice>
  );
}
