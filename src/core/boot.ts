// Cold-start timing line shown in Setup (ms since navigation start).
export function bootLine({ page, data }: { page: number; data: number }): string {
  return `Opened in ${Math.round(page + data)} ms · page ${Math.round(page)} · data ${Math.round(data)}`;
}
