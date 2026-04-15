import { supabase } from '../lib/supabaseClient';

/** Legacy v2-style envelope (if still returned by any path). */
export type PawapayDepositStatusPayload = {
  status?: string;
  data?: {
    status?: string;
    failureReason?: { failureCode?: string; failureMessage?: string };
  };
};

/**
 * v1 GET /deposits/{depositId} returns Deposit[] (0 or 1 row).
 * @see https://docs.pawapay.io/v1/api-reference/deposits/check-deposit-status
 */
export function isPawapayDepositStatusFailed(payload: unknown): boolean {
  if (Array.isArray(payload)) {
    const first = payload[0];
    if (first && typeof first === 'object' && first !== null && 'status' in first) {
      return String((first as { status: unknown }).status).toUpperCase() === 'FAILED';
    }
    return false;
  }
  if (!payload || typeof payload !== 'object') return false;
  const o = payload as PawapayDepositStatusPayload;
  const top = (o.status ?? '').toUpperCase();
  const inner = (o.data?.status ?? '').toUpperCase();
  return top === 'FOUND' && inner === 'FAILED';
}

export async function checkPawapayDepositStatus(depositId: string): Promise<unknown | null> {
  const trimmed = depositId.trim();
  if (!trimmed) return null;

  const { data, error } = await supabase.functions.invoke('check-pawapay-deposit-status', {
    body: { depositId: trimmed },
  });

  if (error) return null;
  if (data === null || data === undefined) return null;
  if (typeof data === 'object' && !Array.isArray(data) && typeof (data as Record<string, unknown>).error === 'string') {
    return null;
  }

  return data;
}
