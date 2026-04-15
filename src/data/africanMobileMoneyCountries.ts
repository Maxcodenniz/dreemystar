/**
 * African states and select territories (ISO 3166-1 alpha-3) with local ISO 4217 currency.
 * Used for Mobile Money country picker; FX may use Frankfurter (ECB) + open.er-api fallback.
 */
export type MobileMoneyCountryOption = {
  alpha3: string;
  name: string;
  currency: string;
};

const UNSORTED: MobileMoneyCountryOption[] = [
  { alpha3: 'DZA', name: 'Algeria', currency: 'DZD' },
  { alpha3: 'AGO', name: 'Angola', currency: 'AOA' },
  { alpha3: 'BEN', name: 'Benin', currency: 'XOF' },
  { alpha3: 'BWA', name: 'Botswana', currency: 'BWP' },
  { alpha3: 'BFA', name: 'Burkina Faso', currency: 'XOF' },
  { alpha3: 'BDI', name: 'Burundi', currency: 'BIF' },
  { alpha3: 'CPV', name: 'Cabo Verde', currency: 'CVE' },
  { alpha3: 'CMR', name: 'Cameroon', currency: 'XAF' },
  { alpha3: 'CAF', name: 'Central African Republic', currency: 'XAF' },
  { alpha3: 'TCD', name: 'Chad', currency: 'XAF' },
  { alpha3: 'COM', name: 'Comoros', currency: 'KMF' },
  { alpha3: 'COG', name: 'Congo', currency: 'XAF' },
  { alpha3: 'COD', name: 'Democratic Republic of the Congo', currency: 'CDF' },
  { alpha3: 'CIV', name: "Côte d'Ivoire", currency: 'XOF' },
  { alpha3: 'DJI', name: 'Djibouti', currency: 'DJF' },
  { alpha3: 'EGY', name: 'Egypt', currency: 'EGP' },
  { alpha3: 'GNQ', name: 'Equatorial Guinea', currency: 'XAF' },
  { alpha3: 'ERI', name: 'Eritrea', currency: 'ERN' },
  { alpha3: 'SWZ', name: 'Eswatini', currency: 'SZL' },
  { alpha3: 'ETH', name: 'Ethiopia', currency: 'ETB' },
  { alpha3: 'GAB', name: 'Gabon', currency: 'XAF' },
  { alpha3: 'GMB', name: 'Gambia', currency: 'GMD' },
  { alpha3: 'GHA', name: 'Ghana', currency: 'GHS' },
  { alpha3: 'GIN', name: 'Guinea', currency: 'GNF' },
  { alpha3: 'GNB', name: 'Guinea-Bissau', currency: 'XOF' },
  { alpha3: 'KEN', name: 'Kenya', currency: 'KES' },
  { alpha3: 'LSO', name: 'Lesotho', currency: 'LSL' },
  { alpha3: 'LBR', name: 'Liberia', currency: 'LRD' },
  { alpha3: 'LBY', name: 'Libya', currency: 'LYD' },
  { alpha3: 'MDG', name: 'Madagascar', currency: 'MGA' },
  { alpha3: 'MWI', name: 'Malawi', currency: 'MWK' },
  { alpha3: 'MLI', name: 'Mali', currency: 'XOF' },
  { alpha3: 'MRT', name: 'Mauritania', currency: 'MRU' },
  { alpha3: 'MUS', name: 'Mauritius', currency: 'MUR' },
  { alpha3: 'MYT', name: 'Mayotte', currency: 'EUR' },
  { alpha3: 'MAR', name: 'Morocco', currency: 'MAD' },
  { alpha3: 'MOZ', name: 'Mozambique', currency: 'MZN' },
  { alpha3: 'NAM', name: 'Namibia', currency: 'NAD' },
  { alpha3: 'NER', name: 'Niger', currency: 'XOF' },
  { alpha3: 'NGA', name: 'Nigeria', currency: 'NGN' },
  { alpha3: 'REU', name: 'Réunion', currency: 'EUR' },
  { alpha3: 'RWA', name: 'Rwanda', currency: 'RWF' },
  { alpha3: 'STP', name: 'São Tomé and Príncipe', currency: 'STN' },
  { alpha3: 'SHN', name: 'Saint Helena', currency: 'SHP' },
  { alpha3: 'SEN', name: 'Senegal', currency: 'XOF' },
  { alpha3: 'SYC', name: 'Seychelles', currency: 'SCR' },
  { alpha3: 'SLE', name: 'Sierra Leone', currency: 'SLE' },
  { alpha3: 'SOM', name: 'Somalia', currency: 'SOS' },
  { alpha3: 'ZAF', name: 'South Africa', currency: 'ZAR' },
  { alpha3: 'SSD', name: 'South Sudan', currency: 'SSP' },
  { alpha3: 'SDN', name: 'Sudan', currency: 'SDG' },
  { alpha3: 'TZA', name: 'Tanzania', currency: 'TZS' },
  { alpha3: 'TGO', name: 'Togo', currency: 'XOF' },
  { alpha3: 'TUN', name: 'Tunisia', currency: 'TND' },
  { alpha3: 'UGA', name: 'Uganda', currency: 'UGX' },
  { alpha3: 'ESH', name: 'Western Sahara', currency: 'MAD' },
  { alpha3: 'ZMB', name: 'Zambia', currency: 'ZMW' },
  { alpha3: 'ZWE', name: 'Zimbabwe', currency: 'ZWL' },
];

export const MOBILE_MONEY_COUNTRY_OPTIONS: MobileMoneyCountryOption[] = [...UNSORTED].sort((a, b) =>
  a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }),
);
