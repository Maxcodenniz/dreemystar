/** Base error for mobile money orchestration. */
export class MobileMoneyError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "MobileMoneyError";
    this.code = code;
  }
}

/** Both providers disabled, master off, or no usable (fresh) capability data. */
export class MobileMoneyTemporarilyUnavailableError extends MobileMoneyError {
  constructor(message = "Mobile Money is temporarily unavailable") {
    super("TEMP_UNAVAILABLE", message);
    this.name = "MobileMoneyTemporarilyUnavailableError";
  }
}

/** Country/operator not supported by any enabled & fresh provider that can take the payment. */
export class UnsupportedOperatorOrCountryError extends MobileMoneyError {
  constructor(
    message = "Mobile Money not supported for this operator in your country",
  ) {
    super("UNSUPPORTED_OPERATOR", message);
    this.name = "UnsupportedOperatorOrCountryError";
  }
}

/** Cache missing or past TTL for a provider (informational; router treats provider as unavailable). */
export class CapabilityCacheStaleError extends MobileMoneyError {
  readonly provider: string;

  constructor(provider: string) {
    super("CACHE_STALE", `Capability cache stale or missing for ${provider}`);
    this.name = "CapabilityCacheStaleError";
    this.provider = provider;
  }
}
