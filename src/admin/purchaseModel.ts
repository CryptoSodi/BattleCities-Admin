// Format token base units without converting large atomic amounts to floating point.
export function formatPurchaseAmount(value: string, precision: number): string {
  if (!/^\d+$/.test(value) || !Number.isInteger(precision) || precision < 0 || precision > 18) return '—';
  const padded = value.padStart(precision + 1, '0');
  if (!precision) return padded;
  return `${padded.slice(0, -precision)}.${padded.slice(-precision)}`.replace(/\.?0+$/, '');
}
