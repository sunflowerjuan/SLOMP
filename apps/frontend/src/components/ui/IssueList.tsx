import type { ReactNode } from "react";
import { formatCount, formatNumber } from "../../utils/formatCount";
import "./IssueList.css";

// What went wrong in an upload, with how many. Collapsed by default; a long
// list scrolls inside instead of the page. The children are the <li> items.
export function IssueList({
  title,
  count,
  unit,
  children,
}: {
  title: string;
  count: number;
  // What the count counts, when the items are not one each: the periods of
  // a list grouped by property ("No elegibles (3 periodos)").
  unit?: { singular: string; plural: string };
  children: ReactNode;
}) {
  if (count === 0) {
    return null;
  }

  return (
    <details className="ui-issue-list">
      <summary>
        {title} (
        {unit
          ? formatCount(count, unit.singular, unit.plural)
          : formatNumber(count)}
        )
      </summary>
      <ul>{children}</ul>
    </details>
  );
}
