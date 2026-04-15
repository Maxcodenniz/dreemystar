import React, { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Search, Loader2 } from 'lucide-react';
import { fetchFrankfurterUsdRate } from '../utils/frankfurterRate';
import { formatPawapayLocalAmountString, pawapayMinorDecimalPlacesForCurrency } from '../utils/pawapayCurrencyDecimals';
import { ticketPriceUsdBreakdown } from '../utils/ticketUsdBreakdown';
import {
  MOBILE_MONEY_COUNTRY_OPTIONS,
  type MobileMoneyCountryOption,
} from '../data/africanMobileMoneyCountries';

export type { MobileMoneyCountryOption };
export { MOBILE_MONEY_COUNTRY_OPTIONS };

type Props = {
  open: boolean;
  onClose: () => void;
  /**
   * Event list price in USD (before platform uplift). Used with fee breakdown unless `usdTotalOverride` is set.
   */
  eventPriceUsd: number;
  /**
   * When set (e.g. tips), this is the full USD amount to convert — no ticket fee breakdown applied.
   */
  usdTotalOverride?: number;
  onContinue: (payload: {
    paymentCountryAlpha3: string;
    paymentCurrency: string;
    paymentAmount: string;
  }) => Promise<void>;
};

const MODAL_Z = 10050;

