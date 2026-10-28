import type { ReactNode } from "react";
import "./IssueList.css";

// What went wrong in an upload, with how many. Collapsed by default; a long
// list scrolls inside instead of the page. The children are the <li> items.
export function IssueList({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  if (count === 0) {
    return null;
  }

  return (
    <details className="ui-issue-list">
      <summary>
        {title} ({count})
      </summary>
      <ul>{children}</ul>
    </details>
  );
}
