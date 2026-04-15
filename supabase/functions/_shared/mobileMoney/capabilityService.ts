import type { CapabilityFreshness, CapabilitySnapshotRow, MobileMoneyCapabilityCache } from "./types.ts";
import { CAPABILITY_TTL_MS } from "./types.ts";
import { buildFreshness, rowToCapabilityCache } from "./cache.ts";

// deno-lint-ignore no-explicit-any
export async function loadCapabilityState(supabase: any): Promise<{
  cache: MobileMoneyCapabilityCache;
  freshness: CapabilityFreshness;
  warnings: string[];
}> {
  const warnings: string[] = [];
  const { data, error } = await supabase
    .from("mobile_money_capability_snapshots")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    warnings.push(`Capability snapshot read failed: ${error.message}`);
  }

  const row = (data ?? {
    pawapay: {},
    dusupay: {},
    dusupay_provider_codes: {},
    pawapay_fetched_at: null,
    dusupay_fetched_at: null,
  }) as CapabilitySnapshotRow;

  const nowMs = Date.now();
  const freshness = buildFreshness(row, nowMs, CAPABILITY_TTL_MS);
  const cache = rowToCapabilityCache(row);

  if (!freshness.pawapayFresh) {
    warnings.push("PawaPay capability cache is stale or missing; provider treated as unavailable.");
  }
  if (!freshness.dusupayFresh) {
    warnings.push("DusuPay capability cache is stale or missing; provider treated as unavailable.");
  }

  return { cache, freshness, warnings };
}
