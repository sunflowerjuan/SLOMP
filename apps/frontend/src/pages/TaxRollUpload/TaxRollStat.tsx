export function TaxRollStat({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone?: "danger" | "warning";
}) {
  return (
    <div className="tax-roll-upload-page__stat" data-tone={tone}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
