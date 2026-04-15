import React from 'react';
import { useTranslation } from 'react-i18next';

const AboutUs: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 pt-24 pb-16 px-6">
      <div className="max-w-4xl mx-auto bg-white/5 border border-white/10 rounded-2xl shadow-2xl p-8 backdrop-blur-xl">
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-6">
          {t('aboutUs.title')}
        </h1>

        <div className="space-y-5 text-gray-300 text-sm leading-relaxed">
          <p>{t('aboutUs.intro')}</p>
          <p>{t('aboutUs.mission')}</p>
          <p>{t('aboutUs.contactPrompt')}</p>
        </div>
      </div>
    </div>
  );
};

export default AboutUs;
