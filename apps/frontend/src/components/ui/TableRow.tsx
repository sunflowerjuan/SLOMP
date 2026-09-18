import type { KeyboardEvent, ReactNode } from "react";

interface TableRowProps {
  cells: ReactNode[];
  selected?: boolean;
  onClick?: () => void;
}

export function TableRow({ cells, selected = false, onClick }: TableRowProps) {
  const classes = [
    "ui-table__row",
    onClick ? "ui-table__row--clickable" : "",
    selected ? "ui-table__row--selected" : "",
  ]
    .filter(Boolean)
    .join(" ");

  function handleKeyDown(event: KeyboardEvent<HTMLTableRowElement>) {
    if (onClick && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      onClick();
    }
  }

  return (
    <tr
      className={classes}
      onClick={onClick}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? handleKeyDown : undefined}
      aria-selected={onClick ? selected : undefined}
    >
      {cells.map((cell, index) => (
        <td key={index} className="ui-table__cell">
          {cell}
        </td>
      ))}
    </tr>
  );
}
