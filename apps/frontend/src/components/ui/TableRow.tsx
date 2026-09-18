import type { ReactNode } from "react";

interface TableRowProps {
  cells: ReactNode[];
}

export function TableRow({ cells }: TableRowProps) {
  return (
    <tr className="ui-table__row">
      {cells.map((cell, index) => (
        <td key={index} className="ui-table__cell">
          {cell}
        </td>
      ))}
    </tr>
  );
}
