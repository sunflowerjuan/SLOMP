import type { ReactNode } from "react";
import "./Table.css";

interface TableProps {
  columns: string[];
  children: ReactNode;
}

export function Table({ columns, children }: TableProps) {
  return (
    <div className="ui-table__wrapper">
      <table className="ui-table">
        <thead className="ui-table__head">
          <tr>
            {columns.map((column) => (
              <th key={column} className="ui-table__header-cell">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="ui-table__body">{children}</tbody>
      </table>
    </div>
  );
}
