import { messageForRowIssue } from "../../api/errorMessages";
import type { TaxRollRowIssue } from "../../api/taxRoll";
import "./RowIssueList.css";

// The rows of an Excel with a problem, each with its reason, all in sight
// (no scroll of its own).
export function RowIssueList({ issues }: { issues: TaxRollRowIssue[] }) {
  return (
    <ul className="ui-row-issues">
      {issues.map((issue) => (
        <li key={`${issue.row}-${issue.code}`}>{messageForRowIssue(issue)}</li>
      ))}
    </ul>
  );
}