const MobileMoneyCountryModal: React.FC<Props> = ({
  open,
  onClose,
  eventPriceUsd,
  usdTotalOverride,
  onContinue,
}) => {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<MobileMoneyCountryOption | null>(null);
  const { t } = useTranslation();
  const [rate, setRate] = useState<number | null>(null);
  const [rateFetchFailed, setRateFetchFailed] = useState(false);
  const [rateLoading, setRateLoading] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);

  const totalUsd = useMemo(() => {
    if (usdTotalOverride !== undefined && Number.isFinite(usdTotalOverride) && usdTotalOverride > 0) {
      return usdTotalOverride;
    }
    return ticketPriceUsdBreakdown(eventPriceUsd).total;
  }, [eventPriceUsd, usdTotalOverride]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setSelected(null);
      setRate(null);
      setRateFetchFailed(false);
      setRateLoading(false);
      setSessionError(null);
      setSessionLoading(false);
    }
  }, [open]);

  useEffect(() => {
    if (!selected) {
      setRate(null);
      setRateFetchFailed(false);
      return;
    }
    let cancelled = false;
    setRateLoading(true);
    setRateFetchFailed(false);
    setRate(null);
    fetchFrankfurterUsdRate(selected.currency)
      .then((r) => {
        if (!cancelled) {
          setRate(r);
          setRateLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRateFetchFailed(true);
          setRateLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return MOBILE_MONEY_COUNTRY_OPTIONS;
    return MOBILE_MONEY_COUNTRY_OPTIONS.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.alpha3.toLowerCase().includes(q) ||
        o.currency.toLowerCase().includes(q),
    );
  }, [query]);

  const localLine =
    selected && rate !== null && !rateFetchFailed
      ? (() => {
          const raw = totalUsd * rate;
          const dp = pawapayMinorDecimalPlacesForCurrency(selected.currency);
          const amountStr = formatPawapayLocalAmountString(raw, selected.currency);
          const num = Number(amountStr);
          const formatted = num.toLocaleString(undefined, {
            minimumFractionDigits: dp === 0 ? 0 : dp,
            maximumFractionDigits: dp === 0 ? 0 : dp,
          });
          return t('mobileMoneyCountryModal.chargedLine', {
            amount: formatted,
            currency: selected.currency,
          });
        })()
      : null;

  const handleContinue = async () => {
    if (!selected || rate === null || rateFetchFailed) return;
    setSessionError(null);
    setSessionLoading(true);
    try {
      const paymentAmount = formatPawapayLocalAmountString(totalUsd * rate, selected.currency);
      await onContinue({
        paymentCountryAlpha3: selected.alpha3,
        paymentCurrency: selected.currency,
        paymentAmount,
      });
    } catch (e) {
      setSessionError(
        e instanceof Error ? e.message : t('mobileMoneyCountryModal.sessionErrorFallback'),
      );
    } finally {
      setSessionLoading(false);
    }
  };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 sm:p-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-4"
      style={{ zIndex: MODAL_Z }}
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl p-5 sm:p-7 max-w-2xl w-full shadow-2xl max-h-[min(92dvh,900px)] sm:max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-xl sm:text-2xl font-bold text-white mb-1 sm:mb-2 leading-snug">
          {t('mobileMoneyCountryModal.title')}
        </h3>
        <p className="text-gray-400 text-sm sm:text-base mb-4 sm:mb-5">
          {t('mobileMoneyCountryModal.subtitle')}
        </p>

        <div className="relative mb-3 sm:mb-4">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('mobileMoneyCountryModal.searchPlaceholder')}
            autoComplete="off"
            className="w-full min-h-[48px] pl-12 pr-4 py-3 text-base sm:text-lg bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain rounded-xl border border-gray-700 bg-gray-800/50 min-h-[200px] max-h-[min(52vh,420px)] sm:max-h-[min(48vh,480px)] mb-4 sm:mb-5">
          {filtered.length === 0 ? (
            <p className="text-gray-400 text-base sm:text-lg p-5">{t('mobileMoneyCountryModal.noResults')}</p>
          ) : (
            <ul className="divide-y divide-gray-700/80">
              {filtered.map((o) => (
                <li key={o.alpha3}>
                  <button
                    type="button"
                    onClick={() => setSelected(o)}
                    className={`w-full text-left px-4 sm:px-5 py-3.5 sm:py-4 text-base sm:text-lg transition-colors min-h-[52px] flex flex-wrap items-baseline gap-x-2 gap-y-0.5 ${
                      selected?.alpha3 === o.alpha3
                        ? 'bg-violet-600/40 text-white'
                        : 'text-gray-200 hover:bg-gray-700/80 active:bg-gray-700'
                    }`}
                  >
                    <span className="font-semibold">{o.name}</span>
                    <span className="text-gray-400 text-sm sm:text-base font-normal">
                      ({o.alpha3}) · {o.currency}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="min-h-[56px] sm:min-h-[60px] mb-4 sm:mb-5 space-y-2">
          {rateLoading && selected ? (
            <p className="text-violet-300 text-base sm:text-lg flex items-center gap-2">
              <Loader2 className="w-5 h-5 shrink-0 animate-spin" /> {t('mobileMoneyCountryModal.loadingRate')}
            </p>
          ) : null}
          {rateFetchFailed ? (
            <p className="text-red-400 text-base sm:text-lg">{t('mobileMoneyCountryModal.rateError')}</p>
          ) : null}
          {localLine && !rateFetchFailed ? (
            <p className="text-green-300 text-base sm:text-lg font-semibold leading-snug">{localLine}</p>
          ) : null}
          {sessionError ? <p className="text-red-400 text-base sm:text-lg">{sessionError}</p> : null}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end sm:gap-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[48px] px-5 py-3 text-base sm:text-lg rounded-xl border border-gray-600 text-gray-200 hover:bg-gray-800 active:bg-gray-800/90"
          >
            {t('mobileMoneyCountryModal.cancel')}
          </button>
          <button
            type="button"
            disabled={
              !selected ||
              rate === null ||
              rateFetchFailed ||
              rateLoading ||
              sessionLoading
            }
            onClick={() => void handleContinue()}
            className="min-h-[48px] px-5 py-3 text-base sm:text-lg rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {sessionLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {t('mobileMoneyCountryModal.processing')}
              </>
            ) : (
              t('mobileMoneyCountryModal.continueToPayment')
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default MobileMoneyCountryModal;
