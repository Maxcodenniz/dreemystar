/** Fields required by create-mobile-money-payment / create-tip-mobile-money-payment (orchestrator). */
export function mobileMoneyRoutingFields(selection: {
  countryCode: string;
  mobileOperator: string;
}): { countryCode: string; mobileOperator: string } {
  return {
    countryCode: selection.countryCode.trim().toUpperCase().slice(0, 2),
    mobileOperator: selection.mobileOperator.trim(),
  };
}
