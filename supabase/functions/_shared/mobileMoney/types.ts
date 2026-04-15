/** Aggregators supported by the orchestration layer. */
export type MobileMoneyAggregator = "pawapay" | "dusupay";

/** ISO 3166-1 alpha-2 → list of supported operator display keys (e.g. MTN, Vodafone). */
export type CountryOperatorsMap = Record<string, string[]>;

/** Normalized capability snapshot used by the router (no hardcoded country lists). */
export interface MobileMoneyCapabilityCache {
  /** null = treat provider as unavailable (empty or explicitly cleared). */
  pawapay: CountryOperatorsMap | null;
  dusupay: CountryOperatorsMap | null;
  /** ISO2 → normalizeOperatorKey(operator) → DusuPay `provider_code` */
  dusupayProviderCodes: Record<string, Record<string, string>>;
}

/** Whether each provider’s cache row is within TTL. */
export interface CapabilityFreshness {
  pawapayFresh: boolean;
  dusupayFresh: boolean;
  nowMs: number;
}

/** Admin / app_config toggles (manual). */
export interface AdminToggles {
  mobileMoneyEnabled: boolean;
  isPawaPayEnabled: boolean;
  isDusuPayEnabled: boolean;
}

/** Default TTL: 24 hours (ms). */
export const CAPABILITY_TTL_MS = 24 * 60 * 60 * 1000;

/** DB row shape for `mobile_money_capability_snapshots`. */
export interface CapabilitySnapshotRow {
  pawapay: unknown;
  dusupay: unknown;
  dusupay_provider_codes: unknown;
  pawapay_fetched_at: string | null;
  dusupay_fetched_at: string | null;
}
