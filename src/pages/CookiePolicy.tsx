import React from 'react';
import { useTranslation } from 'react-i18next';

const CONTACT_EMAIL = 'contact@dreemystar.com';

const CookiePolicy: React.FC = () => {
  const { t, i18n } = useTranslation();
  const lastUpdated = new Date().toLocaleDateString(i18n.language || 'en', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 pt-24 pb-16 px-6">
      <div className="max-w-4xl mx-auto bg-white/5 border border-white/10 rounded-2xl shadow-2xl p-8 backdrop-blur-xl">
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
          {t('cookiePolicy.title')}
        </h1>
        <p className="text-sm text-gray-400 mb-6">
          {t('cookiePolicy.lastUpdated', { date: lastUpdated })}
        </p>

        <div className="space-y-5 text-gray-300 text-sm leading-relaxed">
          <p>{t('cookiePolicy.intro')}</p>

          <h2 className="text-xl font-semibold text-white mt-4">{t('cookiePolicy.s1Title')}</h2>
          <p>{t('cookiePolicy.s1Body')}</p>

          <h2 className="text-xl font-semibold text-white mt-4">{t('cookiePolicy.s2Title')}</h2>
          <p>{t('cookiePolicy.s2Intro')}</p>
          <ul className="list-disc list-inside space-y-1">
            <li><span className="font-semibold">{t('cookiePolicy.s2Essential')}</span> {t('cookiePolicy.s2EssentialBody')}</li>
            <li><span className="font-semibold">{t('cookiePolicy.s2Performance')}</span> {t('cookiePolicy.s2PerformanceBody')}</li>
            <li><span className="font-semibold">{t('cookiePolicy.s2Preferences')}</span> {t('cookiePolicy.s2PreferencesBody')}</li>
            <li><span className="font-semibold">{t('cookiePolicy.s2Marketing')}</span> {t('cookiePolicy.s2MarketingBody')}</li>
          </ul>

          <h2 className="text-xl font-semibold text-white mt-4">{t('cookiePolicy.s3Title')}</h2>
          <p>{t('cookiePolicy.s3Body')}</p>

          <h2 className="text-xl font-semibold text-white mt-4">{t('cookiePolicy.s4Title')}</h2>
          <p>{t('cookiePolicy.s4Body')}</p>
          <p>{t('cookiePolicy.s4Body2')}</p>

          <h2 className="text-xl font-semibold text-white mt-4">{t('cookiePolicy.s5Title')}</h2>
          <p>{t('cookiePolicy.s5Body')}</p>

          <h2 className="text-xl font-semibold text-white mt-4">{t('cookiePolicy.s6Title')}</h2>
          <p>
            {t('cookiePolicy.s6Body')}{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-purple-300 hover:text-purple-200 underline">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
};

export default CookiePolicy;
