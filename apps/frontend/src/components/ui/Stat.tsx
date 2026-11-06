import { formatNumber } from "../../utils/formatCount";
import "./Stat.css";

export interface StatProps {
  value: number;
  // In agreement with the value: "predio procesado" for 1.
  label: string;
}

// One figure of a result: the number over what it counts. Goes in a <dl>.
export function Stat({ value, label }: StatProps) {
  return (
    <div className="ui-stat">
      <dt>{label}</dt>
      <dd>{formatNumber(value)}</dd>
    </div>
  );
}
