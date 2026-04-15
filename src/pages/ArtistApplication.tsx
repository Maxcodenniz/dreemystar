import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Star, Youtube, Instagram, Music, Facebook, Video,
  Send, CheckCircle, AlertCircle, ArrowLeft, Sparkles,
  User, Mail, Phone, MapPin, Calendar, Globe, FileText,
  Upload, ShieldAlert, X
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { COUNTRIES, filterCountries } from '../utils/countries';

interface FormData {
  firstName: string;
  lastName: string;
  stageName: string;
  dateOfBirth: string;
  countryOfResidence: string;
  email: string;
  phone: string;
  youtubeUrl: string;
  youtubeFollowers: string;
  instagramUrl: string;
  instagramFollowers: string;
  tiktokUrl: string;
  tiktokFollowers: string;
  facebookUrl: string;
  facebookFollowers: string;
  hasHeldOnlineEvent: boolean;
  onlineEventVideoUrl: string;
  description: string;
  confirmAccuracy: boolean;
  acceptContact: boolean;
}

const initialForm: FormData = {
  firstName: '',
  lastName: '',
  stageName: '',
  dateOfBirth: '',
  countryOfResidence: '',
  email: '',
  phone: '',
  youtubeUrl: '',
  youtubeFollowers: '',
  instagramUrl: '',
  instagramFollowers: '',
  tiktokUrl: '',
  tiktokFollowers: '',
  facebookUrl: '',
  facebookFollowers: '',
  hasHeldOnlineEvent: false,
  onlineEventVideoUrl: '',
  description: '',
  confirmAccuracy: false,
  acceptContact: false,
};

const MIN_FOLLOWERS = 100_000;

