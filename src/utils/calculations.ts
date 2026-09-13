export const roundPercent = (value: number): number => Math.sign(value) * Math.round((Math.abs(value) + Number.EPSILON) * 100) / 100;
export function marketChange(close: number, previousClose: number) {
  if (!Number.isFinite(close) || !Number.isFinite(previousClose) || previousClose === 0) return { status: 'INVALID_VALUE' as const };
  const change = close - previousClose;
  const changePct = change / previousClose * 100;
  if (!Number.isFinite(change) || !Number.isFinite(changePct)) return { status: 'INVALID_VALUE' as const };
  return { status: 'OK' as const, raw: { change, changePct }, display: { change, changePct: roundPercent(changePct) }, formula: '(close - previousClose) / previousClose * 100', rounding: 'percent: 2 decimals, half away from zero' };
}
