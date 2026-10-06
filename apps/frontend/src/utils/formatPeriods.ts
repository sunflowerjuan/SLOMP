// [2018, 2019, 2020, 2023] -> "2018–2020, 2023". Expects ascending periods.
export function formatPeriods(periods: number[]): string {
  const ranges: string[] = [];
  for (let i = 0; i < periods.length; i++) {
    let end = i;
    while (periods[end + 1] === periods[end] + 1) end++;
    ranges.push(
      end - i >= 1 ? `${periods[i]}–${periods[end]}` : `${periods[i]}`,
    );
    i = end;
  }
  return ranges.join(", ");
}
