/** Mirrors `breakdownFromBaseTotal` in `create-pawapay-payment` Edge function (USD, dollars). */
export function ticketPriceUsdBreakdown(baseTotal: number) {
  const subtotalCents = Math.round(baseTotal * 100);
  const totalCents = Math.round(baseTotal * 1.25 * 100);
  const serviceCents = Math.round(baseTotal * 0.05 * 100);
  const vatCents = totalCents - subtotalCents - serviceCents;
  return {
    subtotal: subtotalCents / 100,
    serviceFee: serviceCents / 100,
    vat: vatCents / 100,
    total: totalCents / 100,
  };
}
