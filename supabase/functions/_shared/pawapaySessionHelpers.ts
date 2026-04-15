/** Human-readable message from POST /v1/widget/sessions or legacy error JSON. */
export function pawapayInitiationErrorMessage(ppData: unknown): string {
  const o = ppData as {
    failureReason?: { failureMessage?: string };
    message?: string;
    errorMessage?: string;
  };
  const fm = o.failureReason?.failureMessage;
  if (typeof fm === "string" && fm.trim()) return fm.trim();
  if (typeof o.errorMessage === "string" && o.errorMessage.trim()) return o.errorMessage.trim();
  if (typeof o.message === "string" && o.message.trim()) return o.message.trim();
  try {
    return JSON.stringify(ppData);
  } catch {
    return "Pawapay payment page failed";
  }
}

/**
 * PawaPay Payment Page (v1): POST /v1/widget/sessions (“Deposit via Payment Page” in docs).
 * @see https://docs.pawapay.io/v1/api-reference/payment-page/deposit-via-payment-page
 * Only documented CreateSession properties are sent (camelCase: depositId, returnUrl, country, amount, …).
 */
export type PawapayV1SessionMetadataItem = {
  fieldName: string;
  fieldValue: string;
  isPII?: boolean;
};

export type PawapayV1CreateSessionBody = {
  depositId: string;
  returnUrl: string;
  /** ISO 3166-1 alpha-3. Omit so the Payment Page lets the customer pick any configured country. */
  country?: string;
  /** Required by schema to be a string (not a JSON number). */
  amount?: string;
  reason?: string;
  statementDescription?: string;
  language?: "EN" | "FR";
  metadata?: PawapayV1SessionMetadataItem[];
};

export function buildPawapayV1CreateSessionPayload(input: PawapayV1CreateSessionBody): Record<string, unknown> {
  const o: Record<string, unknown> = {
    depositId: input.depositId,
    returnUrl: input.returnUrl,
  };
  const cc = input.country?.trim().toUpperCase() ?? "";
  if (cc.length > 0) {
    if (cc.length !== 3 || !/^[A-Z]{3}$/.test(cc)) {
      throw new Error("PawaPay country must be ISO 3166-1 alpha-3 when set");
    }
    o.country = cc;
  }
  if (input.amount !== undefined && input.amount !== "") o.amount = input.amount;
  if (input.reason !== undefined && input.reason.length >= 1) o.reason = input.reason;
  if (input.statementDescription) o.statementDescription = input.statementDescription;
  if (input.language) o.language = input.language;
  if (input.metadata?.length) o.metadata = input.metadata.slice(0, 10);
  return o;
}

export async function postPawapayV1WidgetSession(
  baseUrl: string,
  apiToken: string,
  body: PawapayV1CreateSessionBody,
): Promise<Response> {
  const root = baseUrl.replace(/\/+$/, "");
  const url = `${root}/v1/widget/sessions`;
  return await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify(buildPawapayV1CreateSessionPayload(body)),
  });
}

/** PawaPay CreateSession schema: reason maxLength 50 (OpenAPI v2). */
export const PAWAPAY_REASON_MAX_LEN = 50;

/** Stay under common redirect URL limits; optional query is dropped if needed. */
export const PAWAPAY_RETURN_URL_MAX_LEN = 2048;

export function clampPawapayPaymentReason(text: string): string {
  const oneLine = text.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
  return oneLine.slice(0, PAWAPAY_REASON_MAX_LEN);
}

function isLocalHostname(host: string): boolean {
  const h = host.toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h.endsWith(".local");
}

/** Settlement / display currency for amounts & Payment Page reason text (e.g. XOF for FCFA). */
export function getPawapayLocalCurrencyLabel(): string {
  return (Deno.env.get("PAWAPAY_LOCAL_CURRENCY")?.trim() || "XOF").toUpperCase();
}

