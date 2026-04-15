import React from 'react';
import { useTranslation } from 'react-i18next';

const CONTACT_EMAIL = 'contact@dreemystar.com';

const PrivacyPolicy: React.FC = () => {
  const { t, i18n } = useTranslation();
  const lastUpdated = new Date().toLocaleDateString(i18n.language || 'en', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 pt-24 pb-16 px-6">
      <div className="max-w-4xl mx-auto bg-white/5 border border-white/10 rounded-2xl shadow-2xl p-8 backdrop-blur-xl">
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
          {t('privacyPolicy.title')}
        </h1>
        <p className="text-sm text-gray-400 mb-6">
          {t('privacyPolicy.lastUpdated', { date: lastUpdated })}
        </p>

        <div className="space-y-5 text-gray-300 text-sm leading-relaxed">
          <p>{t('privacyPolicy.intro')}</p>

          <h2 className="text-xl font-semibold text-white mt-4">{t('privacyPolicy.s1Title')}</h2>
          <p>{t('privacyPolicy.s1Intro')}</p>
          <ul className="list-disc list-inside space-y-1">
            <li><span className="font-semibold">{t('privacyPolicy.s1Account')}</span> {t('privacyPolicy.s1AccountBody')}</li>
            <li><span className="font-semibold">{t('privacyPolicy.s1Usage')}</span> {t('privacyPolicy.s1UsageBody')}</li>
            <li><span className="font-semibold">{t('privacyPolicy.s1Payment')}</span> {t('privacyPolicy.s1PaymentBody')}</li>
            <li><span className="font-semibold">{t('privacyPolicy.s1Device')}</span> {t('privacyPolicy.s1DeviceBody')}</li>
          </ul>

          <h2 className="text-xl font-semibold text-white mt-4">{t('privacyPolicy.s2Title')}</h2>
          <p>{t('privacyPolicy.s2Intro')}</p>
          <ul className="list-disc list-inside space-y-1">
            <li>{t('privacyPolicy.s2Li1')}</li>
            <li>{t('privacyPolicy.s2Li2')}</li>
            <li>{t('privacyPolicy.s2Li3')}</li>
            <li>{t('privacyPolicy.s2Li4')}</li>
            <li>{t('privacyPolicy.s2Li5')}</li>
            <li>{t('privacyPolicy.s2Li6')}</li>
          </ul>

          <h2 className="text-xl font-semibold text-white mt-4">{t('privacyPolicy.s3Title')}</h2>
          <p>{t('privacyPolicy.s3Intro')}</p>
          <ul className="list-disc list-inside space-y-1">
            <li><span className="font-semibold">{t('privacyPolicy.s3Providers')}</span> {t('privacyPolicy.s3ProvidersBody')}</li>
            <li><span className="font-semibold">{t('privacyPolicy.s3Artists')}</span> {t('privacyPolicy.s3ArtistsBody')}</li>
            <li><span className="font-semibold">{t('privacyPolicy.s3Legal')}</span> {t('privacyPolicy.s3LegalBody')}</li>
          </ul>

          <h2 className="text-xl font-semibold text-white mt-4">{t('privacyPolicy.s4Title')}</h2>
          <p>{t('privacyPolicy.s4Body')}</p>

          <h2 className="text-xl font-semibold text-white mt-4">{t('privacyPolicy.s5Title')}</h2>
          <p>{t('privacyPolicy.s5Intro')}</p>
          <ul className="list-disc list-inside space-y-1">
            <li>{t('privacyPolicy.s5Li1')}</li>
            <li>{t('privacyPolicy.s5Li2')}</li>
            <li>{t('privacyPolicy.s5Li3')}</li>
            <li>{t('privacyPolicy.s5Li4')}</li>
          </ul>

          <h2 className="text-xl font-semibold text-white mt-4">{t('privacyPolicy.s6Title')}</h2>
          <p>{t('privacyPolicy.s6Body')}</p>

          <h2 className="text-xl font-semibold text-white mt-4">{t('privacyPolicy.s7Title')}</h2>
          <p>{t('privacyPolicy.s7Body')}</p>

          <h2 className="text-xl font-semibold text-white mt-4">{t('privacyPolicy.s8Title')}</h2>
          <p>
            {t('privacyPolicy.s8Body')}{' '}
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

export default PrivacyPolicy;
