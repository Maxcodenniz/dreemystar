import { supabase } from '../lib/supabaseClient';
import { extractFunctionError } from './ticketUtils';
import {
  stashPawapayTicketCheckoutContext,
  stashPawapayTipContext,
} from './pawapayCheckoutContext';

export type MobileMoneyPaymentResponse = {
  url?: string;
  deposit_id?: string;
  merchant_ref?: string;
  tipId?: string;
  error?: string;
};

export async function startMobileMoneyTicketCheckout(
  body: Record<string, unknown>,
): Promise<MobileMoneyPaymentResponse> {
  const { data, error } = await supabase.functions.invoke('create-mobile-money-payment', { body });
  if (error) {
    return { error: await extractFunctionError(error) };
  }
  if (data?.error) {
    return { error: typeof data.error === 'string' ? data.error : 'Payment could not be started.' };
  }
  if (!data?.url) {
    return { error: 'Invalid response from payment service.' };
  }
  const depositId = typeof data.deposit_id === 'string' ? data.deposit_id : undefined;
  if (depositId) {
    stashPawapayTicketCheckoutContext(depositId, body);
  }
  return {
    url: data.url as string,
    deposit_id: depositId,
    merchant_ref: data.merchant_ref as string | undefined,
  };
}

export async function startMobileMoneyTipCheckout(
  body: Record<string, unknown>,
): Promise<MobileMoneyPaymentResponse> {
  const { data, error } = await supabase.functions.invoke('create-tip-mobile-money-payment', { body });
  if (error) {
    return { error: await extractFunctionError(error) };
  }
  if (data?.error) {
    return { error: typeof data.error === 'string' ? data.error : 'Payment could not be started.' };
  }
  if (!data?.url) {
    return { error: 'Invalid response from payment service.' };
  }
  const depositId = typeof data.deposit_id === 'string' ? data.deposit_id : undefined;
  const tipId = typeof (data as { tipId?: string }).tipId === 'string' ? (data as { tipId: string }).tipId : undefined;
  if (depositId && tipId) {
    stashPawapayTipContext(depositId, tipId);
  }
  return {
    url: data.url as string,
    deposit_id: depositId,
    merchant_ref: data.merchant_ref as string | undefined,
    tipId,
  };
}
