import type { ReactNode } from "react";
import { messageForRowIssue } from "../../api/errorMessages";
import type { TaxRollRowIssue } from "../../api/taxRoll";
import { countNoun } from "../../utils/formatCount";
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
  // What the upload produced; the skipped rows and the warnings follow them.
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

// The outcome of an Excel upload (tax roll and payment orders): its figures,
// what the page adds, and the rows that were skipped or have warnings.
export function UploadResult({
  className,
  subtitle,
  action,
  stats,
  invalidRows,
  warnings,
  children,
}: UploadResultProps) {
  return (
    <Card
      title="Resultado de la carga"
      subtitle={subtitle}
      className={className}
      action={action}
    >
      <dl className="ui-upload-result__stats">
        {stats.map((stat) => (
          <Stat key={stat.label} {...stat} />
        ))}
        <Stat
          value={invalidRows.length}
          label={countNoun(
            invalidRows.length,
            "fila inválida omitida",
            "filas inválidas omitidas",
          )}
          tone={invalidRows.length > 0 ? "danger" : undefined}
        />
        <Stat
          value={warnings.length}
          label={countNoun(
            warnings.length,
            "fila con advertencias",
            "filas con advertencias",
          )}
          tone={warnings.length > 0 ? "warning" : undefined}
        />
      </dl>
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
