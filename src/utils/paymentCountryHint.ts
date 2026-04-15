/**
 * Profile `country` string (ISO2, alpha-3, or common English name) → E.164 dial prefix.
 * Used when the stored phone is national format (leading 0) so the Edge function can build full digits.
 */
const COMPACT_COUNTRY_TO_DIAL: Record<string, string> = {
  GH: '+233',
  GHA: '+233',
  GHANA: '+233',
  SN: '+221',
  SEN: '+221',
  SENEGAL: '+221',
  NG: '+234',
  NGA: '+234',
  NIGERIA: '+234',
  KE: '+254',
  KEN: '+254',
  KENYA: '+254',
  UG: '+256',
  UGA: '+256',
  UGANDA: '+256',
  ZM: '+260',
  ZMB: '+260',
  ZAMBIA: '+260',
  RW: '+250',
  RWA: '+250',
  RWANDA: '+250',
  TZ: '+255',
  TZA: '+255',
  TANZANIA: '+255',
  CI: '+225',
  CIV: '+225',
  COTEDIVOIRE: '+225',
  IVORYCOAST: '+225',
  CM: '+237',
  CMR: '+237',
  CAMEROON: '+237',
  BF: '+226',
  BFA: '+226',
  BURKINAFASO: '+226',
  ML: '+223',
  MLI: '+223',
  MALI: '+223',
};

function dialHintFromProfileCountry(country: string | null | undefined): string | undefined {
  if (!country) return undefined;
  const c = country.trim().toUpperCase().replace(/[^A-Z]/g, '');
  return COMPACT_COUNTRY_TO_DIAL[c];
}

/** Optional fields for `create-mobile-money-payment` routing (country / dial code). */
export function paymentCountryFields(params: {
  profileCountry?: string | null;
  dialCode?: string | null;
  /** If set and looks national (leading 0), pair with profile country to infer dial code. */
  profilePhone?: string | null;
}): { country?: string; dialCode?: string } {
  const country = params.profileCountry?.trim();
  const out: { country?: string; dialCode?: string } = {};
  if (country) out.country = country;

  let dialCode = params.dialCode?.trim();
  const phoneDigits = params.profilePhone?.replace(/\D/g, '') ?? '';
  const looksNational = phoneDigits.length >= 9 && phoneDigits.startsWith('0');
  if (!dialCode && looksNational) {
    dialCode = dialHintFromProfileCountry(country);
  }
  if (dialCode) out.dialCode = dialCode;

  return out;
}
