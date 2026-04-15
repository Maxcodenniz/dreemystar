import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Facebook, Youtube, Instagram, Twitter, Music } from 'lucide-react';

const Footer: React.FC = () => {
  const { t } = useTranslation();

  return (
    <footer className="bg-gray-900 text-white py-12 border-t border-gray-800 overflow-hidden">
      <div className="container mx-auto px-4 sm:px-6 max-w-full min-w-0">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center space-x-2 mb-6">
              <div className="relative w-12 h-12 flex-shrink-0">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full blur-md opacity-60"></div>
                <div className="relative w-full h-full rounded-full overflow-hidden ring-2 ring-white/20">
                  <img 
                    src="/logod.png" 
                    alt="DREEMYSTAR Logo" 
                    className="w-full h-full object-cover"
                    style={{ objectPosition: 'center' }}
                  />
                </div>
              </div>
              <span className="text-xl font-bold">DREEMYSTAR</span>
            </div>
            <p className="text-gray-400">
              {t('footer.tagline')}
            </p>
          </div>
          
          <div>
            <h3 className="text-lg font-semibold mb-4">{t('footer.quickLinks')}</h3>
            <ul className="space-y-2">
              <li><Link to="/" className="text-gray-400 hover:text-yellow-400 transition-colors">{t('nav.home')}</Link></li>
              <li><Link to="/live-events" className="text-gray-400 hover:text-yellow-400 transition-colors">{t('nav.liveEvents')}</Link></li>
              <li><Link to="/upcoming-concerts" className="text-gray-400 hover:text-yellow-400 transition-colors">{t('nav.upcomingConcerts')}</Link></li>
              <li><Link to="/categories" className="text-gray-400 hover:text-yellow-400 transition-colors">{t('nav.categories')}</Link></li>
              <li><Link to="/news" className="text-gray-400 hover:text-yellow-400 transition-colors">{t('nav.news')}</Link></li>
              <li><Link to="/help" className="text-gray-400 hover:text-yellow-400 transition-colors">{t('footer.helpCenter')}</Link></li>
            </ul>
          </div>
          
          <div>
            <h3 className="text-lg font-semibold mb-4">{t('footer.browseBy')}</h3>
            <ul className="space-y-2">
              <li><Link to="/categories?genre=Music" className="text-gray-400 hover:text-yellow-400 transition-colors">{t('common.music')}</Link></li>
              <li><Link to="/categories?genre=Comedy" className="text-gray-400 hover:text-yellow-400 transition-colors">{t('common.comedy')}</Link></li>
              <li><Link to="/categories?genre=African" className="text-gray-400 hover:text-yellow-400 transition-colors">{t('common.african')}</Link></li>
              <li><Link to="/categories?genre=European" className="text-gray-400 hover:text-yellow-400 transition-colors">{t('common.european')}</Link></li>
              <li><Link to="/categories?genre=American" className="text-gray-400 hover:text-yellow-400 transition-colors">{t('common.american')}</Link></li>
              <li><Link to="/categories?genre=Asian" className="text-gray-400 hover:text-yellow-400 transition-colors">{t('common.asian')}</Link></li>
              <li><Link to="/categories?genre=Maghreb" className="text-gray-400 hover:text-yellow-400 transition-colors">{t('common.maghreb')}</Link></li>
            </ul>
          </div>
          
          <div>
            <h3 className="text-lg font-semibold mb-4">{t('footer.aboutUs')}</h3>
            <ul className="space-y-2">
              <li>
                <Link to="/about" className="text-gray-400 hover:text-yellow-400 transition-colors">
                  {t('footer.aboutUs')}
                </Link>
              </li>
            </ul>
            <h3 className="text-lg font-semibold mb-4 mt-6">{t('footer.contact')}</h3>
            <ul className="space-y-2">
              <li className="text-gray-400">Email: contact@dreemystar.com</li>
              <li className="text-gray-400">Address: NY, United States of America</li>
            </ul>
            <div className="flex flex-wrap gap-3 mt-4">
              <a href={import.meta.env.VITE_FOOTER_FACEBOOK_URL || 'https://www.facebook.com/dreemystar'} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-[#1877F2] transition-colors" aria-label="Facebook">
                <Facebook className="w-5 h-5" />
              </a>
              <a href={import.meta.env.VITE_FOOTER_YOUTUBE_URL || 'https://www.youtube.com/@dreemystar'} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-[#FF0000] transition-colors" aria-label="YouTube">
                <Youtube className="w-5 h-5" />
              </a>
              <a href={import.meta.env.VITE_FOOTER_INSTAGRAM_URL || 'https://www.instagram.com/dreemystar'} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-[#E4405F] transition-colors" aria-label="Instagram">
                <Instagram className="w-5 h-5" />
              </a>
              <a href={import.meta.env.VITE_FOOTER_TIKTOK_URL || 'https://www.tiktok.com/@dreemystar'} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-[#00F2EA] transition-colors" aria-label="TikTok">
                <Music className="w-5 h-5" />
              </a>
              <a href={import.meta.env.VITE_FOOTER_X_URL || 'https://x.com/dreemystar'} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors" aria-label="X">
                <Twitter className="w-5 h-5" />
              </a>
            </div>
          </div>
        </div>
        
        <div className="border-t border-gray-800 mt-8 pt-8 flex flex-col gap-4 min-w-0">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-3 text-gray-400 text-xs sm:text-sm min-w-0">
              <p>
                © {new Date().getFullYear()} DREEMYSTAR.COM {t('footer.allRightsReserved')}
              </p>
              <p className="opacity-80">
                {t('footer.operatedBy')}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-start md:justify-end gap-2 sm:gap-3 min-w-0 shrink-0">
              <span className="text-[11px] sm:text-xs text-gray-500 uppercase tracking-wide whitespace-nowrap">
                {t('footer.securePaymentsWith')}
              </span>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 max-w-full">
                <img
                  src="/stripe.jpg"
                  alt="Stripe"
                  className="h-14 sm:h-20 md:h-24 w-auto max-w-[140px] sm:max-w-[180px] rounded-lg bg-white/5 border border-white/10 px-2 sm:px-3 py-1.5 sm:py-2 object-contain"
                />
                <img
                  src="/pawapay-logo.svg"
                  alt="PawaPay"
                  className="h-14 sm:h-20 md:h-24 w-auto max-w-[200px] sm:max-w-[240px] rounded-lg bg-white/5 border border-white/10 px-2 sm:px-3 py-1.5 sm:py-2 object-contain"
                />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2 mt-1">
            <Link to="/about" className="text-gray-400 hover:text-yellow-400 text-xs sm:text-sm whitespace-nowrap">
              {t('footer.aboutUs')}
            </Link>
            <Link to="/terms" className="text-gray-400 hover:text-yellow-400 text-xs sm:text-sm whitespace-nowrap">
              {t('footer.termsOfService')}
            </Link>
            <Link to="/privacy" className="text-gray-400 hover:text-yellow-400 text-xs sm:text-sm whitespace-nowrap">
              {t('footer.privacyPolicy')}
            </Link>
            <Link to="/cookies" className="text-gray-400 hover:text-yellow-400 text-xs sm:text-sm whitespace-nowrap">
              {t('footer.cookiePolicy')}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
