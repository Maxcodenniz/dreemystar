import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const COOKIE_CONSENT_KEY = 'dreemystar_cookie_consent_v1';

const CookieConsentBanner: React.FC = () => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      const stored = window.localStorage.getItem(COOKIE_CONSENT_KEY);
      if (stored !== 'accepted') {
        setVisible(true);
      }
    } catch {
      // If localStorage is not available, show the banner once per session
      setVisible(true);
    }
  }, []);

  const accept = () => {
    try {
      window.localStorage.setItem(COOKIE_CONSENT_KEY, 'accepted');
    } catch {
      // ignore storage errors
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[130] px-4 pb-4 sm:pb-6 pointer-events-none">
      <div className="max-w-4xl mx-auto pointer-events-auto">
        <div className="bg-gradient-to-r from-gray-900/95 via-gray-900/90 to-gray-950/95 border border-white/10 rounded-2xl shadow-2xl px-5 py-4 sm:px-6 sm:py-5 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <p className="text-sm text-gray-100 font-semibold">
              {t('cookieBanner.title')}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {t('cookieBanner.descriptionPrefix')}
              <Link to="/cookies" className="text-purple-300 hover:text-purple-200 underline">
                {t('cookieBanner.cookiePolicy')}
              </Link>{' '}
              {t('cookieBanner.and')}{' '}
              <Link to="/privacy" className="text-purple-300 hover:text-purple-200 underline">
                {t('cookieBanner.privacyPolicy')}
              </Link>
              .
            </p>
          </div>
          <div className="flex items-center gap-3 justify-end">
            <button
              type="button"
              onClick={accept}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-xs sm:text-sm font-semibold text-white hover:from-purple-700 hover:to-pink-700 shadow-md shadow-purple-500/30"
            >
              {t('cookieBanner.accept')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CookieConsentBanner;

