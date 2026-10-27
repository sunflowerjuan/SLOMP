import "./Stat.css";

export interface StatProps {
  value: number;
  label: string;
  tone?: "danger" | "warning";
}

// One figure of a result: the number over what it counts. Goes in a <dl>.
export function Stat({ value, label, tone }: StatProps) {
  return (
    <div className="ui-stat" data-tone={tone}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
