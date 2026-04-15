/**
 * ISO 3166-1 alpha-2 → alpha-3 for orchestration + PawaPay.
 * Keep in sync with create-pawapay-payment / create-tip-pawapay-payment dial-prefix coverage.
 */
export const ISO2_TO_ALPHA3: Record<string, string> = {
  DZ: "DZA",
  AO: "AGO",
  BJ: "BEN",
  BW: "BWA",
  BF: "BFA",
  BI: "BDI",
  CV: "CPV",
  CM: "CMR",
  CF: "CAF",
  TD: "TCD",
  KM: "COM",
  CG: "COG",
  CD: "COD",
  CI: "CIV",
  DJ: "DJI",
  EG: "EGY",
  GQ: "GNQ",
  ER: "ERI",
  SZ: "SWZ",
  ET: "ETH",
  GA: "GAB",
  GM: "GMB",
  GH: "GHA",
  GN: "GIN",
  GW: "GNB",
  KE: "KEN",
  LS: "LSO",
  LR: "LBR",
  LY: "LBY",
  MG: "MDG",
  MW: "MWI",
  ML: "MLI",
  MR: "MRT",
  MU: "MUS",
  MA: "MAR",
  MZ: "MOZ",
  NA: "NAM",
  NE: "NER",
  NG: "NGA",
  RW: "RWA",
  ST: "STP",
  SN: "SEN",
  SC: "SYC",
  SL: "SLE",
  SO: "SOM",
  ZA: "ZAF",
  SS: "SSD",
  SD: "SDN",
  TZ: "TZA",
  TG: "TGO",
  TN: "TUN",
  UG: "UGA",
  ZM: "ZMB",
  ZW: "ZWE",
  RE: "REU",
  YT: "MYT",
  SH: "SHN",
};

export function iso2ToAlpha3(iso2: string): string | null {
  const k = iso2.trim().toUpperCase().slice(0, 2);
  return ISO2_TO_ALPHA3[k] ?? null;
}

/** DusuPay collection currency for capability / initialize (best-effort). */
export const ISO2_TO_DUSUPAY_CURRENCY: Record<string, string> = {
  GH: "GHS", UG: "UGX", KE: "KES", TZ: "TZS", RW: "RWF", ZM: "ZMW", CM: "XAF",
  NG: "NGN", SN: "XOF", CI: "XOF", BF: "XOF", ML: "XOF", NE: "XOF", TG: "XOF", BJ: "XOF",
  ZA: "ZAR", EG: "EGP", ZW: "USD",
};
