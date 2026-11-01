import type { ReactNode } from "react";
import { messageForRowIssue } from "../../api/errorMessages";
import type { TaxRollRowIssue } from "../../api/taxRoll";
import { Card } from "./Card";
import { IssueList } from "./IssueList";
import { Stat } from "./Stat";
import type { StatProps } from "./Stat";
import "./UploadResult.css";

interface UploadResultProps {
  // On the card, for the page's own layout and motion.
  className?: string;
  // The file's name.
  subtitle?: string;
  action?: ReactNode;
  // What the upload produced; a figure in zero is left out. The skipped rows
  // and the warnings say how many in their own lists.
  stats: StatProps[];
  invalidRows: TaxRollRowIssue[];
  warnings: TaxRollRowIssue[];
  // What the page adds between the figures and the row problems.
  children?: ReactNode;
}

function rowIssueItems(issues: TaxRollRowIssue[]) {
  return issues.map((issue) => (
    <li key={`${issue.row}-${issue.code}`}>{messageForRowIssue(issue)}</li>
  ));
}

// The outcome of a tax roll upload: its figures, what the page adds, and the
// rows that were skipped or have warnings.
export function UploadResult({
  className,
  subtitle,
  action,
  stats,
  invalidRows,
  warnings,
  children,
}: UploadResultProps) {
  const shownStats = stats.filter((stat) => stat.value > 0);

  return (
    <Card
      title="Resultado de la carga"
      subtitle={subtitle}
      className={className}
      action={action}
    >
      {shownStats.length > 0 && (
        <dl className="ui-upload-result__stats">
          {shownStats.map((stat) => (
            <Stat key={stat.label} {...stat} />
          ))}
        </dl>
      )}
      {children}
      <IssueList title="Filas inválidas" count={invalidRows.length}>
        {rowIssueItems(invalidRows)}
      </IssueList>
      <IssueList title="Advertencias" count={warnings.length}>
        {rowIssueItems(warnings)}
      </IssueList>
    </Card>
  );
}