/**
 * USD → settlement currency. Set PAWAPAY_USD_TO_LOCAL_RATE explicitly (e.g. 655 for XOF).
 * If unset and PAWAPAY_LOCAL_CURRENCY=XOF, defaults to 655.
 */
export function getPawapayUsdToLocalRate(): number {
  const explicit = Deno.env.get("PAWAPAY_USD_TO_LOCAL_RATE")?.trim();
  if (explicit !== undefined && explicit !== "") {
    const r = parseFloat(explicit);
    if (Number.isFinite(r) && r > 0) return r;
    throw new Error("Invalid PAWAPAY_USD_TO_LOCAL_RATE");
  }
  if (getPawapayLocalCurrencyLabel() === "XOF") return 655;
  return 1;
}

/**
 * MMO-specific decimal places (0–3). Default 2.
 * Set PAWAPAY_AMOUNT_DECIMAL_PLACES when needed for non–zero-decimal currencies.
 */
function parsePawapayAmountDecimalPlaces(): number {
  const raw = Deno.env.get("PAWAPAY_AMOUNT_DECIMAL_PLACES")?.trim();
  if (raw !== undefined && raw !== "") {
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 0 && n <= 3) return n;
  }
  return 2;
}

/** PawaPay: currencies with 0 minor units (and TND=3) per ISO 4217 / corridor rules. */
export function pawapayMinorDecimalPlacesForCurrency(currency: string): number {
  const c = currency.trim().toUpperCase();
  if (
    c === "XOF" || c === "XAF" || c === "BIF" || c === "DJF" || c === "GNF" || c === "KMF" || c === "RWF" ||
    c === "UGX"
  ) {
    return 0;
  }
  if (c === "TND") return 3;
  return parsePawapayAmountDecimalPlaces();
}

/**
 * Single-line Payment Page `reason` (max 50 chars). Uses settlement amounts so currency codes are not truncated mid-word.
 */
function formatLocalAmountForReason(n: number, localCurrencyLabel: string): string {
  const dp = pawapayMinorDecimalPlacesForCurrency(localCurrencyLabel);
  if (dp === 0) return String(Math.round(n));
  const mult = 10 ** dp;
  const v = Math.round(n * mult) / mult;
  return v.toFixed(dp);
}

export function pawapayTicketPaymentReason(
  usdSubtotal: number,
  usdTotal: number,
  rate: number,
  localCurrencyLabel: string,
): string {
  const c = localCurrencyLabel.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6) || "XOF";
  const subL = usdSubtotal * rate;
  const totL = usdTotal * rate;
  const fs = formatLocalAmountForReason(subL, localCurrencyLabel);
  const ft = formatLocalAmountForReason(totL, localCurrencyLabel);
  const candidates = [
    `Subtotal ${fs} ${c}, total ${ft} ${c}`,
    `Total ${ft} ${c} incl. fees`,
    `Pay ${ft} ${c} · Dreemystar`,
  ];
  for (const line of candidates) {
    const one = line.replace(/\s+/g, " ").trim();
    if (one.length <= PAWAPAY_REASON_MAX_LEN) return one;
  }
  return clampPawapayPaymentReason(`Pay ${ft} ${c}`);
}

/** Tip line: settlement amount + short label, within reason max length. */
export function pawapayTipPaymentReason(
  usdAmount: number,
  rate: number,
  localCurrencyLabel: string,
  artistShort: string,
): string {
  const c = localCurrencyLabel.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6) || "XOF";
  const loc = usdAmount * rate;
  const locStr = formatLocalAmountForReason(loc, localCurrencyLabel);
  const base = `Tip ${locStr} ${c} · ${artistShort}`.replace(/\s+/g, " ").trim();
  return clampPawapayPaymentReason(base);
}

/**
 * `siteTotal` is in USD (dollars, not cents). Uses `rateOverride` when set (e.g. ticket checkout FX); otherwise getPawapayUsdToLocalRate().
 * XOF/XAF: whole units only (PawaPay INVALID_AMOUNT if fractional).
 */
