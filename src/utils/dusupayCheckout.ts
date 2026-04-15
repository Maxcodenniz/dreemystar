import { supabase } from '../lib/supabaseClient';
import { extractFunctionError } from './ticketUtils';

export type DusupayPaymentResponse = {
  url?: string;
  merchant_ref?: string;
  error?: string;
};

export async function startDusupayTicketCheckout(body: Record<string, unknown>): Promise<DusupayPaymentResponse> {
  const { data, error } = await supabase.functions.invoke('create-dusupay-payment', { body });
  if (error) {
    return { error: await extractFunctionError(error) };
  }
  if (data?.error) {
    return { error: typeof data.error === 'string' ? data.error : 'Payment could not be started.' };
  }
  if (!data?.url) {
    return { error: 'Invalid response from payment service.' };
  }
  return { url: data.url as string, merchant_ref: data.merchant_ref as string | undefined };
}

export async function startDusupayTipCheckout(body: Record<string, unknown>): Promise<DusupayPaymentResponse> {
  const { data, error } = await supabase.functions.invoke('create-tip-dusupay-payment', { body });
  if (error) {
    return { error: await extractFunctionError(error) };
  }
  if (data?.error) {
    return { error: typeof data.error === 'string' ? data.error : 'Payment could not be started.' };
  }
  if (!data?.url) {
    return { error: 'Invalid response from payment service.' };
  }
  return { url: data.url as string, merchant_ref: data.merchant_ref as string | undefined };
}
