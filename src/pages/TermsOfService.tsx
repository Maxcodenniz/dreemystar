import React from 'react';
import { useTranslation } from 'react-i18next';

const CONTACT_EMAIL = 'contact@dreemystar.com';

const TermsOfService: React.FC = () => {
  const { t, i18n } = useTranslation();
  const lastUpdated = new Date().toLocaleDateString(i18n.language || 'en', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 pt-24 pb-16 px-6">
      <div className="max-w-4xl mx-auto bg-white/5 border border-white/10 rounded-2xl shadow-2xl p-8 backdrop-blur-xl">
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
          {t('termsOfService.title')}
        </h1>
        <p className="text-sm text-gray-400 mb-6">
          {t('termsOfService.lastUpdated', { date: lastUpdated })}
        </p>

        <div className="space-y-5 text-gray-300 text-sm leading-relaxed">
          <p>{t('termsOfService.intro')}</p>

          <h2 className="text-xl font-semibold text-white mt-4">{t('termsOfService.s1Title')}</h2>
          <p>{t('termsOfService.s1Body')}</p>

          <h2 className="text-xl font-semibold text-white mt-4">{t('termsOfService.s2Title')}</h2>
          <p>{t('termsOfService.s2Body')}</p>

          <h2 className="text-xl font-semibold text-white mt-4">{t('termsOfService.s3Title')}</h2>
          <p>{t('termsOfService.s3AgreeNotTo')}</p>
          <ul className="list-disc list-inside space-y-1">
            <li>{t('termsOfService.s3Li1')}</li>
            <li>{t('termsOfService.s3Li2')}</li>
            <li>{t('termsOfService.s3Li3')}</li>
            <li>{t('termsOfService.s3Li4')}</li>
          </ul>

          <h2 className="text-xl font-semibold text-white mt-4">{t('termsOfService.s4Title')}</h2>
          <p>{t('termsOfService.s4Body')}</p>

          <h2 className="text-xl font-semibold text-white mt-4">{t('termsOfService.s5Title')}</h2>
          <p>{t('termsOfService.s5Body')}</p>

          <h2 className="text-xl font-semibold text-white mt-4">{t('termsOfService.s6Title')}</h2>
          <p>{t('termsOfService.s6Body')}</p>

          <h2 className="text-xl font-semibold text-white mt-4">{t('termsOfService.s7Title')}</h2>
          <p>{t('termsOfService.s7Body')}</p>

          <h2 className="text-xl font-semibold text-white mt-4">{t('termsOfService.s8Title')}</h2>
          <p>{t('termsOfService.s8Body')}</p>

          <h2 className="text-xl font-semibold text-white mt-4">{t('termsOfService.s9Title')}</h2>
          <p>{t('termsOfService.s9Body')}</p>

          <h2 className="text-xl font-semibold text-white mt-4">{t('termsOfService.s10Title')}</h2>
          <p>
            {t('termsOfService.s10Body')}{' '}
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

export default TermsOfService;