export function formatPawapayAmountFromSiteTotal(siteTotal: number, rateOverride?: number): string {
  const rate =
    rateOverride !== undefined && Number.isFinite(rateOverride) && rateOverride > 0
      ? rateOverride
      : getPawapayUsdToLocalRate();
  const scaled = siteTotal * rate;
  if (!Number.isFinite(scaled) || scaled < 0) {
    throw new Error("Invalid amount for PawaPay");
  }

  const dp = pawapayMinorDecimalPlacesForCurrency(getPawapayLocalCurrencyLabel());
  if (dp === 0) {
    const n = Math.round(scaled);
    if (n < 0) throw new Error("Invalid amount for PawaPay");
    return String(n);
  }

  const mult = 10 ** dp;
  const v = Math.round(scaled * mult) / mult;
  if (!Number.isFinite(v) || v < 0) {
    throw new Error("Invalid amount for PawaPay");
  }
  if (dp === 2) {
    return v.toFixed(2);
  }
  let s = v.toFixed(dp);
  if (s.includes(".")) {
    s = s.replace(/\.?0+$/, "");
  }
  return s;
}

/** If primary URL is too long (e.g. huge returnPath), use the shorter variant without optional query. */
export function fitPawapayReturnUrl(primary: string, withoutOptionalQuery: string): string {
  if (primary.length <= PAWAPAY_RETURN_URL_MAX_LEN) return primary;
  if (withoutOptionalQuery.length <= PAWAPAY_RETURN_URL_MAX_LEN) return withoutOptionalQuery;
  console.error(
    "[pawapay] returnUrl still exceeds max length after dropping optional query; check SITE_URL / PAWAPAY_RETURN_URL_BASE",
  );
  return withoutOptionalQuery.slice(0, PAWAPAY_RETURN_URL_MAX_LEN);
}

/**
 * Public base URL for payment-page `returnUrl` (no trailing slash).
 * Order: PAWAPAY_RETURN_URL_BASE (origin + optional path) → PAWAPAY_RETURN_URL_ORIGIN → SITE_URL.
 */
export function resolvePawapayReturnBase(): string {
  const raw =
    Deno.env.get("PAWAPAY_RETURN_URL_BASE")?.trim() ||
    Deno.env.get("PAWAPAY_RETURN_URL_ORIGIN")?.trim() ||
    Deno.env.get("SITE_URL")?.trim() ||
    "https://prodreemystar.netlify.app";
  let s = raw;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new Error(
      "Invalid SITE_URL / PAWAPAY_RETURN_URL_BASE / PAWAPAY_RETURN_URL_ORIGIN (must be a full URL, e.g. https://app.example.com)",
    );
  }
  if (u.username || u.password) {
    throw new Error("Return URL settings must not include credentials");
  }
  let href = u.href;
  if (u.protocol === "http:" && !isLocalHostname(u.hostname)) {
    href = u.href.replace(/^http:/i, "https:");
  }
  const n = new URL(href);
  if (n.protocol !== "https:" && n.protocol !== "http:") {
    throw new Error("Return URL must use http or https");
  }
  const path = n.pathname.replace(/\/+$/, "");
  if (path && path !== "/") {
    return `${n.origin}${path}`;
  }
  return n.origin;
}

/** Canonical `href` for PawaPay (strict URI validators). */
export function normalizePawapayReturnUrl(returnUrl: string): string {
  try {
    const u = new URL(returnUrl);
    if (u.protocol === "http:" && !isLocalHostname(u.hostname)) {
      return new URL(returnUrl.replace(/^http:/i, "https:")).href;
    }
    return u.href;
  } catch {
    throw new Error("Invalid returnUrl built for PawaPay session");
  }
}

/** @deprecated use resolvePawapayReturnBase */
export function resolvePawapayReturnOrigin(): string {
  return resolvePawapayReturnBase();
}
