import { supabase } from '../lib/supabaseClient';
import { extractFunctionError } from './ticketUtils';

export type PawapayPaymentResponse = {
  url?: string;
  deposit_id?: string;
  error?: string;
};

export async function startPawapayTicketCheckout(body: Record<string, unknown>): Promise<PawapayPaymentResponse> {
  const { data, error } = await supabase.functions.invoke('create-pawapay-payment', { body });
  if (error) {
    return { error: await extractFunctionError(error) };
  }
  if (data?.error) {
    return { error: typeof data.error === 'string' ? data.error : 'Payment could not be started.' };
  }
  if (!data?.url) {
    return { error: 'Invalid response from payment service.' };
  }
  return { url: data.url as string, deposit_id: data.deposit_id as string | undefined };
}

export async function startPawapayTipCheckout(body: Record<string, unknown>): Promise<PawapayPaymentResponse> {
  const { data, error } = await supabase.functions.invoke('create-tip-pawapay-payment', { body });
  if (error) {
    return { error: await extractFunctionError(error) };
  }
  if (data?.error) {
    return { error: typeof data.error === 'string' ? data.error : 'Payment could not be started.' };
  }
  if (!data?.url) {
    return { error: 'Invalid response from payment service.' };
  }
  return { url: data.url as string, deposit_id: data.deposit_id as string | undefined };
}
