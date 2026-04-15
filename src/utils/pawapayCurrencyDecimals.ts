/**
 * ISO 4217 minor units for PawaPay (zero-decimal currencies must not send fractions).
 * Must stay aligned with `pawapayMinorDecimalPlacesForCurrency` in
 * `supabase/functions/_shared/pawapaySessionHelpers.ts`.
 */
const ZERO_DECIMAL = new Set([
  'XOF',
  'XAF',
  'BIF',
  'DJF',
  'GNF',
  'KMF',
  'RWF',
  'UGX',
]);

export function pawapayMinorDecimalPlacesForCurrency(currency: string): number {
  const c = currency.trim().toUpperCase();
  if (ZERO_DECIMAL.has(c)) return 0;
  if (c === 'TND') return 3;
  return 2;
}

export function formatPawapayLocalAmountString(amount: number, currency: string): string {
  const dp = pawapayMinorDecimalPlacesForCurrency(currency);
  if (dp === 0) return String(Math.round(amount));
  const mult = 10 ** dp;
  const v = Math.round(amount * mult) / mult;
  return v.toFixed(dp);
}
