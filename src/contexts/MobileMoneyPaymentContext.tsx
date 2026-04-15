import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export type MobileMoneyPaymentState = {
  loaded: boolean;
  mobileMoneyEnabled: boolean;
  pawapayEnabled: boolean;
  dusupayEnabled: boolean;
  refresh: () => Promise<void>;
};

const defaultState: MobileMoneyPaymentState = {
  loaded: false,
  mobileMoneyEnabled: false,
  pawapayEnabled: false,
  dusupayEnabled: false,
  refresh: async () => {},
};

const MobileMoneyPaymentContext = createContext<MobileMoneyPaymentState>(defaultState);

function configTruthy(v: unknown): boolean {
  return v === true || v === 'true';
}

export const MobileMoneyPaymentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [loaded, setLoaded] = useState(false);
  const [mobileMoneyEnabled, setMobileMoneyEnabled] = useState(false);
  const [pawapayEnabled, setPawapayEnabled] = useState(false);
  const [dusupayEnabled, setDusupayEnabled] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_mobile_money_payment_flags');

      if (!rpcError && rpcData && typeof rpcData === 'object' && !Array.isArray(rpcData)) {
        const row = rpcData as Record<string, unknown>;
        setMobileMoneyEnabled(configTruthy(row.mobile_money_payments_enabled));
        setPawapayEnabled(configTruthy(row.pawapay_enabled));
        setDusupayEnabled(configTruthy(row.dusupay_enabled));
        return;
      }

      if (rpcError) {
        console.warn('MobileMoneyPaymentContext: RPC get_mobile_money_payment_flags failed, falling back to app_config', rpcError);
      }

      const { data, error } = await supabase
        .from('app_config')
        .select('key, value')
        .in('key', ['mobile_money_payments_enabled', 'pawapay_enabled', 'dusupay_enabled']);

      if (error) {
        console.warn('MobileMoneyPaymentContext: app_config select failed', error);
        setMobileMoneyEnabled(false);
        setPawapayEnabled(false);
        setDusupayEnabled(false);
        return;
      }

      const map = new Map((data ?? []).map((r) => [r.key, r.value]));
      setMobileMoneyEnabled(configTruthy(map.get('mobile_money_payments_enabled')));
      setPawapayEnabled(configTruthy(map.get('pawapay_enabled')));
      setDusupayEnabled(configTruthy(map.get('dusupay_enabled')));
    } catch (e) {
      console.warn('MobileMoneyPaymentContext: unexpected error', e);
      setMobileMoneyEnabled(false);
      setPawapayEnabled(false);
      setDusupayEnabled(false);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      loaded,
      mobileMoneyEnabled,
      pawapayEnabled,
      dusupayEnabled,
      refresh,
    }),
    [loaded, mobileMoneyEnabled, pawapayEnabled, dusupayEnabled, refresh],
  );

  return (
    <MobileMoneyPaymentContext.Provider value={value}>
      {children}
    </MobileMoneyPaymentContext.Provider>
  );
};

export function useMobileMoneyPayments(): MobileMoneyPaymentState {
  return useContext(MobileMoneyPaymentContext);
}

/** True when any mobile-money provider should appear in checkout UI. */
export function useMobileMoneyCheckoutVisible(): boolean {
  const { loaded, mobileMoneyEnabled, pawapayEnabled, dusupayEnabled } = useMobileMoneyPayments();
  return loaded && mobileMoneyEnabled && (pawapayEnabled || dusupayEnabled);
}

/**
 * Hosted PawaPay Payment Page lets the customer pick country and operator; the orchestrator must not
 * receive countryCode+mobileOperator or it skips the Payment Page and routes by capability cache instead.
 * Wallet fields are only required when DusuPay is enabled and PawaPay is not (DusuPay needs a fixed corridor).
 */
export function useMobileMoneyNeedsWalletFields(): boolean {
  const { loaded, mobileMoneyEnabled, pawapayEnabled, dusupayEnabled } = useMobileMoneyPayments();
  if (!loaded || !mobileMoneyEnabled) return false;
  if (pawapayEnabled) return false;
  return dusupayEnabled;
}
