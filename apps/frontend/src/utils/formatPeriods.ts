import { countNoun } from "./formatCount";

// [2018, 2019, 2020, 2023] -> "2018–2020, 2023". Expects ascending periods.
export function formatPeriods(periods: number[]): string {
  const ranges: string[] = [];
  let start = 0;
  while (start < periods.length) {
    let end = start;
    while (periods[end + 1] === periods[end] + 1) end++;
    ranges.push(
      end > start ? `${periods[start]}–${periods[end]}` : `${periods[start]}`,
    );
    start = end + 1;
  }
  return ranges.join(", ");
}

// [2020] -> "periodo 2020"; [2018, 2019] -> "periodos 2018–2019".
export function describePeriods(periods: number[]): string {
  return `${countNoun(periods.length, "periodo", "periodos")} ${formatPeriods(periods)}`;
}
