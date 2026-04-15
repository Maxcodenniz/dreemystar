import { describe, expect, it } from "vitest";
import { MobileMoneyTemporarilyUnavailableError, UnsupportedOperatorOrCountryError } from "./errors.ts";
import {
  getMobileMoneyProvider,
  isCountrySupported,
  isOperatorSupported,
} from "./router.ts";
import type { MobileMoneyCapabilityCache } from "./types.ts";
import type { CapabilityFreshness } from "./types.ts";

const freshBoth: CapabilityFreshness = { pawapayFresh: true, dusupayFresh: true, nowMs: Date.now() };
const staleBoth: CapabilityFreshness = { pawapayFresh: false, dusupayFresh: false, nowMs: Date.now() };

const togglesAllOn = {
  mobileMoneyEnabled: true,
  isPawaPayEnabled: true,
  isDusuPayEnabled: true,
};

function baseCache(over: Partial<MobileMoneyCapabilityCache> = {}): MobileMoneyCapabilityCache {
  return {
    pawapay: { GH: ["MTN", "Vodafone"] },
    dusupay: { GH: ["MTN", "Airtel"] },
    dusupayProviderCodes: { GH: { MTN: "mtn_gh", AIRTEL: "airtel_gh" } },
    ...over,
  };
}

describe("isCountrySupported / isOperatorSupported", () => {
  const cache = baseCache();

  it("detects country on PawaPay", () => {
    expect(isCountrySupported("pawapay", "GH", cache)).toBe(true);
    expect(isCountrySupported("pawapay", "ZZ", cache)).toBe(false);
  });

  it("detects operator on DusuPay", () => {
    expect(isOperatorSupported("dusupay", "GH", "MTN", cache)).toBe(true);
    expect(isOperatorSupported("dusupay", "GH", "Orange", cache)).toBe(false);
  });
});

describe("getMobileMoneyProvider", () => {
  it("a) both enabled, PawaPay supports → PawaPay", () => {
    expect(
      getMobileMoneyProvider("GH", "MTN", togglesAllOn, baseCache(), freshBoth),
    ).toBe("pawapay");
  });

  it("b) both enabled, PawaPay unsupported → DusuPay", () => {
    const cache = baseCache({
      pawapay: { GH: ["Vodafone"] },
      dusupay: { GH: ["MTN", "Vodafone"] },
    });
    expect(getMobileMoneyProvider("GH", "MTN", togglesAllOn, cache, freshBoth)).toBe("dusupay");
  });

  it("c) only PawaPay enabled, supports → PawaPay", () => {
    expect(
      getMobileMoneyProvider(
        "GH",
        "MTN",
        { mobileMoneyEnabled: true, isPawaPayEnabled: true, isDusuPayEnabled: false },
        baseCache(),
        freshBoth,
      ),
    ).toBe("pawapay");
  });

  it("c2) only PawaPay enabled, unsupported → error message", () => {
    expect(() =>
      getMobileMoneyProvider(
        "GH",
        "Orange",
        { mobileMoneyEnabled: true, isPawaPayEnabled: true, isDusuPayEnabled: false },
        baseCache(),
        freshBoth,
      ),
    ).toThrow(UnsupportedOperatorOrCountryError);
  });

  it("d) only DusuPay enabled, supports → DusuPay", () => {
    expect(
      getMobileMoneyProvider(
        "GH",
        "Airtel",
        { mobileMoneyEnabled: true, isPawaPayEnabled: false, isDusuPayEnabled: true },
        baseCache(),
        freshBoth,
      ),
    ).toBe("dusupay");
  });

  it("e) neither aggregator enabled → temporarily unavailable", () => {
    expect(() =>
      getMobileMoneyProvider(
        "GH",
        "MTN",
        { mobileMoneyEnabled: true, isPawaPayEnabled: false, isDusuPayEnabled: false },
        baseCache(),
        freshBoth,
      ),
    ).toThrow(MobileMoneyTemporarilyUnavailableError);
  });

  it("e2) master mobile money off → temporarily unavailable", () => {
    expect(() =>
      getMobileMoneyProvider(
        "GH",
        "MTN",
        { mobileMoneyEnabled: false, isPawaPayEnabled: true, isDusuPayEnabled: true },
        baseCache(),
        freshBoth,
      ),
    ).toThrow(MobileMoneyTemporarilyUnavailableError);
  });

  it("f) unsupported operator (both on)", () => {
    expect(() =>
      getMobileMoneyProvider("GH", "Orange", togglesAllOn, baseCache(), freshBoth),
    ).toThrow(UnsupportedOperatorOrCountryError);
  });

  it("g) unsupported country (no operators for ISO2)", () => {
    const cache = baseCache({ pawapay: { KE: ["Safaricom"] }, dusupay: { KE: ["Safaricom"] } });
    expect(() =>
      getMobileMoneyProvider("GH", "MTN", togglesAllOn, cache, freshBoth),
    ).toThrow(UnsupportedOperatorOrCountryError);
  });

  it("h) cache empty or stale → temporarily unavailable when both toggled on", () => {
    const emptyMaps: MobileMoneyCapabilityCache = {
      pawapay: {},
      dusupay: {},
      dusupayProviderCodes: {},
    };
    expect(() =>
      getMobileMoneyProvider("GH", "MTN", togglesAllOn, emptyMaps, freshBoth),
    ).toThrow(MobileMoneyTemporarilyUnavailableError);

    expect(() =>
      getMobileMoneyProvider("GH", "MTN", togglesAllOn, baseCache(), staleBoth),
    ).toThrow(MobileMoneyTemporarilyUnavailableError);
  });

  it("PawaPay default: when both support same pair, returns PawaPay", () => {
    const cache = baseCache({
      pawapay: { GH: ["MTN"] },
      dusupay: { GH: ["MTN"] },
    });
    expect(getMobileMoneyProvider("GH", "MTN", togglesAllOn, cache, freshBoth)).toBe("pawapay");
  });
});
