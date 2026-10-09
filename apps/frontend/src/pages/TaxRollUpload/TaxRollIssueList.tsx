import { messageForRowIssue } from "../../api/errorMessages";
import type { TaxRollImportResult } from "../../api/taxRoll";

// Collapsed by default; a long list scrolls inside instead of the page.
export function TaxRollIssueList({
  title,
  issues,
}: {
  title: string;
  issues: TaxRollImportResult["invalidRows"];
}) {
  if (issues.length === 0) {
    return null;
  }

  return (
    <details className="tax-roll-upload-page__issues">
      <summary>
        {title} ({issues.length})
      </summary>
      <ul>
        {issues.map((issue) => (
          <li key={`${issue.row}-${issue.code}`}>
            {messageForRowIssue(issue)}
          </li>
        ))}
      </ul>
    </details>
  );
}
