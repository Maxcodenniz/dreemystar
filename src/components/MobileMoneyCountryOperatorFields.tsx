import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  fetchMobileMoneyCapabilities,
  operatorsForCountry,
  type MobileMoneyCapabilitiesPayload,
} from '../utils/mobileMoneyCapabilities';

export type MobileMoneySelection = {
  countryCode: string;
  mobileOperator: string;
};

type Props = {
  value: MobileMoneySelection;
  onChange: (next: MobileMoneySelection) => void;
  disabled?: boolean;
  /** Shown under selects when cache is stale */
  showStaleHint?: boolean;
  /**
   * Controls visibility of loading, error, and selector UI. Parent should pass true when
   * the user chose Mobile Money or when capabilities are known to be available
   * (`payIntent || capabilityAvailable === true`).
   */
  mobileMoneyIntent?: boolean;
  /** Called when the capabilities request finishes (success or error). */
  onCapabilitiesResolved?: (detail: { available: boolean }) => void;
};

function regionLabel(iso2: string): string {
  try {
    const dn = new Intl.DisplayNames(['en'], { type: 'region' });
    return dn.of(iso2) ?? iso2;
  } catch {
    return iso2;
  }
}

export const MobileMoneyCountryOperatorFields: React.FC<Props> = ({
  value,
  onChange,
  disabled,
  showStaleHint = true,
  mobileMoneyIntent = false,
  onCapabilitiesResolved,
}) => {
  const { t } = useTranslation();
  const unavailableLoggedRef = useRef(false);
  const [cap, setCap] = useState<MobileMoneyCapabilitiesPayload | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await fetchMobileMoneyCapabilities();
      if (cancelled) return;
      setLoadErr(error);
      setCap(data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const countries = useMemo(() => cap?.countries ?? [], [cap]);
  const unavailable = Boolean(loadErr || countries.length === 0);

  useEffect(() => {
    if (!loading) {
      onCapabilitiesResolved?.({ available: !unavailable });
    }
  }, [loading, unavailable, onCapabilitiesResolved]);
  const operators = useMemo(
    () => operatorsForCountry(cap, value.countryCode),
    [cap, value.countryCode],
  );

  const staleBoth = cap?.stale.pawapay && cap?.stale.dusupay;

  useEffect(() => {
    if (!value.countryCode && countries.length === 1) {
      onChange({ countryCode: countries[0], mobileOperator: '' });
    }
  }, [countries, value.countryCode, onChange]);

  useEffect(() => {
    if (value.mobileOperator && operators.length && !operators.includes(value.mobileOperator)) {
      onChange({ ...value, mobileOperator: '' });
    }
  }, [operators, value, onChange]);

  if (!mobileMoneyIntent) {
    if (loading || unavailable) {
      return null;
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-400">Loading mobile money options…</p>;
  }
  if (unavailable) {
    if (!unavailableLoggedRef.current) {
      unavailableLoggedRef.current = true;
      if (loadErr) {
        console.warn('[MobileMoneyCountryOperatorFields] get-mobile-money-capabilities failed:', loadErr);
      } else {
        console.warn(
          '[MobileMoneyCountryOperatorFields] Empty capability snapshot (no countries). Invoke refresh-mobile-money-capabilities with valid Edge secrets (PAWAPAY_API_TOKEN + matching PAWAPAY_BASE_URL), then check mobile_money_capability_snapshots row id=1.',
        );
      }
    }
    const userMessage = loadErr
      ? t(
          'mobileMoney.loadOptionsFailed',
          'We could not load Mobile Money options. Try again later or use another payment method.',
        )
      : t(
          'mobileMoney.unavailableNoCorridors',
          'Mobile Money is not available right now. Please use card or another payment method.',
        );
    return <p className="text-sm text-amber-300">{userMessage}</p>;
  }

  return (
    <div className="space-y-3 text-left">
      {showStaleHint && staleBoth && (
        <p className="text-xs text-amber-400">
          Mobile money provider lists may be outdated. Payments may be unavailable until an admin refreshes capabilities.
        </p>
      )}
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1">Country</label>
        <select
          className="w-full rounded-lg bg-gray-800 border border-gray-600 text-white px-3 py-2 text-sm"
          disabled={disabled}
          value={value.countryCode}
          onChange={(e) => onChange({ countryCode: e.target.value, mobileOperator: '' })}
        >
          <option value="">Select country</option>
          {countries.map((c) => (
            <option key={c} value={c}>
              {regionLabel(c)} ({c})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1">Mobile operator</label>
        <select
          className="w-full rounded-lg bg-gray-800 border border-gray-600 text-white px-3 py-2 text-sm"
          disabled={disabled || !value.countryCode}
          value={value.mobileOperator}
          onChange={(e) => onChange({ ...value, mobileOperator: e.target.value })}
        >
          <option value="">Select operator</option>
          {operators.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

export function isMobileMoneySelectionComplete(s: MobileMoneySelection): boolean {
  return s.countryCode.length === 2 && s.mobileOperator.trim().length > 0;
}
