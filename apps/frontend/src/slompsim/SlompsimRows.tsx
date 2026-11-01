import { SettlementStatusBadge } from "../components/ui/SettlementStatusBadge";
import type { SettlementStatus } from "../domain/settlementStatus";
import "./SlompsimRows.css";

interface SlompsimRow {
  key: string | number;
  first: string;
  second: string;
  status: SettlementStatus;
}

interface SlompsimRowsProps {
  header: [string, string, string];
  rows: SlompsimRow[];
  // Several periods per row ("2018–2021").
  widePeriods?: boolean;
}

export function SlompsimRows({ header, rows, widePeriods }: SlompsimRowsProps) {
  return (
    <ul className="slompsim-rows" data-wide-periods={widePeriods}>
      <li aria-hidden="true">
        {header.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </li>
      {rows.map(({ key, first, second, status }) => (
        <li key={key}>
          <span className="slompsim-rows__first">{first}</span>
          <span>{second}</span>
          <SettlementStatusBadge status={status} />
        </li>
      ))}
    </ul>
  );
}