const ArtistApplication: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [formData, setFormData] = useState<FormData>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countrySearch, setCountrySearch] = useState('');
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  const countryInputRef = useRef<HTMLInputElement>(null);
  const countryDropdownRef = useRef<HTMLDivElement>(null);

  // Screenshot uploads
  const [screenshots, setScreenshots] = useState<{ youtube: File | null; instagram: File | null; tiktok: File | null; facebook: File | null }>({
    youtube: null, instagram: null, tiktok: null, facebook: null,
  });
  const [screenshotPreviews, setScreenshotPreviews] = useState<{ youtube: string | null; instagram: string | null; tiktok: string | null; facebook: string | null }>({
    youtube: null, instagram: null, tiktok: null, facebook: null,
  });
  const [uploadingScreenshots, setUploadingScreenshots] = useState(false);

  const handleScreenshotSelect = (platform: 'youtube' | 'instagram' | 'tiktok' | 'facebook', file: File | null) => {
    if (!file) {
      setScreenshots(prev => ({ ...prev, [platform]: null }));
      setScreenshotPreviews(prev => ({ ...prev, [platform]: null }));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError(t('artistApplication.screenshotUnder5MB'));
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file (PNG, JPG, etc.).');
      return;
    }
    setScreenshots(prev => ({ ...prev, [platform]: file }));
    const reader = new FileReader();
    reader.onloadend = () => setScreenshotPreviews(prev => ({ ...prev, [platform]: reader.result as string }));
    reader.readAsDataURL(file);
  };

  const uploadScreenshot = async (platform: string, file: File): Promise<string> => {
    const ext = file.name.split('.').pop() || 'png';
    const path = `${platform}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from('artist-applications')
      .upload(path, file, { upsert: true });
    if (uploadErr) throw uploadErr;
    const { data: { publicUrl } } = supabase.storage
      .from('artist-applications')
      .getPublicUrl(path);
    return publicUrl;
  };

  const filteredCountryList = filterCountries(countrySearch);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        countryDropdownRef.current &&
        !countryDropdownRef.current.contains(e.target as Node) &&
        countryInputRef.current &&
        !countryInputRef.current.contains(e.target as Node)
      ) {
        setShowCountryDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      setFormData(prev => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.confirmAccuracy || !formData.acceptContact) {
      setError(t('artistApplication.confirmDeclarations'));
      return;
    }

    if (!formData.firstName || !formData.lastName || !formData.stageName || !formData.dateOfBirth || !formData.countryOfResidence || !formData.email || !formData.phone || !formData.description) {
      setError(t('artistApplication.fillRequiredFields'));
      return;
    }

    const ytFollowers = parseInt(formData.youtubeFollowers) || 0;
    const igFollowers = parseInt(formData.instagramFollowers) || 0;
    const tkFollowers = parseInt(formData.tiktokFollowers) || 0;
    const fbFollowers = parseInt(formData.facebookFollowers) || 0;

    const hasAnySocial = formData.youtubeUrl || formData.instagramUrl || formData.tiktokUrl || formData.facebookUrl;
    if (!hasAnySocial) {
      setError(t('artistApplication.atLeastOneSocial'));
      return;
    }

    setSubmitting(true);

    try {
      // Upload screenshots first
      setUploadingScreenshots(true);
      let youtubeScreenshotUrl: string | null = null;
      let instagramScreenshotUrl: string | null = null;
      let tiktokScreenshotUrl: string | null = null;
      let facebookScreenshotUrl: string | null = null;

      if (screenshots.youtube) youtubeScreenshotUrl = await uploadScreenshot('youtube', screenshots.youtube);
      if (screenshots.instagram) instagramScreenshotUrl = await uploadScreenshot('instagram', screenshots.instagram);
      if (screenshots.tiktok) tiktokScreenshotUrl = await uploadScreenshot('tiktok', screenshots.tiktok);
      if (screenshots.facebook) facebookScreenshotUrl = await uploadScreenshot('facebook', screenshots.facebook);
      setUploadingScreenshots(false);

      const { error: insertErr } = await supabase.from('artist_applications').insert({
        first_name: formData.firstName.trim(),
        last_name: formData.lastName.trim(),
        stage_name: formData.stageName.trim(),
        date_of_birth: formData.dateOfBirth,
        country_of_residence: formData.countryOfResidence,
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone.trim(),
        youtube_url: formData.youtubeUrl.trim() || null,
        youtube_followers: ytFollowers,
        youtube_screenshot_url: youtubeScreenshotUrl,
        instagram_url: formData.instagramUrl.trim() || null,
        instagram_followers: igFollowers,
        instagram_screenshot_url: instagramScreenshotUrl,
        tiktok_url: formData.tiktokUrl.trim() || null,
        tiktok_followers: tkFollowers,
        tiktok_screenshot_url: tiktokScreenshotUrl,
        facebook_url: formData.facebookUrl.trim() || null,
        facebook_followers: fbFollowers,
        facebook_screenshot_url: facebookScreenshotUrl,
        has_held_online_event: formData.hasHeldOnlineEvent,
        online_event_video_url: formData.hasHeldOnlineEvent ? formData.onlineEventVideoUrl.trim() || null : null,
        description: formData.description.trim(),
      });

      if (insertErr) throw insertErr;

      // Trigger the processing edge function (qualification check + email)
      try {
        const { data: fnData, error: fnError } = await supabase.functions.invoke('process-artist-application', {
          body: { email: formData.email.trim().toLowerCase(), locale: (i18n.language || 'en').slice(0, 2) },
        });
        if (fnError) {
          console.error('process-artist-application failed:', fnError);
        } else if (fnData?.error) {
          console.warn('process-artist-application returned:', fnData.error);
        }
      } catch (e) {
        console.error('process-artist-application invoke error:', e);
        // Don't block the user; application was saved
      }

      setSubmitted(true);
    } catch (err: any) {
      console.error('Application submission error:', err);
      setError(err.message || t('artistApplication.submitFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 flex items-center justify-center px-4">
        <div className="max-w-lg w-full text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 flex items-center justify-center animate-bounce">
            <CheckCircle className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-4">{t('artistApplication.applicationSubmitted')}</h1>
          <p className="text-gray-300 mb-3">
            {t('artistApplication.thankYouReview')}
          </p>
          <p className="text-gray-400 text-sm mb-8">
            {t('artistApplication.emailOutcome', { email: formData.email })}
          </p>
          <Link
            to="/"
            className="inline-flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-xl font-bold transition-all duration-300 shadow-lg"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>{t('artistApplication.backToHome')}</span>
          </Link>
        </div>
      </div>
    );
  }

  const inputClass = "w-full px-4 py-3 bg-gray-800/80 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500/50 transition-all duration-300";
  const labelClass = "block text-gray-300 text-sm font-semibold mb-1.5";

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 relative overflow-hidden">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-pink-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <div className="relative z-10 container mx-auto px-4 py-10 max-w-3xl">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-600 mb-4">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3">
            {t('artistApplication.title')}
          </h1>
          <p className="text-gray-400 max-w-xl mx-auto">
            {t('artistApplication.introDescription')}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Personal Information */}
          <section className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 backdrop-blur-sm relative z-20">
            <h2 className="text-lg font-bold text-white mb-5 flex items-center space-x-2">
              <User className="w-5 h-5 text-purple-400" />
              <span>{t('artistApplication.personalInformation')}</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>{t('artistApplication.firstName')} *</label>
                <input name="firstName" value={formData.firstName} onChange={handleChange} required className={inputClass} placeholder={t('artistApplication.placeholderFirstName')} />
              </div>
              <div>
                <label className={labelClass}>{t('artistApplication.lastName')} *</label>
                <input name="lastName" value={formData.lastName} onChange={handleChange} required className={inputClass} placeholder={t('artistApplication.placeholderLastName')} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>{t('artistApplication.stageName')} *</label>
                <div className="relative">
                  <Star className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
                  <input name="stageName" value={formData.stageName} onChange={handleChange} required className={`${inputClass} pl-11`} placeholder={t('artistApplication.placeholderStageName')} />
                </div>
              </div>
              <div>
                <label className={labelClass}>{t('artistApplication.dateOfBirth')} *</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
                  <input type="date" name="dateOfBirth" value={formData.dateOfBirth} onChange={handleChange} required className={`${inputClass} pl-11`} />
                </div>
              </div>
              <div className="relative">
                <label className={labelClass}>{t('artistApplication.countryOfResidence')} *</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5 z-10" />
                  <input
                    ref={countryInputRef}
                    type="text"
                    value={countrySearch || formData.countryOfResidence}
                    onChange={e => { setCountrySearch(e.target.value); setShowCountryDropdown(true); setFormData(prev => ({ ...prev, countryOfResidence: '' })); }}
                    onFocus={() => setShowCountryDropdown(true)}
                    required
                    className={`${inputClass} pl-11`}
                    placeholder={t('artistApplication.placeholderCountry')}
                  />
                </div>
                {showCountryDropdown && filteredCountryList.length > 0 && (
                  <div ref={countryDropdownRef} className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-xl shadow-2xl max-h-48 overflow-y-auto">
                    {filteredCountryList.map(c => (
                      <button key={c} type="button" onClick={() => { setFormData(prev => ({ ...prev, countryOfResidence: c })); setCountrySearch(''); setShowCountryDropdown(false); }} className="w-full text-left px-4 py-2 text-gray-200 hover:bg-purple-600/30 transition-colors text-sm">
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Contact Information */}
          <section className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 backdrop-blur-sm relative z-10">
            <h2 className="text-lg font-bold text-white mb-5 flex items-center space-x-2">
              <Mail className="w-5 h-5 text-purple-400" />
              <span>{t('artistApplication.contactInformation')}</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>{t('artistApplication.professionalEmail')} *</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
                  <input type="email" name="email" value={formData.email} onChange={handleChange} required className={`${inputClass} pl-11`} placeholder={t('artistApplication.placeholderEmail')} />
                </div>
              </div>
              <div>
                <label className={labelClass}>{t('artistApplication.professionalPhone')} *</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
                  <input type="tel" name="phone" value={formData.phone} onChange={handleChange} required className={`${inputClass} pl-11`} placeholder={t('artistApplication.placeholderPhone')} />
                </div>
              </div>
            </div>
          </section>

          {/* Social Media Profiles */}
          <section className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 backdrop-blur-sm">
            <h2 className="text-lg font-bold text-white mb-2 flex items-center space-x-2">
              <Globe className="w-5 h-5 text-purple-400" />
              <span>{t('artistApplication.socialMediaProfiles')}</span>
            </h2>
            <p className="text-gray-400 text-sm mb-4">
              {t('artistApplication.socialIntro')}
            </p>

            {/* Ban warning */}
            <div className="mb-5 p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start space-x-3">
              <ShieldAlert className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-red-300 font-bold text-sm">{t('artistApplication.warningTitle')}</p>
                <p className="text-red-300/80 text-xs mt-1">
                  {t('artistApplication.warningBody')}
                </p>
              </div>
            </div>

            {/* YouTube */}
            <div className="mb-5 p-4 bg-white/[0.02] border border-gray-700/60 rounded-xl">
              <div className="flex items-center space-x-2 mb-3">
                <Youtube className="w-5 h-5 text-red-500" />
                <span className="font-semibold text-white">{t('artistApplication.youtube')}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                <div className="sm:col-span-2">
                  <input name="youtubeUrl" value={formData.youtubeUrl} onChange={handleChange} className={inputClass} placeholder={t('artistApplication.placeholderYoutubeUrl')} />
                </div>
                <div>
                  <input type="number" name="youtubeFollowers" value={formData.youtubeFollowers} onChange={handleChange} className={inputClass} placeholder={t('artistApplication.subscribers')} min="0" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">{t('artistApplication.screenshotYoutube')}</label>
                {screenshotPreviews.youtube ? (
                  <div className="relative inline-block">
                    <img src={screenshotPreviews.youtube} alt="YouTube screenshot" className="max-h-32 rounded-lg border border-red-500/30" />
                    <button type="button" onClick={() => handleScreenshotSelect('youtube', null)} className="absolute -top-2 -right-2 w-6 h-6 bg-red-600 rounded-full flex items-center justify-center hover:bg-red-700 transition-colors">
                      <X className="w-3.5 h-3.5 text-white" />
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 border-dashed rounded-lg cursor-pointer transition-colors w-fit">
                    <Upload className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-400">{t('artistApplication.uploadScreenshot')}</span>
                    <input type="file" accept="image/*" className="hidden" onChange={e => handleScreenshotSelect('youtube', e.target.files?.[0] || null)} />
                  </label>
                )}
              </div>
            </div>

            {/* Instagram */}
            <div className="mb-5 p-4 bg-white/[0.02] border border-gray-700/60 rounded-xl">
              <div className="flex items-center space-x-2 mb-3">
                <Instagram className="w-5 h-5 text-pink-500" />
                <span className="font-semibold text-white">{t('artistApplication.instagram')}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                <div className="sm:col-span-2">
                  <input name="instagramUrl" value={formData.instagramUrl} onChange={handleChange} className={inputClass} placeholder={t('artistApplication.placeholderInstagramUrl')} />
                </div>
                <div>
                  <input type="number" name="instagramFollowers" value={formData.instagramFollowers} onChange={handleChange} className={inputClass} placeholder={t('artistApplication.followers')} min="0" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">{t('artistApplication.screenshotInstagram')}</label>
                {screenshotPreviews.instagram ? (
                  <div className="relative inline-block">
                    <img src={screenshotPreviews.instagram} alt="Instagram screenshot" className="max-h-32 rounded-lg border border-pink-500/30" />
                    <button type="button" onClick={() => handleScreenshotSelect('instagram', null)} className="absolute -top-2 -right-2 w-6 h-6 bg-red-600 rounded-full flex items-center justify-center hover:bg-red-700 transition-colors">
                      <X className="w-3.5 h-3.5 text-white" />
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 border-dashed rounded-lg cursor-pointer transition-colors w-fit">
                    <Upload className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-400">{t('artistApplication.uploadScreenshot')}</span>
                    <input type="file" accept="image/*" className="hidden" onChange={e => handleScreenshotSelect('instagram', e.target.files?.[0] || null)} />
                  </label>
                )}
              </div>
            </div>

            {/* TikTok */}
            <div className="mb-5 p-4 bg-white/[0.02] border border-gray-700/60 rounded-xl">
              <div className="flex items-center space-x-2 mb-3">
                <Music className="w-5 h-5 text-cyan-400" />
                <span className="font-semibold text-white">{t('artistApplication.tiktok')}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                <div className="sm:col-span-2">
                  <input name="tiktokUrl" value={formData.tiktokUrl} onChange={handleChange} className={inputClass} placeholder={t('artistApplication.placeholderTiktokUrl')} />
                </div>
                <div>
                  <input type="number" name="tiktokFollowers" value={formData.tiktokFollowers} onChange={handleChange} className={inputClass} placeholder={t('artistApplication.followers')} min="0" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">{t('artistApplication.screenshotTiktok')}</label>
                {screenshotPreviews.tiktok ? (
                  <div className="relative inline-block">
                    <img src={screenshotPreviews.tiktok} alt="TikTok screenshot" className="max-h-32 rounded-lg border border-cyan-500/30" />
                    <button type="button" onClick={() => handleScreenshotSelect('tiktok', null)} className="absolute -top-2 -right-2 w-6 h-6 bg-red-600 rounded-full flex items-center justify-center hover:bg-red-700 transition-colors">
                      <X className="w-3.5 h-3.5 text-white" />
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 border-dashed rounded-lg cursor-pointer transition-colors w-fit">
                    <Upload className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-400">{t('artistApplication.uploadScreenshot')}</span>
                    <input type="file" accept="image/*" className="hidden" onChange={e => handleScreenshotSelect('tiktok', e.target.files?.[0] || null)} />
                  </label>
                )}
              </div>
            </div>

            {/* Facebook */}
            <div className="p-4 bg-white/[0.02] border border-gray-700/60 rounded-xl">
              <div className="flex items-center space-x-2 mb-3">
                <Facebook className="w-5 h-5 text-blue-500" />
                <span className="font-semibold text-white">{t('artistApplication.facebook')}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                <div className="sm:col-span-2">
                  <input name="facebookUrl" value={formData.facebookUrl} onChange={handleChange} className={inputClass} placeholder={t('artistApplication.placeholderFacebookUrl')} />
                </div>
                <div>
                  <input type="number" name="facebookFollowers" value={formData.facebookFollowers} onChange={handleChange} className={inputClass} placeholder={t('artistApplication.followers')} min="0" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">{t('artistApplication.screenshotFacebook')}</label>
                {screenshotPreviews.facebook ? (
                  <div className="relative inline-block">
                    <img src={screenshotPreviews.facebook} alt="Facebook screenshot" className="max-h-32 rounded-lg border border-blue-500/30" />
                    <button type="button" onClick={() => handleScreenshotSelect('facebook', null)} className="absolute -top-2 -right-2 w-6 h-6 bg-red-600 rounded-full flex items-center justify-center hover:bg-red-700 transition-colors">
                      <X className="w-3.5 h-3.5 text-white" />
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 border-dashed rounded-lg cursor-pointer transition-colors w-fit">
                    <Upload className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-400">{t('artistApplication.uploadScreenshot')}</span>
                    <input type="file" accept="image/*" className="hidden" onChange={e => handleScreenshotSelect('facebook', e.target.files?.[0] || null)} />
                  </label>
                )}
              </div>
            </div>
          </section>

          {/* Online Events & Description */}
          <section className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 backdrop-blur-sm">
            <h2 className="text-lg font-bold text-white mb-5 flex items-center space-x-2">
              <Video className="w-5 h-5 text-purple-400" />
              <span>{t('artistApplication.experienceAndMotivation')}</span>
            </h2>

            <div className="mb-5">
              <label className={labelClass}>{t('artistApplication.hasHeldOnlineEvent')}</label>
              <div className="flex items-center space-x-6 mt-2">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input type="radio" name="hasHeldOnlineEvent" checked={formData.hasHeldOnlineEvent === true} onChange={() => setFormData(prev => ({ ...prev, hasHeldOnlineEvent: true }))} className="w-4 h-4 text-purple-500 bg-gray-700 border-gray-600 focus:ring-purple-500" />
                  <span className="text-gray-300">{t('artistApplication.yes')}</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input type="radio" name="hasHeldOnlineEvent" checked={formData.hasHeldOnlineEvent === false} onChange={() => setFormData(prev => ({ ...prev, hasHeldOnlineEvent: false }))} className="w-4 h-4 text-purple-500 bg-gray-700 border-gray-600 focus:ring-purple-500" />
                  <span className="text-gray-300">{t('artistApplication.no')}</span>
                </label>
              </div>
            </div>

            {formData.hasHeldOnlineEvent && (
              <div className="mb-5">
                <label className={labelClass}>{t('artistApplication.linkToVideo')}</label>
                <input name="onlineEventVideoUrl" value={formData.onlineEventVideoUrl} onChange={handleChange} className={inputClass} placeholder={t('artistApplication.placeholderVideoUrl')} />
              </div>
            )}

            <div>
              <label className={labelClass}>{t('artistApplication.describeOffer')} *</label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                required
                rows={4}
                className={`${inputClass} resize-none`}
                placeholder={t('artistApplication.placeholderDescribe')}
              />
            </div>
          </section>

          {/* Declarations */}
          <section className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 backdrop-blur-sm">
            <h2 className="text-lg font-bold text-white mb-5 flex items-center space-x-2">
              <FileText className="w-5 h-5 text-purple-400" />
              <span>{t('artistApplication.declaration')}</span>
            </h2>
            <div className="space-y-4">
              <label className="flex items-start space-x-3 cursor-pointer group">
                <input type="checkbox" name="confirmAccuracy" checked={formData.confirmAccuracy} onChange={handleChange} className="w-5 h-5 mt-0.5 text-purple-500 bg-gray-700 border-gray-600 rounded focus:ring-purple-500 flex-shrink-0" />
                <span className="text-gray-300 text-sm group-hover:text-white transition-colors">
                  {t('artistApplication.confirmAccuracy')}
                </span>
              </label>
              <label className="flex items-start space-x-3 cursor-pointer group">
                <input type="checkbox" name="acceptContact" checked={formData.acceptContact} onChange={handleChange} className="w-5 h-5 mt-0.5 text-purple-500 bg-gray-700 border-gray-600 rounded focus:ring-purple-500 flex-shrink-0" />
                <span className="text-gray-300 text-sm group-hover:text-white transition-colors">
                  {t('artistApplication.acceptContact')}
                </span>
              </label>
            </div>
          </section>

          {/* Error */}
          {error && (
            <div className="flex items-center space-x-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
              <span className="text-red-300 text-sm">{error}</span>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting || !formData.confirmAccuracy || !formData.acceptContact}
            className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed text-white rounded-xl font-bold text-lg transition-all duration-300 shadow-xl shadow-purple-500/30 hover:shadow-2xl hover:shadow-purple-500/40 flex items-center justify-center space-x-3"
          >
            {submitting ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                <span>{uploadingScreenshots ? t('artistApplication.uploadingScreenshots') : t('artistApplication.submitting')}</span>
              </>
            ) : (
              <>
                <Send className="w-5 h-5" />
                <span>{t('artistApplication.submitApplication')}</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ArtistApplication;
