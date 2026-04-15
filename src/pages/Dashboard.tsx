import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import PawapayBundleReturnHandler from '../components/PawapayBundleReturnHandler';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store/useStore';
import { supabase } from '../lib/supabaseClient';
import { isSuperAdmin as checkSuperAdmin } from '../utils/constants';
import { COUNTRIES } from '../utils/countries';
import { Camera, Save, User, Upload, X, Phone, CreditCard, Lock, Calendar, Users, Eye, TrendingUp, Activity, Sparkles, BarChart3, Ticket, Music, Globe, MapPin, FileText, Table2, Download, ToggleLeft, ToggleRight, Settings2, MessageSquare, Search, Video, RotateCcw, MonitorPlay, Clock, Gift, Monitor, Link2, Mail, Copy, Check, Bell, UserCog, Euro, PlayCircle, LayoutGrid, UserX, Smartphone } from 'lucide-react';

export type DashboardGroup = 'overview' | 'analytics' | 'features' | 'revenue' | 'tools' | 'applications' | 'tips';

const Dashboard: React.FC = () => {
  const { i18n } = useTranslation();
  const { userProfile, setUserProfile } = useStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState<DashboardGroup>('overview');
  const [stats, setStats] = useState({
    eventsCount: 0,
    totalViewers: 0,
    totalRevenue: 0,
    totalUsers: 0,
    totalArtists: 0,
    totalAdmins: 0,
    totalTickets: 0,
    activeEvents: 0
  });
  const [loadingStats, setLoadingStats] = useState(true);

  const isArtist = userProfile?.user_type === 'artist';
  const isAdmin = userProfile?.user_type === 'global_admin' || userProfile?.user_type === 'super_admin';
  const isSuperAdmin = checkSuperAdmin(userProfile?.id, userProfile?.user_type);
  /** Super admin, legacy super-admin-by-ID, or global admin — can load/save app_config (feature toggles). */
  const platformConfigAccess =
    isSuperAdmin || userProfile?.user_type === 'global_admin';
  const [appConfig, setAppConfig] = useState({
    artist_login_enabled: true,
    live_chat_enabled: true,
    recording_enabled: true,
    artist_recordings_visible: true,
    admin_recordings_visible: true,
    admin_user_delete_enabled: true,
    payment_info_visible: true,
    live_notifications_fans_enabled: true,
    live_notifications_artists_enabled: true,
    live_notifications_admins_enabled: true,
    advertisements_home_enabled: true,
    visitor_counter_visible: true,
    visitor_count_base: 0,
    gift_enabled: true,
    creator_studio_analytics_enabled: true,
    platform_revenue_percentage: 30,
    artist_revenue_percentage: 70,
    desktop_mode_on_mobile: false,
    live_event_notifications_enabled: true,
    live_event_email_notify_admins: true,
    live_event_email_notify_artists: true,
    live_event_email_notify_fans: true,
    event_scheduled_phone_notify_followers: false,
    event_scheduled_phone_notify_all: false,
    live_event_started_phone_notify_followers: false,
    live_event_started_phone_notify_all: false,
    auth_gate_enabled: true,
    artist_management_communication_enabled: true,
    bundles_enabled: true,
    replays_enabled: true,
    live_replay_bundle_enabled: true,
    artist_application_enabled: true,
    default_event_price: 1.99,
    default_event_duration: 60,
    streaming_max_minutes: 60,
    streaming_warning_minutes: 5,
    tip_platform_percentage: 20,
    artist_min_followers: 100000,
    artist_survey_max_countries: 5,
    artist_survey_artists_per_country: 5,
    artist_survey_popup_days: 30,
    mobile_money_payments_enabled: false,
    pawapay_enabled: false,
    dusupay_enabled: false,
  });
  const [defaultEventPrice, setDefaultEventPrice] = useState<string>('1.99');
  const [savingDefaultPrice, setSavingDefaultPrice] = useState(false);
  const [defaultEventDuration, setDefaultEventDuration] = useState<string>('60');
  const [savingDefaultDuration, setSavingDefaultDuration] = useState(false);
  const [streamingMaxMinutes, setStreamingMaxMinutes] = useState<string>('60');
  const [streamingWarningMinutes, setStreamingWarningMinutes] = useState<string>('5');
  const [savingStreamingLimits, setSavingStreamingLimits] = useState(false);
  const [platformRevenuePercentage, setPlatformRevenuePercentage] = useState<string>('30');
  const [artistRevenuePercentage, setArtistRevenuePercentage] = useState<string>('70');
  const [tipPlatformPercentage, setTipPlatformPercentage] = useState<string>('20');
  const [savingTipPlatformPercentage, setSavingTipPlatformPercentage] = useState(false);
  // Artist survey suggestions (super admin)
  const [surveyCountries, setSurveyCountries] = useState<{ country: string; enabled: boolean; totalArtists: number }[]>([]);
  const [surveyCountriesLoading, setSurveyCountriesLoading] = useState(false);
  const [togglingSurveyCountry, setTogglingSurveyCountry] = useState<string | null>(null);
  const [newSurveyCountry, setNewSurveyCountry] = useState<string>('');
  const [savingMinFollowers, setSavingMinFollowers] = useState(false);
  const [minFollowersMessage, setMinFollowersMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [visitorAnalytics, setVisitorAnalytics] = useState<any>(null);
  const [loadingVisitorAnalytics, setLoadingVisitorAnalytics] = useState(false);
  const [visitorCountBase, setVisitorCountBase] = useState<string>('0');
  const [resettingVisitorCount, setResettingVisitorCount] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(false);
  
  // Free Access Link Generator state
  const [availableEvents, setAvailableEvents] = useState<any[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [userEmail, setUserEmail] = useState<string>('');
  const [generatedLink, setGeneratedLink] = useState<string>('');
  const [linkCopied, setLinkCopied] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  // Event Pricing Manager state
  const [pricingEvents, setPricingEvents] = useState<any[]>([]);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [editingPriceValue, setEditingPriceValue] = useState('');
  const [priceSaving, setPriceSaving] = useState(false);
  const [priceSuccess, setPriceSuccess] = useState<string | null>(null);

  // Artist Applications state
  const [artistApplications, setArtistApplications] = useState<any[]>([]);
  const [applicationsLoading, setApplicationsLoading] = useState(false);
  const [applicationFilter, setApplicationFilter] = useState<'all' | 'pending' | 'qualified' | 'rejected' | 'registered'>('all');
  const [resendingInvite, setResendingInvite] = useState<string | null>(null);

  // Tips log (admins + super admins)
  const [tipsLog, setTipsLog] = useState<any[]>([]);
  const [tipsLogLoading, setTipsLogLoading] = useState(false);
  const [tipsFilterStatus, setTipsFilterStatus] = useState<string>('');
  const [tipsFilterArtistId, setTipsFilterArtistId] = useState<string>('');
  const [tipsFilterSenderEmail, setTipsFilterSenderEmail] = useState<string>('');
  const [tipsFilterAmountMin, setTipsFilterAmountMin] = useState<string>('');
  const [tipsFilterAmountMax, setTipsFilterAmountMax] = useState<string>('');
  const [tipsFilterDateFrom, setTipsFilterDateFrom] = useState<string>('');
  const [tipsFilterDateTo, setTipsFilterDateTo] = useState<string>('');
  const [artistOptions, setArtistOptions] = useState<{ id: string; full_name: string | null; username: string | null }[]>([]);

  // Fetch available events for free access link generator and pricing manager
  useEffect(() => {
    if (isSuperAdmin) {
      fetchAvailableEvents();
      fetchPricingEvents();
      fetchArtistApplications();
    }
  }, [isSuperAdmin]);

  // Fetch artist survey countries for super admin configuration
  useEffect(() => {
    const fetchSurveyCountries = async () => {
      if (!isSuperAdmin) return;
      try {
        setSurveyCountriesLoading(true);
        const { data, error } = await supabase
          .from('artist_survey_suggestions')
          .select('country, enabled')
          .order('country', { ascending: true });

        if (error) throw error;

        const map = new Map<string, { enabled: boolean; total: number }>();
        (data as any[] | null | undefined)?.forEach((row: any) => {
          const country = row.country as string;
          const enabled = !!row.enabled;
          if (!map.has(country)) {
            map.set(country, { enabled, total: 1 });
          } else {
            const current = map.get(country)!;
            map.set(country, {
              enabled: current.enabled || enabled,
              total: current.total + 1
            });
          }
        });

        const countries: { country: string; enabled: boolean; totalArtists: number }[] = [];
        map.forEach((value, key) => {
          countries.push({
            country: key,
            enabled: value.enabled,
            totalArtists: value.total
          });
        });

        setSurveyCountries(countries);
      } catch (err) {
        console.error('Error fetching artist survey countries:', err);
      } finally {
        setSurveyCountriesLoading(false);
      }
    };

    fetchSurveyCountries();
  }, [isSuperAdmin]);

  const toggleSurveyCountryEnabled = async (country: string, enabled: boolean) => {
    if (!isSuperAdmin) return;
    try {
      setTogglingSurveyCountry(country);
      const { error } = await supabase
        .from('artist_survey_suggestions')
        .update({ enabled })
        .eq('country', country);
      if (error) throw error;
      setSurveyCountries((prev) =>
        prev.map((c) =>
          c.country === country ? { ...c, enabled } : c
        )
      );
    } catch (err) {
      console.error('Error toggling survey country:', err);
    } finally {
      setTogglingSurveyCountry(null);
    }
  };

  const handleAddSurveyCountry = async () => {
    if (!isSuperAdmin || !newSurveyCountry) return;
    if (surveyCountries.some((c) => c.country === newSurveyCountry)) {
      setNewSurveyCountry('');
      return;
    }
    try {
      setTogglingSurveyCountry(newSurveyCountry);
      // Insert a disabled placeholder suggestion so the country exists;
      // actual artist suggestions can be added later in the insights UI.
      const { error } = await supabase
        .from('artist_survey_suggestions')
        .insert({
          country: newSurveyCountry,
          artist_name: 'Placeholder',
          enabled: false,
          display_order: 0
        });
      if (error) throw error;
      setSurveyCountries((prev) => [
        ...prev,
        { country: newSurveyCountry, enabled: false, totalArtists: 1 }
      ]);
      setNewSurveyCountry('');
    } catch (err) {
      console.error('Error adding survey country:', err);
    } finally {
      setTogglingSurveyCountry(null);
    }
  };

  const fetchAvailableEvents = async () => {
    try {
      const { data, error } = await supabase
        .from('events')
        .select(`
          id,
          title,
          start_time,
          status,
          profiles:artist_id (
            full_name,
            username
          )
        `)
        .order('start_time', { ascending: false })
        .limit(100);

      if (error) throw error;
      setAvailableEvents(data || []);
    } catch (err) {
      console.error('Error fetching events:', err);
    }
  };

  const fetchPricingEvents = async () => {
    setPricingLoading(true);
    try {
      const { data, error: fetchErr } = await supabase
        .from('events')
        .select('id, title, price, start_time, status, image_url, profiles:artist_id ( full_name, username )')
        .order('start_time', { ascending: false })
        .limit(50);
      if (fetchErr) throw fetchErr;
      setPricingEvents(data || []);
    } catch (err) {
      console.error('Error fetching pricing events:', err);
    } finally {
      setPricingLoading(false);
    }
  };

  const handlePriceUpdate = async (eventId: string) => {
    const newPrice = parseFloat(editingPriceValue);
    if (isNaN(newPrice) || newPrice < 0) {
      setError('Please enter a valid price (minimum $0.00)');
      return;
    }
    setPriceSaving(true);
    try {
      const { error: updateErr } = await supabase
        .from('events')
        .update({ price: newPrice })
        .eq('id', eventId);
      if (updateErr) throw updateErr;
      setPricingEvents(prev => prev.map(e => e.id === eventId ? { ...e, price: newPrice } : e));
      setEditingPriceId(null);
      setEditingPriceValue('');
      setPriceSuccess(`Price updated to $${newPrice.toFixed(2)}`);
      setTimeout(() => setPriceSuccess(null), 3000);
    } catch (err) {
      console.error('Error updating event price:', err);
      setError('Failed to update price. Please try again.');
    } finally {
      setPriceSaving(false);
    }
  };

  const fetchArtistApplications = async () => {
    setApplicationsLoading(true);
    try {
      const { data, error: fetchErr } = await supabase
        .from('artist_applications')
        .select('*')
        .order('created_at', { ascending: false });
      if (fetchErr) throw fetchErr;
      setArtistApplications(data || []);
    } catch (err) {
      console.error('Error fetching artist applications:', err);
    } finally {
      setApplicationsLoading(false);
    }
  };

  const handleApplicationAction = async (id: string, action: 'qualified' | 'rejected') => {
    try {
      const app = artistApplications.find(a => a.id === id);
      if (!app) return;

      const { error: updateErr } = await supabase
        .from('artist_applications')
        .update({ status: action, qualification_met: action === 'qualified', processed_at: new Date().toISOString() })
        .eq('id', id);
      if (updateErr) throw updateErr;

      // Send appropriate email via the processing function
      try {
        await supabase.functions.invoke('process-artist-application', {
          body: { email: app.email, forceStatus: action, locale: (i18n.language || 'en').slice(0, 2) },
        });
      } catch { /* email is best-effort */ }

      setArtistApplications(prev => prev.map(a => a.id === id ? { ...a, status: action, qualification_met: action === 'qualified' } : a));
      setSuccess(`Application ${action === 'qualified' ? 'approved' : 'rejected'} successfully.`);
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to update application');
    }
  };

  const handleResendInvite = async (app: any) => {
    setResendingInvite(app.id);
    try {
      let siteUrl = import.meta.env.VITE_SITE_URL || window.location.origin;
      const inviteLink = `${siteUrl}/signup?invite=${app.invite_token}`;
      // Use Resend via edge function
      await supabase.functions.invoke('process-artist-application', {
        body: { email: app.email, forceStatus: 'qualified', locale: (i18n.language || 'en').slice(0, 2) },
      });
      setSuccess(`Invite resent to ${app.email}`);
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to resend invite');
    } finally {
      setResendingInvite(null);
    }
  };

  const updateDefaultEventPrice = async () => {
    const price = parseFloat(defaultEventPrice);
    if (isNaN(price) || price < 0) {
      setError('Please enter a valid price (minimum $0.00)');
      return;
    }
    setSavingDefaultPrice(true);
    setError(null);
    try {
      // Use upsert on app_config directly (RPC has BOOLEAN/JSONB overload ambiguity for numbers)
      const { error: upsertErr } = await supabase
        .from('app_config')
        .upsert(
          { key: 'default_event_price', value: price, description: 'Default ticket price for artist events' },
          { onConflict: 'key' }
        );

      if (upsertErr) {
        // Fallback: try the RPC with value wrapped as string to force JSONB overload
        const { error: rpcError } = await supabase.rpc('update_app_config', {
          config_key: 'default_event_price',
          config_value: `${price}` as any
        });
        if (rpcError) throw rpcError;
      }

      setAppConfig(prev => ({ ...prev, default_event_price: price }));
      setSuccess(`Default event price updated to $${price.toFixed(2)}. All future events scheduled by artists will use this price.`);
      setTimeout(() => setSuccess(null), 5000);
    } catch (err: any) {
      console.error('Error updating default event price:', err);
      setError(err.message || 'Failed to update default event price');
    } finally {
      setSavingDefaultPrice(false);
    }
  };

  const updateDefaultEventDuration = async () => {
    const minutes = parseInt(defaultEventDuration, 10);
    if (isNaN(minutes) || minutes <= 0) {
      setError('Please enter a valid duration (minimum 1 minute)');
      return;
    }
    setSavingDefaultDuration(true);
    setError(null);
    try {
      const { error: upsertErr } = await supabase
        .from('app_config')
        .upsert(
          { key: 'default_event_duration', value: minutes, description: 'Default event duration in minutes for artist events' },
          { onConflict: 'key' }
        );

      if (upsertErr) {
        const { error: rpcError } = await supabase.rpc('update_app_config', {
          config_key: 'default_event_duration',
          config_value: `${minutes}` as any
        });
        if (rpcError) throw rpcError;
      }

      setAppConfig(prev => ({ ...prev, default_event_duration: minutes }));
      setSuccess(`Default event duration updated to ${minutes} minutes. All future artist-scheduled events will use this duration.`);
      setTimeout(() => setSuccess(null), 5000);
    } catch (err: any) {
      console.error('Error updating default event duration:', err);
      setError(err.message || 'Failed to update default event duration');
    } finally {
      setSavingDefaultDuration(false);
    }
  };

  const updateStreamingLimits = async () => {
    const maxMinutes = parseInt(streamingMaxMinutes, 10);
    const warnMinutes = parseInt(streamingWarningMinutes, 10);

    if (isNaN(maxMinutes) || maxMinutes <= 0) {
      setError('Please enter a valid maximum streaming time (minimum 1 minute)');
      return;
    }
    if (isNaN(warnMinutes) || warnMinutes <= 0 || warnMinutes >= maxMinutes) {
      setError('Warning time must be at least 1 minute and less than the maximum streaming time');
      return;
    }

    setSavingStreamingLimits(true);
    setError(null);
    try {
      const entries = [
        { key: 'streaming_max_minutes', value: maxMinutes, description: 'Maximum continuous streaming time in minutes before auto-ending the stream' },
        { key: 'streaming_warning_minutes', value: warnMinutes, description: 'Minutes before auto-end when a warning is shown to the streamer' },
      ];

      const { error: upsertErr } = await supabase
        .from('app_config')
        .upsert(entries, { onConflict: 'key' });

      if (upsertErr) {
        // Fallback to RPC if upsert fails (e.g. JSONB overload issues)
        for (const entry of entries) {
          const { error: rpcError } = await supabase.rpc('update_app_config', {
            config_key: entry.key,
            config_value: `${entry.value}` as any,
          });
          if (rpcError) throw rpcError;
        }
      }

      setAppConfig(prev => ({
        ...prev,
        streaming_max_minutes: maxMinutes,
        streaming_warning_minutes: warnMinutes,
      }));
      setSuccess(`Streaming limits updated: max ${maxMinutes} minutes, warning ${warnMinutes} minutes before auto-end.`);
      setTimeout(() => setSuccess(null), 5000);
    } catch (err: any) {
      console.error('Error updating streaming limits:', err);
      setError(err.message || 'Failed to update streaming limits');
    } finally {
      setSavingStreamingLimits(false);
    }
  };

  // Refresh user profile on mount to ensure user_type is up to date (important after role changes)
  useEffect(() => {
    const refreshProfile = async () => {
      const currentProfile = userProfile;
      if (currentProfile?.id) {
        try {
          const { data: freshProfile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', currentProfile.id)
            .single();
          
          if (!error && freshProfile && freshProfile.user_type !== currentProfile.user_type) {
            console.log('🔄 Profile user_type changed, updating store:', {
              old: currentProfile.user_type,
              new: freshProfile.user_type
            });
            setUserProfile(freshProfile);
          }
        } catch (err) {
          console.warn('Could not refresh profile:', err);
        }
      }
    };
    
    refreshProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount


  useEffect(() => {
    fetchStats();
    if (platformConfigAccess) {
      fetchAppConfig();
      fetchVisitorAnalytics();
    } else if (isAdmin) {
      fetchVisitorAnalytics();
    } else if (isArtist) {
      // Artists need to fetch payment_info_visible config
      fetchPaymentInfoVisibility();
    }
  }, [userProfile, platformConfigAccess, isAdmin, isArtist]);

  useEffect(() => {
    if (isAdmin && activeGroup === 'tips') {
      fetchTipsLog();
    }
  }, [isAdmin, activeGroup, tipsFilterStatus, tipsFilterArtistId, tipsFilterSenderEmail, tipsFilterAmountMin, tipsFilterAmountMax, tipsFilterDateFrom, tipsFilterDateTo]);

  useEffect(() => {
    if (isAdmin && activeGroup === 'tips') {
      fetchArtistOptionsForTips();
    }
  }, [isAdmin, activeGroup]);

  const fetchAppConfig = async () => {
    try {
      setLoadingConfig(true);
      const { data, error } = await supabase
        .from('app_config')
        .select('key, value')
        .in('key', [
          'artist_login_enabled', 
          'live_chat_enabled', 
          'recording_enabled', 
          'artist_recordings_visible',
          'admin_recordings_visible',
          'admin_user_delete_enabled',
          'payment_info_visible',
          'live_notifications_fans_enabled',
          'live_notifications_artists_enabled',
          'live_notifications_admins_enabled',
          'advertisements_home_enabled',
          'visitor_counter_visible',
          'visitor_count_base',
          'gift_enabled',
          'creator_studio_analytics_enabled',
          'platform_revenue_percentage',
          'artist_revenue_percentage',
          'desktop_mode_on_mobile',
          'live_event_notifications_enabled',
          'live_event_email_notify_admins',
          'live_event_email_notify_artists',
          'live_event_email_notify_fans',
          'event_scheduled_phone_notify_followers',
          'event_scheduled_phone_notify_all',
          'live_event_started_phone_notify_followers',
          'live_event_started_phone_notify_all',
          'auth_gate_enabled',
          'artist_management_communication_enabled',
          'bundles_enabled',
          'replays_enabled',
          'live_replay_bundle_enabled',
          'artist_application_enabled',
          'default_event_price',
          'default_event_duration',
          'streaming_max_minutes',
          'streaming_warning_minutes',
        'tip_platform_percentage',
        'artist_min_followers',
          'artist_survey_max_countries',
          'artist_survey_artists_per_country',
          'artist_survey_popup_days',
          'mobile_money_payments_enabled',
          'pawapay_enabled',
          'dusupay_enabled',
        ]);

      if (error) throw error;

      const config: any = {
        artist_login_enabled: true,
        live_chat_enabled: true,
        recording_enabled: true,
        artist_recordings_visible: true,
        admin_recordings_visible: true,
        admin_user_delete_enabled: true,
        payment_info_visible: true,
        live_notifications_fans_enabled: true,
        live_notifications_artists_enabled: true,
        live_notifications_admins_enabled: true,
        advertisements_home_enabled: true,
        visitor_counter_visible: true,
        visitor_count_base: 0,
        gift_enabled: true,
        creator_studio_analytics_enabled: true,
        platform_revenue_percentage: 30,
        artist_revenue_percentage: 70,
        desktop_mode_on_mobile: false,
        live_event_notifications_enabled: true,
        live_event_email_notify_admins: true,
        live_event_email_notify_artists: true,
        live_event_email_notify_fans: true,
        event_scheduled_phone_notify_followers: false,
        event_scheduled_phone_notify_all: false,
        live_event_started_phone_notify_followers: false,
        live_event_started_phone_notify_all: false,
        auth_gate_enabled: true,
        artist_management_communication_enabled: true,
        bundles_enabled: true,
        replays_enabled: true,
        live_replay_bundle_enabled: true,
        artist_application_enabled: true,
        default_event_price: 1.99,
        default_event_duration: 60,
        streaming_max_minutes: 60,
        streaming_warning_minutes: 5,
        tip_platform_percentage: 20,
        artist_min_followers: 100000,
        artist_survey_max_countries: 5,
        artist_survey_artists_per_country: 5,
        artist_survey_popup_days: 30,
        mobile_money_payments_enabled: false,
        pawapay_enabled: false,
        dusupay_enabled: false,
      };

      data?.forEach(item => {
        const isEnabled = item.value === true || item.value === 'true';
        if (item.key === 'artist_login_enabled') {
          config.artist_login_enabled = isEnabled;
        } else if (item.key === 'live_chat_enabled') {
          config.live_chat_enabled = isEnabled;
        } else if (item.key === 'recording_enabled') {
          config.recording_enabled = isEnabled;
        } else if (item.key === 'artist_recordings_visible') {
          config.artist_recordings_visible = isEnabled;
        } else if (item.key === 'admin_recordings_visible') {
          config.admin_recordings_visible = isEnabled;
        } else if (item.key === 'admin_user_delete_enabled') {
          config.admin_user_delete_enabled = isEnabled;
        } else if (item.key === 'payment_info_visible') {
          config.payment_info_visible = isEnabled;
        } else if (item.key === 'live_notifications_fans_enabled') {
          config.live_notifications_fans_enabled = isEnabled;
        } else if (item.key === 'live_notifications_artists_enabled') {
          config.live_notifications_artists_enabled = isEnabled;
        } else if (item.key === 'live_notifications_admins_enabled') {
          config.live_notifications_admins_enabled = isEnabled;
        } else if (item.key === 'advertisements_home_enabled') {
          config.advertisements_home_enabled = isEnabled;
        } else if (item.key === 'visitor_counter_visible') {
          config.visitor_counter_visible = isEnabled;
        } else if (item.key === 'visitor_count_base') {
          // Parse the base count (can be number or string)
          const baseValue = typeof item.value === 'number' ? item.value : parseInt(item.value as string, 10);
          config.visitor_count_base = isNaN(baseValue) ? 0 : baseValue;
          setVisitorCountBase(baseValue.toString());
        } else if (item.key === 'gift_enabled') {
          config.gift_enabled = isEnabled;
        } else if (item.key === 'creator_studio_analytics_enabled') {
          config.creator_studio_analytics_enabled = isEnabled;
        } else if (item.key === 'platform_revenue_percentage') {
          const percentageValue = typeof item.value === 'number' ? item.value : parseFloat(item.value as string);
          config.platform_revenue_percentage = isNaN(percentageValue) ? 30 : percentageValue;
          setPlatformRevenuePercentage(percentageValue.toString());
        } else if (item.key === 'artist_revenue_percentage') {
          const percentageValue = typeof item.value === 'number' ? item.value : parseFloat(item.value as string);
          config.artist_revenue_percentage = isNaN(percentageValue) ? 70 : percentageValue;
          setArtistRevenuePercentage(percentageValue.toString());
        } else if (item.key === 'desktop_mode_on_mobile') {
          config.desktop_mode_on_mobile = isEnabled;
        } else if (item.key === 'live_event_notifications_enabled') {
          config.live_event_notifications_enabled = isEnabled;
        } else if (item.key === 'live_event_email_notify_admins') {
          config.live_event_email_notify_admins = isEnabled;
        } else if (item.key === 'live_event_email_notify_artists') {
          config.live_event_email_notify_artists = isEnabled;
        } else if (item.key === 'live_event_email_notify_fans') {
          config.live_event_email_notify_fans = isEnabled;
        } else if (item.key === 'event_scheduled_phone_notify_followers') {
          config.event_scheduled_phone_notify_followers = isEnabled;
        } else if (item.key === 'event_scheduled_phone_notify_all') {
          config.event_scheduled_phone_notify_all = isEnabled;
        } else if (item.key === 'live_event_started_phone_notify_followers') {
          config.live_event_started_phone_notify_followers = isEnabled;
        } else if (item.key === 'live_event_started_phone_notify_all') {
          config.live_event_started_phone_notify_all = isEnabled;
        } else if (item.key === 'auth_gate_enabled') {
          config.auth_gate_enabled = isEnabled;
        } else if (item.key === 'artist_management_communication_enabled') {
          config.artist_management_communication_enabled = isEnabled;
        } else if (item.key === 'bundles_enabled') {
          config.bundles_enabled = isEnabled;
        } else if (item.key === 'replays_enabled') {
          config.replays_enabled = isEnabled;
        } else if (item.key === 'live_replay_bundle_enabled') {
          config.live_replay_bundle_enabled = isEnabled;
        } else if (item.key === 'artist_application_enabled') {
          config.artist_application_enabled = isEnabled;
        } else if (item.key === 'default_event_price') {
          const priceVal = typeof item.value === 'number' ? item.value : parseFloat(item.value as string);
          config.default_event_price = isNaN(priceVal) ? 1.99 : priceVal;
          setDefaultEventPrice(config.default_event_price.toString());
        } else if (item.key === 'default_event_duration') {
          const durationVal = typeof item.value === 'number' ? item.value : parseInt(item.value as string, 10);
          config.default_event_duration = isNaN(durationVal) ? 60 : durationVal;
          setDefaultEventDuration(config.default_event_duration.toString());
        } else if (item.key === 'streaming_max_minutes') {
          const maxVal = typeof item.value === 'number' ? item.value : parseInt(item.value as string, 10);
          config.streaming_max_minutes = isNaN(maxVal) ? 60 : maxVal;
          setStreamingMaxMinutes(config.streaming_max_minutes.toString());
        } else if (item.key === 'streaming_warning_minutes') {
          const warnVal = typeof item.value === 'number' ? item.value : parseInt(item.value as string, 10);
          config.streaming_warning_minutes = isNaN(warnVal) ? 5 : warnVal;
          setStreamingWarningMinutes(config.streaming_warning_minutes.toString());
        } else if (item.key === 'tip_platform_percentage') {
          const pctVal = typeof item.value === 'number' ? item.value : parseFloat(item.value as string);
          config.tip_platform_percentage = Number.isFinite(pctVal) ? Math.max(0, Math.min(100, pctVal)) : 20;
          setTipPlatformPercentage(config.tip_platform_percentage.toString());
        } else if (item.key === 'artist_min_followers') {
          const minFollowersVal = typeof item.value === 'number' ? item.value : parseInt(item.value as string, 10);
          config.artist_min_followers = Number.isFinite(minFollowersVal) ? Math.max(0, minFollowersVal) : 100000;
        } else if (item.key === 'artist_survey_max_countries') {
          const maxCountriesVal = typeof item.value === 'number' ? item.value : parseInt(item.value as string, 10);
          config.artist_survey_max_countries = Number.isFinite(maxCountriesVal) ? Math.max(1, maxCountriesVal) : 5;
        } else if (item.key === 'artist_survey_artists_per_country') {
          const maxArtistsVal = typeof item.value === 'number' ? item.value : parseInt(item.value as string, 10);
          config.artist_survey_artists_per_country = Number.isFinite(maxArtistsVal) ? Math.max(1, maxArtistsVal) : 5;
        } else if (item.key === 'artist_survey_popup_days') {
          const daysVal = typeof item.value === 'number' ? item.value : parseInt(item.value as string, 10);
          config.artist_survey_popup_days = Number.isFinite(daysVal) ? Math.max(1, daysVal) : 30;
        } else if (item.key === 'mobile_money_payments_enabled') {
          config.mobile_money_payments_enabled = isEnabled;
        } else if (item.key === 'pawapay_enabled') {
          config.pawapay_enabled = isEnabled;
        } else if (item.key === 'dusupay_enabled') {
          config.dusupay_enabled = isEnabled;
        }
      });

      setAppConfig(config);
    } catch (err) {
      console.error('Error fetching app config:', err);
    } finally {
      setLoadingConfig(false);
    }
  };

  const fetchPaymentInfoVisibility = async () => {
    try {
      const { data, error } = await supabase
        .from('app_config')
        .select('value')
        .eq('key', 'payment_info_visible')
        .single();

      if (error) {
        // If config doesn't exist, default to true
        setAppConfig(prev => ({ ...prev, payment_info_visible: true }));
        return;
      }

      const isVisible = data?.value === true || data?.value === 'true';
      setAppConfig(prev => ({ ...prev, payment_info_visible: isVisible }));
    } catch (err) {
      console.error('Error fetching payment info visibility:', err);
      // Default to true on error
      setAppConfig(prev => ({ ...prev, payment_info_visible: true }));
    }
  };

  const fetchVisitorAnalytics = async () => {
    try {
      setLoadingVisitorAnalytics(true);
      const { data, error } = await supabase.rpc('get_visitor_analytics');
      
      if (error) throw error;
      
      setVisitorAnalytics(data);
    } catch (err) {
      console.error('Error fetching visitor analytics:', err);
    } finally {
      setLoadingVisitorAnalytics(false);
    }
  };

  const fetchArtistOptionsForTips = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, username')
        .eq('user_type', 'artist')
        .order('full_name');
      if (!error) setArtistOptions(data || []);
    } catch {
      setArtistOptions([]);
    }
  };

  const fetchTipsLog = async () => {
    try {
      setTipsLogLoading(true);
      let q = supabase
        .from('tips')
        .select('id, artist_id, event_id, unregistered_artist_name, sender_id, sender_email, amount, message, status, created_at, completed_at')
        .order('created_at', { ascending: false });
      if (tipsFilterStatus.trim()) {
        q = q.eq('status', tipsFilterStatus.trim());
      }
      if (tipsFilterArtistId.trim()) {
        q = q.eq('artist_id', tipsFilterArtistId.trim());
      }
      if (tipsFilterSenderEmail.trim()) {
        q = q.ilike('sender_email', `%${tipsFilterSenderEmail.trim()}%`);
      }
      if (tipsFilterAmountMin !== '' && !isNaN(parseFloat(tipsFilterAmountMin))) {
        q = q.gte('amount', parseFloat(tipsFilterAmountMin));
      }
      if (tipsFilterAmountMax !== '' && !isNaN(parseFloat(tipsFilterAmountMax))) {
        q = q.lte('amount', parseFloat(tipsFilterAmountMax));
      }
      if (tipsFilterDateFrom) {
        q = q.gte('created_at', `${tipsFilterDateFrom}T00:00:00.000Z`);
      }
      if (tipsFilterDateTo) {
        q = q.lte('created_at', `${tipsFilterDateTo}T23:59:59.999Z`);
      }
      const { data, error } = await q;
      if (error) throw error;
      setTipsLog(data || []);
    } catch (err) {
      console.error('Error fetching tips log:', err);
      setTipsLog([]);
    } finally {
      setTipsLogLoading(false);
    }
  };

  const updateVisitorCountBase = async (newBase: number) => {
    try {
      setLoadingConfig(true);
      setError(null);
      
      const { error } = await supabase.rpc('update_app_config', {
        config_key: 'visitor_count_base',
        config_value: newBase
      });

      if (error) throw error;

      setAppConfig(prev => ({ ...prev, visitor_count_base: newBase }));
      setVisitorCountBase(newBase.toString());
      setSuccess('Visitor count base updated successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      console.error('Error updating visitor count base:', err);
      setError(err.message || 'Failed to update visitor count base');
    } finally {
      setLoadingConfig(false);
    }
  };

  const resetVisitorCount = async () => {
    if (!confirm('Are you sure you want to reset the visitor count? This will set the base to the current total and preserve the displayed number.')) {
      return;
    }

    try {
      setResettingVisitorCount(true);
      setError(null);

      // Get current total unique visitors
      const { data: currentTotal, error: countError } = await supabase.rpc('get_total_visitor_count');
      
      if (countError) throw countError;

      // Reset: set base to current total (preserves the displayed number)
      const newBase = currentTotal || 0;
      
      const { data: resetData, error: resetError } = await supabase.rpc('reset_visitor_count', {
        new_base_count: newBase
      });

      if (resetError) throw resetError;

      setAppConfig(prev => ({ ...prev, visitor_count_base: newBase }));
      setVisitorCountBase(newBase.toString());
      setSuccess(`Visitor count reset! Base set to ${newBase.toLocaleString()}. The displayed count will remain the same.`);
      setTimeout(() => setSuccess(null), 5000);
      
      // Refresh analytics
      if (isAdmin) {
        fetchVisitorAnalytics();
      }
    } catch (err: any) {
      console.error('Error resetting visitor count:', err);
      setError(err.message || 'Failed to reset visitor count');
    } finally {
      setResettingVisitorCount(false);
    }
  };

  const updateConfig = async (key: string, value: boolean | number) => {
    try {
      setLoadingConfig(true);
      setError(null);
      
      // Convert value to JSONB format
      const jsonbValue = typeof value === 'boolean' 
        ? value 
        : typeof value === 'number'
        ? value
        : value;
      
      // Try using RPC function first (more reliable)
      const { error: rpcError } = await supabase.rpc('update_app_config', {
        config_key: key,
        config_value: jsonbValue
      });

      if (rpcError) {
        // Fallback to direct update if RPC function doesn't exist
        console.warn('RPC function failed, trying direct update:', rpcError);
        
        // First try to update existing record
        const { data: existing } = await supabase
          .from('app_config')
          .select('id')
          .eq('key', key)
          .single();

        let error;
        
        if (existing) {
          // Update existing record - don't specify id, let database handle it
          const { error: updateError } = await supabase
            .from('app_config')
            .update({ value: value as any })
            .eq('key', key);
          error = updateError;
        } else {
          // Insert new record (description is optional)
          // Don't specify id - let the database auto-generate it
          const insertData: any = {
            key,
            value: value as any
          };
          
          const { error: insertError } = await supabase
            .from('app_config')
            .insert(insertData);
          error = insertError;
        }

        if (error) {
          console.error('Config update error:', error);
          throw new Error(error.message || `Failed to update ${key}. Please run the database migration.`);
        }
      }

      setAppConfig(prev => ({ ...prev, [key]: value }));
      const keyLabels: { [key: string]: string } = {
        'artist_login_enabled': 'Artist login',
        'live_chat_enabled': 'Live chat',
        'recording_enabled': 'Recording',
        'artist_recordings_visible': 'Artist recordings visibility',
        'admin_recordings_visible': 'Admin Tools Recordings page',
        'admin_user_delete_enabled': 'Delete user in User Management',
        'payment_info_visible': 'Payment information section',
        'live_notifications_fans_enabled': 'Live notifications for fans',
        'live_notifications_artists_enabled': 'Live notifications for artists',
        'live_notifications_admins_enabled': 'Live notifications for admins',
        'gift_enabled': 'Gift button',
        'creator_studio_analytics_enabled': 'Creator Studio Analytics',
        'desktop_mode_on_mobile': 'Desktop mode on mobile',
        'auth_gate_enabled': 'Auth gate pop-up',
        'artist_management_communication_enabled': 'Communication (Artist Management)',
        'bundles_enabled': 'Ticket Bundles',
        'replays_enabled': 'Replays',
        'live_replay_bundle_enabled': 'Live + Replay bundle',
        'artist_application_enabled': 'Artist Application CTA',
        'artist_min_followers': 'Artist minimum followers threshold',
        'artist_survey_max_countries': 'Artist survey: max countries',
        'artist_survey_artists_per_country': 'Artist survey: artists per country',
        'artist_survey_popup_days': 'Artist survey popup interval (days)',
        'mobile_money_payments_enabled': 'Mobile money payments (global)',
        'pawapay_enabled': 'Pawapay',
        'dusupay_enabled': 'DusuPay',
      };
      
      // Update appConfig state with the new value
      setAppConfig(prev => ({
        ...prev,
        [key]: value
      }));
      
      setSuccess(`${keyLabels[key] || key} ${value ? 'enabled' : 'disabled'} successfully`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      console.error('Error updating config:', err);
      setError(err?.message || `Failed to update ${key}. Please ensure you have super admin permissions and the migration has been run.`);
      setTimeout(() => setError(null), 5000);
    } finally {
      setLoadingConfig(false);
    }
  };


  const fetchStats = async () => {
    if (!userProfile) return;
    
    try {
      setLoadingStats(true);
      
      if (isArtist) {
        // Artist stats
        const { data: events } = await supabase
          .from('events')
          .select('id, viewer_count, price, status, start_time, duration')
          .eq('artist_id', userProfile.id);

        const eventsList = events || [];
        const totalViewers = eventsList.reduce((sum, e) => sum + (e.viewer_count || 0), 0);
        const activeEvents = eventsList.filter(e => e.status === 'live' || e.status === 'scheduled').length;
        
        // Filter upcoming events (not ended)
        const now = new Date();
        const upcomingEvents = eventsList.filter(e => {
          if (e.status === 'ended') return false;
          const eventStart = new Date(e.start_time);
          const eventEnd = new Date(eventStart.getTime() + (e.duration || 0) * 60000);
          return now <= eventEnd;
        });
        
        // Calculate tickets sold for upcoming concerts only
        const upcomingEventIds = upcomingEvents.map(e => e.id);
        let ticketsSold = 0;
        
        if (upcomingEventIds.length > 0) {
          const { data: tickets } = await supabase
            .from('tickets')
            .select('id')
            .in('event_id', upcomingEventIds)
            .eq('status', 'active');
          
          ticketsSold = tickets?.length || 0;
        }

        setStats({
          eventsCount: eventsList.length,
          totalViewers,
          totalRevenue: ticketsSold, // Store tickets sold in totalRevenue field for artists
          activeEvents,
          totalUsers: 0,
          totalArtists: 0,
          totalAdmins: 0,
          totalTickets: ticketsSold
        });
      } else if (isAdmin) {
        // Admin stats
        const [usersResult, artistsResult, adminsResult, eventsResult] = await Promise.all([
          supabase.from('profiles').select('id', { count: 'exact', head: true }),
          supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('user_type', 'artist'),
          supabase.from('profiles').select('id', { count: 'exact', head: true }).in('user_type', ['global_admin', 'super_admin']),
          supabase.from('events').select('id, status')
        ]);

        const eventsList = eventsResult.data || [];
        const activeEvents = eventsList.filter(e => e.status === 'live' || e.status === 'scheduled').length;

        const { data: allTickets } = await supabase
          .from('tickets')
          .select(`
            id,
            events:event_id (
              price
            )
          `)
          .eq('status', 'active');

        const totalRevenue = allTickets?.reduce((sum, t) => {
          const price = (t.events as any)?.price || 0;
          return sum + price;
        }, 0) || 0;

        setStats({
          eventsCount: eventsList.length,
          totalViewers: 0,
          totalRevenue,
          activeEvents,
          totalUsers: usersResult.count || 0,
          totalArtists: artistsResult.count || 0,
          totalAdmins: adminsResult.count || 0,
          totalTickets: allTickets?.length || 0
        });
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  const generateFreeAccessLink = async () => {
    if (!selectedEventId || !userEmail) {
      setError('Please select an event and enter a user email');
      setTimeout(() => setError(null), 5000);
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userEmail.trim())) {
      setError('Please enter a valid email address');
      setTimeout(() => setError(null), 5000);
      return;
    }

    try {
      setGeneratingLink(true);
      setError(null);

      // Create a special admin-granted ticket (or use existing one)
      // First check if ticket already exists
      const { data: existingTicket } = await supabase
        .from('tickets')
        .select('id')
        .eq('event_id', selectedEventId)
        .ilike('email', userEmail.trim().toLowerCase())
        .eq('status', 'active')
        .maybeSingle();

      let ticketCreated = false;
      if (!existingTicket) {
        // Only create if it doesn't exist
        const { error: ticketError } = await supabase
          .from('tickets')
          .insert({
            event_id: selectedEventId,
            email: userEmail.trim().toLowerCase(),
            status: 'active',
            // Add metadata to indicate this is admin-granted
            stripe_payment_id: 'admin_granted',
            stripe_session_id: `admin_${Date.now()}`,
          });

        if (ticketError) {
          console.error('Error creating admin-granted ticket:', ticketError);
          // Don't throw - we can still generate the link even if ticket creation fails
          // The user might already have a ticket or there might be a constraint issue
          console.warn('Ticket creation failed, but continuing with link generation');
        } else {
          ticketCreated = true;
        }
      } else {
        console.log('Ticket already exists for this user/event');
      }

      // Generate the access link - always use production URL, not localhost
      // Priority: VITE_SITE_URL env var > current origin if production > fallback production URL
      let siteUrl = import.meta.env.VITE_SITE_URL;
      
      if (!siteUrl) {
        // If no env var, check if we're already on production (Vercel, Netlify, etc.)
        const isProduction = !window.location.hostname.includes('localhost') && 
                            !window.location.hostname.includes('127.0.0.1') &&
                            !window.location.hostname.includes('192.168') &&
                            (window.location.hostname.includes('vercel.app') || 
                             window.location.hostname.includes('netlify.app') ||
                             window.location.hostname.includes('dreemystar'));
        
        if (isProduction) {
          siteUrl = window.location.origin;
        } else {
          // Fallback to production URL - use Vercel URL since that's where it's deployed
          siteUrl = 'https://dreemystar.vercel.app';
        }
      }
      
      // Ensure we never use localhost in the generated link
      if (siteUrl.includes('localhost') || siteUrl.includes('127.0.0.1')) {
        siteUrl = 'https://dreemystar.vercel.app';
      }
      
      const accessLink = `${siteUrl}/watch/${selectedEventId}?email=${encodeURIComponent(userEmail.trim())}`;
      
      console.log('🔗 Generated access link:', {
        siteUrl,
        hostname: window.location.hostname,
        accessLink,
        hasEnvVar: !!import.meta.env.VITE_SITE_URL
      });

      // Get event details for logging
      const selectedEvent = availableEvents.find(e => e.id === selectedEventId);

      // Log admin action to analytics (admin-granted tickets will show in ticket purchases)
      // The ticket itself with stripe_payment_id='admin_granted' will appear in analytics
      // We can also add a note in the ticket metadata for tracking
      if (existingTicket) {
        // Update existing ticket to mark it as admin-granted
        await supabase
          .from('tickets')
          .update({
            stripe_payment_id: 'admin_granted',
            stripe_session_id: `admin_${Date.now()}`,
          })
          .eq('id', existingTicket.id);
      }
      
      setGeneratedLink(accessLink);
      setSuccess('Free access link generated successfully!');
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      console.error('Error generating free access link:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate access link');
      setTimeout(() => setError(null), 5000);
    } finally {
      setGeneratingLink(false);
    }
  };

  const sendAccessLinkEmail = async () => {
    if (!generatedLink || !userEmail || !selectedEventId) {
      setError('Please generate a link first');
      setTimeout(() => setError(null), 5000);
      return;
    }

    try {
      setSendingEmail(true);
      setError(null);

      // Get event details
      const selectedEvent = availableEvents.find(e => e.id === selectedEventId);
      if (!selectedEvent) {
        throw new Error('Event not found');
      }

      // Call Edge Function to send email using direct fetch
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        if (!supabaseUrl) {
          throw new Error('Service unavailable');
        }

        // Get the current session token for authentication
        const { data: { session } } = await supabase.auth.getSession();
        const authToken = session?.access_token;

        const functionUrl = `${supabaseUrl}/functions/v1/send-free-access-link`;
        
        console.log('📧 Calling Edge Function:', functionUrl);
        console.log('📧 Request payload:', {
          email: userEmail.trim(),
          eventId: selectedEventId,
          eventTitle: selectedEvent.title,
          accessLink: generatedLink,
        });

        const response = await fetch(functionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken || import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()}`,
          },
          body: JSON.stringify({
            email: userEmail.trim(),
            eventId: selectedEventId,
            eventTitle: selectedEvent.title,
            accessLink: generatedLink,
            locale: (i18n.language || 'en').slice(0, 2),
          }),
        });

        console.log('📧 Response status:', response.status);
        console.log('📧 Response headers:', Object.fromEntries(response.headers.entries()));

        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ Edge Function error:', errorText);
          
          let errorMessage = 'Failed to send email';
          try {
            const errorJson = JSON.parse(errorText);
            errorMessage = errorJson.error || errorJson.message || errorMessage;
          } catch (e) {
            errorMessage = errorText || errorMessage;
          }

          if (response.status === 404) {
            throw new Error('Email function not found. Please ensure send-free-access-link is deployed.');
          } else if (response.status === 401 || response.status === 403) {
            throw new Error('Authentication failed. Please try again.');
          } else {
            throw new Error(errorMessage);
          }
        }

        const responseData = await response.json();
        console.log('✅ Email sent successfully:', responseData);

        setSuccess('Access link sent successfully to ' + userEmail);
        setTimeout(() => setSuccess(null), 5000);
        
        // Reset form
        setUserEmail('');
        setSelectedEventId('');
        setGeneratedLink('');
      } catch (functionErr: any) {
        // If Edge Function fails, provide helpful error message
        console.error('Error calling Edge Function:', functionErr);
        
        const errorMsg = functionErr.message || 'Unknown error';
        setError(`Failed to send email: ${errorMsg}. You can copy the link above and send it manually.`);
        setTimeout(() => setError(null), 8000);
      }
    } catch (err) {
      console.error('Error sending access link email:', err);
      setError(err instanceof Error ? err.message : 'Failed to send email. You can copy the link above and send it manually.');
      setTimeout(() => setError(null), 8000);
    } finally {
      setSendingEmail(false);
    }
  };

  const copyLinkToClipboard = async () => {
    if (!generatedLink) return;
    
    try {
      await navigator.clipboard.writeText(generatedLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  };

  const handleResetTicketsSold = async () => {
    if (!userProfile || !isArtist) return;

    // Refresh stats - the count automatically only includes upcoming concerts
    // So "resetting" is just refreshing the display
    try {
      await fetchStats();
      setSuccess('Ticket count refreshed');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error refreshing tickets sold:', err);
      setError('Failed to refresh ticket count');
    }
  };

  // Listen for platform refresh event (after fetchStats is defined)
  useEffect(() => {
    const handlePlatformRefresh = () => {
      console.log('🔄 Platform refresh triggered - refreshing dashboard data');
      fetchStats();
      if (isAdmin) {
        fetchVisitorAnalytics();
      }
    };

    window.addEventListener('platformRefresh', handlePlatformRefresh);
    return () => window.removeEventListener('platformRefresh', handlePlatformRefresh);
  }, [isAdmin, userProfile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen relative overflow-hidden pt-24 pb-12">
      <PawapayBundleReturnHandler />
      {/* Animated gradient background */}
      <div className="fixed inset-0 bg-gradient-to-br from-purple-900/20 via-pink-900/20 to-cyan-900/20 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(120,119,198,0.3),transparent_50%)]"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(219,39,119,0.3),transparent_50%)]"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(59,130,246,0.2),transparent_50%)]"></div>
      </div>

      {/* Animated floating elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-20 left-10 w-72 h-72 bg-purple-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl animate-pulse delay-2000"></div>
      </div>

      <div className="container mx-auto px-6 py-8 relative z-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl md:text-5xl font-bold mb-2 bg-gradient-to-r from-purple-300 via-pink-300 to-cyan-300 bg-clip-text text-transparent flex items-center gap-3">
            <Sparkles className="w-8 h-8 text-purple-400" />
            {isSuperAdmin ? 'Super Admin Dashboard' : isAdmin ? 'Admin Dashboard' : 'Artist Dashboard'}
          </h1>
          <p className="text-gray-400 text-lg">Manage your {isAdmin ? 'platform' : 'profile'} and track your performance</p>
          <Link
            to="/profile"
            className="inline-flex items-center gap-2 mt-3 text-purple-400 hover:text-purple-300 text-sm font-medium transition-colors"
          >
            <User className="w-4 h-4" />
            Edit my profile
          </Link>
        </div>

        {/* Group navigation (admin / super admin) */}
        {(isAdmin || isSuperAdmin) && (
          <div className="flex flex-wrap gap-2 mb-6">
            {[
              { id: 'overview' as const, label: 'Overview', icon: LayoutGrid },
              ...(isAdmin ? [
                { id: 'analytics' as const, label: 'Visitor analytics', icon: BarChart3 },
                { id: 'tips' as const, label: 'Tips log', icon: Gift },
              ] : []),
              ...(isSuperAdmin
                ? [
                    { id: 'features' as const, label: 'Feature toggles', icon: ToggleRight },
                    { id: 'revenue' as const, label: 'Revenue & pricing', icon: Euro },
                    { id: 'tools' as const, label: 'Tools', icon: Link2 },
                    { id: 'applications' as const, label: 'Artist applications', icon: Sparkles },
                  ]
                : userProfile?.user_type === 'global_admin'
                  ? [{ id: 'features' as const, label: 'Feature toggles', icon: ToggleRight }]
                  : []),
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveGroup(id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                  activeGroup === id
                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/25'
                    : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white border border-white/10'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Stats Cards (Overview for admins; always for artists) */}
        {!loadingStats && (activeGroup === 'overview' || !isAdmin) && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-10">
            {isArtist ? (
              <>
                <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 shadow-xl hover:shadow-2xl transition-all duration-300">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-400 text-sm mb-1">Total Events</p>
                      <p className="text-3xl font-bold bg-gradient-to-r from-purple-300 to-pink-300 bg-clip-text text-transparent">
                        {stats.eventsCount}
                      </p>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                      <Calendar className="w-6 h-6 text-purple-300" />
                    </div>
                  </div>
                </div>
                <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 shadow-xl hover:shadow-2xl transition-all duration-300">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-400 text-sm mb-1">Total Viewers</p>
                      <p className="text-3xl font-bold bg-gradient-to-r from-purple-300 to-pink-300 bg-clip-text text-transparent">
                        {stats.totalViewers.toLocaleString()}
                      </p>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                      <Eye className="w-6 h-6 text-purple-300" />
                    </div>
                  </div>
                </div>
                <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 shadow-xl hover:shadow-2xl transition-all duration-300">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-gray-400 text-sm">Tickets Sold (Upcoming)</p>
                        {stats.totalRevenue > 0 && (
                          <button
                            onClick={handleResetTicketsSold}
                            className="text-xs text-purple-400 hover:text-purple-300 transition-colors flex items-center gap-1"
                            title="Refresh ticket count (only counts upcoming concerts)"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Refresh
                          </button>
                        )}
                      </div>
                      <p className="text-3xl font-bold bg-gradient-to-r from-green-300 to-emerald-300 bg-clip-text text-transparent">
                        {stats.totalRevenue}
                      </p>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center">
                      <Ticket className="w-6 h-6 text-green-300" />
                    </div>
                  </div>
                </div>
                <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 shadow-xl hover:shadow-2xl transition-all duration-300">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-400 text-sm mb-1">Active Events</p>
                      <p className="text-3xl font-bold bg-gradient-to-r from-blue-300 to-cyan-300 bg-clip-text text-transparent">
                        {stats.activeEvents}
                      </p>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center">
                      <Activity className="w-6 h-6 text-blue-300" />
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 shadow-xl hover:shadow-2xl transition-all duration-300">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-400 text-sm mb-1">Total Users</p>
                      <p className="text-3xl font-bold bg-gradient-to-r from-purple-300 to-pink-300 bg-clip-text text-transparent">
                        {stats.totalUsers}
                      </p>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                      <Users className="w-6 h-6 text-purple-300" />
                    </div>
                  </div>
                </div>
                <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 shadow-xl hover:shadow-2xl transition-all duration-300">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-400 text-sm mb-1">Total Artists</p>
                      <p className="text-3xl font-bold bg-gradient-to-r from-purple-300 to-pink-300 bg-clip-text text-transparent">
                        {stats.totalArtists}
                      </p>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                      <Music className="w-6 h-6 text-purple-300" />
                    </div>
                  </div>
                </div>
                <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 shadow-xl hover:shadow-2xl transition-all duration-300">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-400 text-sm mb-1">Total Events</p>
                      <p className="text-3xl font-bold bg-gradient-to-r from-blue-300 to-cyan-300 bg-clip-text text-transparent">
                        {stats.eventsCount}
                      </p>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center">
                      <Calendar className="w-6 h-6 text-blue-300" />
                    </div>
                  </div>
                </div>
                <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 shadow-xl hover:shadow-2xl transition-all duration-300">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-400 text-sm mb-1">Total Revenue</p>
                      <p className="text-3xl font-bold bg-gradient-to-r from-green-300 to-emerald-300 bg-clip-text text-transparent">
                        ${stats.totalRevenue.toFixed(2)}
                      </p>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center">
                      <TrendingUp className="w-6 h-6 text-green-300" />
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Visitor Analytics Section for Admins */}
        {isAdmin && activeGroup === 'analytics' && (
          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-8 shadow-2xl mb-10">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-500/20 to-orange-500/20 flex items-center justify-center">
                <Eye className="w-5 h-5 text-yellow-300" />
              </div>
              <h2 className="text-3xl font-bold bg-gradient-to-r from-yellow-300 to-orange-300 bg-clip-text text-transparent">
                Visitor Analytics
              </h2>
            </div>

            {loadingVisitorAnalytics ? (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400"></div>
                <p className="text-gray-400 mt-4">Loading analytics...</p>
              </div>
            ) : visitorAnalytics ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-gray-400 text-sm">Total Visitors</p>
                    <Eye className="w-5 h-5 text-yellow-400" />
                  </div>
                  <p className="text-3xl font-bold text-white">
                    {visitorAnalytics.total?.toLocaleString() || 0}
                  </p>
                </div>
                <div className="backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-gray-400 text-sm">Today</p>
                    <TrendingUp className="w-5 h-5 text-green-400" />
                  </div>
                  <p className="text-3xl font-bold text-green-400">
                    {visitorAnalytics.today?.toLocaleString() || 0}
                  </p>
                </div>
                <div className="backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-gray-400 text-sm">This Week</p>
                    <Activity className="w-5 h-5 text-blue-400" />
                  </div>
                  <p className="text-3xl font-bold text-blue-400">
                    {visitorAnalytics.thisWeek?.toLocaleString() || 0}
                  </p>
                </div>
                <div className="backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-gray-400 text-sm">This Month</p>
                    <BarChart3 className="w-5 h-5 text-purple-400" />
                  </div>
                  <p className="text-3xl font-bold text-purple-400">
                    {visitorAnalytics.thisMonth?.toLocaleString() || 0}
                  </p>
                </div>
                <div className="backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-gray-400 text-sm">Active Now</p>
                    <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                  </div>
                  <p className="text-3xl font-bold text-green-400">
                    {visitorAnalytics.active?.toLocaleString() || 0}
                  </p>
                </div>
                <div className="backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-gray-400 text-sm">Total Page Views</p>
                    <Globe className="w-5 h-5 text-cyan-400" />
                  </div>
                  <p className="text-3xl font-bold text-cyan-400">
                    {visitorAnalytics.totalPageViews?.toLocaleString() || 0}
                  </p>
                </div>
                <div className="backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-gray-400 text-sm">Avg Session</p>
                    <Clock className="w-5 h-5 text-orange-400" />
                  </div>
                  <p className="text-3xl font-bold text-orange-400">
                    {visitorAnalytics.avgSessionDuration 
                      ? `${Math.floor(visitorAnalytics.avgSessionDuration / 60)}m ${visitorAnalytics.avgSessionDuration % 60}s`
                      : '0s'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-400">No analytics data available</p>
              </div>
            )}
          </div>
        )}

        {/* Tips log – Admins + Super Admins */}
        {isAdmin && activeGroup === 'tips' && (
          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-8 shadow-2xl mb-10">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-500/20 to-orange-500/20 flex items-center justify-center">
                <Gift className="w-5 h-5 text-yellow-300" />
              </div>
              <h2 className="text-3xl font-bold bg-gradient-to-r from-yellow-300 to-orange-300 bg-clip-text text-transparent">
                Tips log
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Status</label>
                <select
                  value={tipsFilterStatus}
                  onChange={(e) => setTipsFilterStatus(e.target.value)}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
                >
                  <option value="">All</option>
                  <option value="pending">Pending</option>
                  <option value="completed">Completed</option>
                  <option value="failed">Failed</option>
                  <option value="refunded">Refunded</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Artist</label>
                <select
                  value={tipsFilterArtistId}
                  onChange={(e) => setTipsFilterArtistId(e.target.value)}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
                >
                  <option value="">All</option>
                  {artistOptions.map((a) => (
                    <option key={a.id} value={a.id}>{a.full_name || a.username || a.id}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Sender email</label>
                <input
                  type="text"
                  value={tipsFilterSenderEmail}
                  onChange={(e) => setTipsFilterSenderEmail(e.target.value)}
                  placeholder="Filter by email"
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Amount min</label>
                  <input
                    type="number"
                    value={tipsFilterAmountMin}
                    onChange={(e) => setTipsFilterAmountMin(e.target.value)}
                    placeholder="Min"
                    min="0"
                    step="0.01"
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Amount max</label>
                  <input
                    type="number"
                    value={tipsFilterAmountMax}
                    onChange={(e) => setTipsFilterAmountMax(e.target.value)}
                    placeholder="Max"
                    min="0"
                    step="0.01"
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                  />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Date from</label>
                <input
                  type="date"
                  value={tipsFilterDateFrom}
                  onChange={(e) => setTipsFilterDateFrom(e.target.value)}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Date to</label>
                <input
                  type="date"
                  value={tipsFilterDateTo}
                  onChange={(e) => setTipsFilterDateTo(e.target.value)}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
                />
              </div>
            </div>

            {tipsLogLoading ? (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400"></div>
                <p className="text-gray-400 mt-4">Loading tips...</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="pb-3 pr-4 text-gray-400 font-medium">Date</th>
                      <th className="pb-3 pr-4 text-gray-400 font-medium">Artist</th>
                      <th className="pb-3 pr-4 text-gray-400 font-medium">Sender</th>
                      <th className="pb-3 pr-4 text-gray-400 font-medium">Amount</th>
                      <th className="pb-3 pr-4 text-gray-400 font-medium">Platform %</th>
                      <th className="pb-3 pr-4 text-gray-400 font-medium">Artist receives</th>
                      <th className="pb-3 pr-4 text-gray-400 font-medium">Status</th>
                      <th className="pb-3 pr-4 text-gray-400 font-medium">Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tipsLog.map((tip) => {
                      const pct = appConfig.tip_platform_percentage ?? 20;
                      const platformFee = Math.round((Number(tip.amount) * (pct / 100)) * 100) / 100;
                      const artistReceives = Math.round((Number(tip.amount) - platformFee) * 100) / 100;
                      const artist = artistOptions.find((a) => a.id === tip.artist_id);
                      const unreg =
                        typeof tip.unregistered_artist_name === 'string'
                          ? tip.unregistered_artist_name.trim()
                          : '';
                      const artistName = unreg
                        ? `${unreg} (scheduled)`
                        : artist
                          ? (artist.full_name || artist.username || tip.artist_id)
                          : (tip.artist_id ?? '—');
                      return (
                        <tr key={tip.id} className="border-b border-white/5">
                          <td className="py-3 pr-4 text-white text-sm">
                            {tip.created_at ? new Date(tip.created_at).toLocaleString() : '—'}
                          </td>
                          <td className="py-3 pr-4 text-white text-sm">{artistName}</td>
                          <td className="py-3 pr-4 text-gray-300 text-sm">{tip.sender_email || tip.sender_id || '—'}</td>
                          <td className="py-3 pr-4 text-white font-medium">${Number(tip.amount).toFixed(2)}</td>
                          <td className="py-3 pr-4 text-gray-400 text-sm">{pct}%</td>
                          <td className="py-3 pr-4 text-green-400 text-sm">${artistReceives.toFixed(2)}</td>
                          <td className="py-3 pr-4">
                            <span className={`text-sm px-2 py-0.5 rounded ${tip.status === 'completed' ? 'bg-green-500/20 text-green-400' : tip.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-gray-500/20 text-gray-400'}`}>
                              {tip.status}
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-gray-400 text-sm max-w-[200px] truncate" title={tip.message || ''}>{tip.message || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {tipsLog.length === 0 && (
                  <p className="text-center text-gray-400 py-8">No tips match the filters.</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Super Admin: Contract invites (staff page link) — Overview */}
        {isSuperAdmin && activeGroup === 'overview' && (
          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-8 shadow-2xl mb-10">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 flex items-center justify-center">
                <FileText className="w-6 h-6 text-violet-300" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white mb-1">Contract invites</h3>
                <p className="text-sm text-gray-400">Create and send contract-based artist registration links. Share the page link with admins or secretaries.</p>
              </div>
              <Link
                to="/contract-invites"
                className="ml-auto flex-shrink-0 px-6 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold hover:from-purple-700 hover:to-pink-700 transition-all flex items-center gap-2"
              >
                <Link2 className="w-4 h-4" />
                Open contract invites
              </Link>
            </div>
          </div>
        )}

        {/* Super Admin: Feature toggles + Revenue Settings (first card; revenue also uses second card) */}
        {((isSuperAdmin && (activeGroup === 'features' || activeGroup === 'revenue')) ||
          (userProfile?.user_type === 'global_admin' && activeGroup === 'features')) && (
          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-8 shadow-2xl mb-10">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                <Settings2 className="w-5 h-5 text-purple-300" />
              </div>
              <h2 className="text-3xl font-bold bg-gradient-to-r from-purple-300 to-pink-300 bg-clip-text text-transparent">
                {activeGroup === 'features' && 'Feature toggles'}
                {activeGroup === 'revenue' && 'Revenue & pricing'}
                {activeGroup === 'tools' && 'Tools'}
                {activeGroup === 'applications' && 'Artist applications'}
              </h2>
            </div>

            <div className="space-y-6">
              {/* Visibility: Feature toggles (Artist Login through Artist Application CTA) */}
              <div className={activeGroup === 'features' ? '' : 'hidden'}>
              {/* Artist Login Toggle */}
              <div className="flex items-center justify-between p-6 backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center">
                    <User className="w-6 h-6 text-blue-300" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">Artist Login</h3>
                    <p className="text-sm text-gray-400">Enable or disable artist signup option</p>
                  </div>
                </div>
                <button
                  onClick={() => updateConfig('artist_login_enabled', !appConfig.artist_login_enabled)}
                  disabled={loadingConfig}
                  className={`relative w-16 h-8 rounded-full transition-all duration-300 ${
                    appConfig.artist_login_enabled
                      ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                      : 'bg-gray-600'
                  } ${loadingConfig ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <div
                    className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform duration-300 ${
                      appConfig.artist_login_enabled ? 'translate-x-8' : 'translate-x-0'
                    }`}
                  />
                  {appConfig.artist_login_enabled ? (
                    <ToggleRight className="absolute top-1/2 left-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                  ) : (
                    <ToggleLeft className="absolute top-1/2 right-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                  )}
                </button>
              </div>

              {/* Live Chat Toggle */}
              <div className="flex items-center justify-between p-6 backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                    <MessageSquare className="w-6 h-6 text-purple-300" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">Live Chat</h3>
                    <p className="text-sm text-gray-400">Enable or disable chat in live events</p>
                  </div>
                </div>
                <button
                  onClick={() => updateConfig('live_chat_enabled', !appConfig.live_chat_enabled)}
                  disabled={loadingConfig}
                  className={`relative w-16 h-8 rounded-full transition-all duration-300 ${
                    appConfig.live_chat_enabled
                      ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                      : 'bg-gray-600'
                  } ${loadingConfig ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <div
                    className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform duration-300 ${
                      appConfig.live_chat_enabled ? 'translate-x-8' : 'translate-x-0'
                    }`}
                  />
                  {appConfig.live_chat_enabled ? (
                    <ToggleRight className="absolute top-1/2 left-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                  ) : (
                    <ToggleLeft className="absolute top-1/2 right-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                  )}
                </button>
              </div>

              {/* Recording Toggle */}
              <div className="flex items-center justify-between p-6 backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500/20 to-red-500/20 flex items-center justify-center">
                    <Video className="w-6 h-6 text-orange-300" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">Recording</h3>
                    <p className="text-sm text-gray-400">Enable or disable recording functionality in live streams</p>
                  </div>
                </div>
                <button
                  onClick={() => updateConfig('recording_enabled', !appConfig.recording_enabled)}
                  disabled={loadingConfig}
                  className={`relative w-16 h-8 rounded-full transition-all duration-300 ${
                    appConfig.recording_enabled
                      ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                      : 'bg-gray-600'
                  } ${loadingConfig ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <div
                    className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform duration-300 ${
                      appConfig.recording_enabled ? 'translate-x-8' : 'translate-x-0'
                    }`}
                  />
                  {appConfig.recording_enabled ? (
                    <ToggleRight className="absolute top-1/2 left-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                  ) : (
                    <ToggleLeft className="absolute top-1/2 right-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                  )}
                </button>
              </div>

              {/* Artist Recordings Visibility Toggle */}
              <div className="flex items-center justify-between p-6 backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center">
                    <Eye className="w-6 h-6 text-cyan-300" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">Artist Recordings Visibility</h3>
                    <p className="text-sm text-gray-400">Show or hide "My Recordings" in Artist Tools</p>
                  </div>
                </div>
                <button
                  onClick={() => updateConfig('artist_recordings_visible', !appConfig.artist_recordings_visible)}
                  disabled={loadingConfig}
                  className={`relative w-16 h-8 rounded-full transition-all duration-300 ${
                    appConfig.artist_recordings_visible
                      ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                      : 'bg-gray-600'
                  } ${loadingConfig ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <div
                    className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform duration-300 ${
                      appConfig.artist_recordings_visible ? 'translate-x-8' : 'translate-x-0'
                    }`}
                  />
                  {appConfig.artist_recordings_visible ? (
                    <ToggleRight className="absolute top-1/2 left-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                  ) : (
                    <ToggleLeft className="absolute top-1/2 right-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                  )}
                </button>
              </div>

              {/* Admin Tools Recordings Toggle */}
              <div className="flex items-center justify-between p-6 backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 flex items-center justify-center">
                    <Video className="w-6 h-6 text-violet-300" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">Recordings in Admin Tools</h3>
                    <p className="text-sm text-gray-400">Show or hide Recordings page link in Admin Tools for normal admins. Super admins always see it.</p>
                  </div>
                </div>
                <button
                  onClick={() => updateConfig('admin_recordings_visible', !appConfig.admin_recordings_visible)}
                  disabled={loadingConfig}
                  className={`relative w-16 h-8 rounded-full transition-all duration-300 ${
                    appConfig.admin_recordings_visible
                      ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                      : 'bg-gray-600'
                  } ${loadingConfig ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <div
                    className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform duration-300 ${
                      appConfig.admin_recordings_visible ? 'translate-x-8' : 'translate-x-0'
                    }`}
                  />
                  {appConfig.admin_recordings_visible ? (
                    <ToggleRight className="absolute top-1/2 left-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                  ) : (
                    <ToggleLeft className="absolute top-1/2 right-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                  )}
                </button>
              </div>

              {/* Delete user in User Management (for normal admins) */}
              <div className="flex items-center justify-between p-6 backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500/20 to-rose-500/20 flex items-center justify-center">
                    <UserX className="w-6 h-6 text-red-300" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">Delete User in User Management</h3>
                    <p className="text-sm text-gray-400">Allow or disallow normal admins to delete users. Super admins can always delete.</p>
                  </div>
                </div>
                <button
                  onClick={() => updateConfig('admin_user_delete_enabled', !appConfig.admin_user_delete_enabled)}
                  disabled={loadingConfig}
                  className={`relative w-16 h-8 rounded-full transition-all duration-300 ${
                    appConfig.admin_user_delete_enabled
                      ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                      : 'bg-gray-600'
                  } ${loadingConfig ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <div
                    className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform duration-300 ${
                      appConfig.admin_user_delete_enabled ? 'translate-x-8' : 'translate-x-0'
                    }`}
                  />
                  {appConfig.admin_user_delete_enabled ? (
                    <ToggleRight className="absolute top-1/2 left-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                  ) : (
                    <ToggleLeft className="absolute top-1/2 right-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                  )}
                </button>
              </div>

              {/* Payment Information Visibility Toggle */}
              <div className="flex items-center justify-between p-6 backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-500/20 to-orange-500/20 flex items-center justify-center">
                    <CreditCard className="w-6 h-6 text-yellow-300" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">Payment Information Section</h3>
                    <p className="text-sm text-gray-400">Show or hide payment information section for artists</p>
                  </div>
                </div>
                <button
                  onClick={() => updateConfig('payment_info_visible', !appConfig.payment_info_visible)}
                  disabled={loadingConfig}
                  className={`relative w-16 h-8 rounded-full transition-all duration-300 ${
                    appConfig.payment_info_visible
                      ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                      : 'bg-gray-600'
                  } ${loadingConfig ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <div
                    className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform duration-300 ${
                      appConfig.payment_info_visible ? 'translate-x-8' : 'translate-x-0'
                    }`}
                  />
                  {appConfig.payment_info_visible ? (
                    <ToggleRight className="absolute top-1/2 left-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                  ) : (
                    <ToggleLeft className="absolute top-1/2 right-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                  )}
                </button>
              </div>

              {/* Mobile money — master + providers (requires global on for either provider to work in checkout) */}
              <div className="flex items-center justify-between p-6 backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500/20 to-teal-500/20 flex items-center justify-center">
                    <Smartphone className="w-6 h-6 text-violet-200" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">Mobile money payments</h3>
                    <p className="text-sm text-gray-400">Master switch for Pawapay and DusuPay at checkout. Turn on one or both providers below.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => updateConfig('mobile_money_payments_enabled', !appConfig.mobile_money_payments_enabled)}
                  disabled={loadingConfig}
                  className={`relative w-16 h-8 rounded-full transition-all duration-300 ${
                    appConfig.mobile_money_payments_enabled
                      ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                      : 'bg-gray-600'
                  } ${loadingConfig ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <div
                    className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform duration-300 ${
                      appConfig.mobile_money_payments_enabled ? 'translate-x-8' : 'translate-x-0'
                    }`}
                  />
                  {appConfig.mobile_money_payments_enabled ? (
                    <ToggleRight className="absolute top-1/2 left-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                  ) : (
                    <ToggleLeft className="absolute top-1/2 right-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                  )}
                </button>
              </div>

              <div className="flex items-center justify-between p-6 backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-600/30 to-purple-600/20 flex items-center justify-center">
                    <Smartphone className="w-6 h-6 text-violet-300" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">Pawapay</h3>
                    <p className="text-sm text-gray-400">Show Pawapay as a mobile money option when the master switch is on.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => updateConfig('pawapay_enabled', !appConfig.pawapay_enabled)}
                  disabled={loadingConfig}
                  className={`relative w-16 h-8 rounded-full transition-all duration-300 ${
                    appConfig.pawapay_enabled
                      ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                      : 'bg-gray-600'
                  } ${loadingConfig ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <div
                    className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform duration-300 ${
                      appConfig.pawapay_enabled ? 'translate-x-8' : 'translate-x-0'
                    }`}
                  />
                  {appConfig.pawapay_enabled ? (
                    <ToggleRight className="absolute top-1/2 left-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                  ) : (
                    <ToggleLeft className="absolute top-1/2 right-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                  )}
                </button>
              </div>

              <div className="flex items-center justify-between p-6 backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500/25 to-cyan-500/20 flex items-center justify-center">
                    <Smartphone className="w-6 h-6 text-teal-300" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">DusuPay</h3>
                    <p className="text-sm text-gray-400">Show DusuPay as a mobile money option when the master switch is on.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => updateConfig('dusupay_enabled', !appConfig.dusupay_enabled)}
                  disabled={loadingConfig}
                  className={`relative w-16 h-8 rounded-full transition-all duration-300 ${
                    appConfig.dusupay_enabled
                      ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                      : 'bg-gray-600'
                  } ${loadingConfig ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <div
                    className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform duration-300 ${
                      appConfig.dusupay_enabled ? 'translate-x-8' : 'translate-x-0'
                    }`}
                  />
                  {appConfig.dusupay_enabled ? (
                    <ToggleRight className="absolute top-1/2 left-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                  ) : (
                    <ToggleLeft className="absolute top-1/2 right-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                  )}
                </button>
              </div>

              {/* Gift Button Toggle */}
              <div className="flex items-center justify-between p-6 backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-500/20 to-orange-500/20 flex items-center justify-center">
                    <Gift className="w-6 h-6 text-yellow-300" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">Gift Button</h3>
                    <p className="text-sm text-gray-400">Show or hide the gift button in live events</p>
                  </div>
                </div>
                <button
                  onClick={() => updateConfig('gift_enabled', !appConfig.gift_enabled)}
                  disabled={loadingConfig}
                  className={`relative w-16 h-8 rounded-full transition-all duration-300 ${
                    appConfig.gift_enabled
                      ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                      : 'bg-gray-600'
                  } ${loadingConfig ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <div
                    className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform duration-300 ${
                      appConfig.gift_enabled ? 'translate-x-8' : 'translate-x-0'
                    }`}
                  />
                  {appConfig.gift_enabled ? (
                    <ToggleRight className="absolute top-1/2 left-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                  ) : (
                    <ToggleLeft className="absolute top-1/2 right-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                  )}
                </button>
              </div>

              {/* Desktop Mode on Mobile Toggle */}
              <div className="flex items-center justify-between p-6 backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center">
                    <Monitor className="w-6 h-6 text-blue-300" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">Desktop Mode on Mobile</h3>
                    <p className="text-sm text-gray-400">Allow desktop mode on mobile devices in Creator Studio</p>
                  </div>
                </div>
                <button
                  onClick={() => updateConfig('desktop_mode_on_mobile', !appConfig.desktop_mode_on_mobile)}
                  disabled={loadingConfig}
                  className={`relative w-16 h-8 rounded-full transition-all duration-300 ${
                    appConfig.desktop_mode_on_mobile
                      ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                      : 'bg-gray-600'
                  } ${loadingConfig ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <div
                    className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform duration-300 ${
                      appConfig.desktop_mode_on_mobile ? 'translate-x-8' : 'translate-x-0'
                    }`}
                  />
                  {appConfig.desktop_mode_on_mobile ? (
                    <ToggleRight className="absolute top-1/2 left-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                  ) : (
                    <ToggleLeft className="absolute top-1/2 right-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                  )}
                </button>
              </div>

              {/* Live Event Notifications Toggle */}
              <div className="flex items-center justify-between p-6 backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                    <Bell className="w-6 h-6 text-purple-300" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">Live Event Notifications</h3>
                    <p className="text-sm text-gray-400">Enable or disable in-app notifications when live events start</p>
                  </div>
                </div>
                <button
                  onClick={() => updateConfig('live_event_notifications_enabled', !appConfig.live_event_notifications_enabled)}
                  disabled={loadingConfig}
                  className={`relative w-16 h-8 rounded-full transition-all duration-300 ${
                    appConfig.live_event_notifications_enabled
                      ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                      : 'bg-gray-600'
                  } ${loadingConfig ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <div
                    className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform duration-300 ${
                      appConfig.live_event_notifications_enabled ? 'translate-x-8' : 'translate-x-0'
                    }`}
                  />
                  {appConfig.live_event_notifications_enabled ? (
                    <ToggleRight className="absolute top-1/2 left-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                  ) : (
                    <ToggleLeft className="absolute top-1/2 right-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                  )}
                </button>
              </div>

              {/* Live Event Email Notifications Section */}
              <div className="border-t border-white/10 pt-6 mt-6">
                <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                  <Mail className="w-6 h-6 text-purple-400" />
                  Live Event Email Notifications
                </h3>
                <p className="text-sm text-gray-400 mb-6">
                  Control which user types receive email notifications when live events start. Emails are sent to all registered users and guest ticket buyers.
                </p>

                <div className="space-y-4">
                  {/* Email Notify Admins Toggle */}
                  <div className="flex items-center justify-between p-6 backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500/20 to-orange-500/20 flex items-center justify-center">
                        <UserCog className="w-6 h-6 text-red-300" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-white mb-1">Email Notify Admins</h3>
                        <p className="text-sm text-gray-400">Send email notifications to admins when live events start</p>
                      </div>
                    </div>
                    <button
                      onClick={() => updateConfig('live_event_email_notify_admins', !appConfig.live_event_email_notify_admins)}
                      disabled={loadingConfig}
                      className={`relative w-16 h-8 rounded-full transition-all duration-300 ${
                        appConfig.live_event_email_notify_admins
                          ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                          : 'bg-gray-600'
                      } ${loadingConfig ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <div
                        className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform duration-300 ${
                          appConfig.live_event_email_notify_admins ? 'translate-x-8' : 'translate-x-0'
                        }`}
                      />
                      {appConfig.live_event_email_notify_admins ? (
                        <ToggleRight className="absolute top-1/2 left-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                      ) : (
                        <ToggleLeft className="absolute top-1/2 right-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                      )}
                    </button>
                  </div>

                  {/* Email Notify Artists Toggle */}
                  <div className="flex items-center justify-between p-6 backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500/20 to-purple-500/20 flex items-center justify-center">
                        <Music className="w-6 h-6 text-pink-300" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-white mb-1">Email Notify Artists</h3>
                        <p className="text-sm text-gray-400">Send email notifications to artists when live events start</p>
                      </div>
                    </div>
                    <button
                      onClick={() => updateConfig('live_event_email_notify_artists', !appConfig.live_event_email_notify_artists)}
                      disabled={loadingConfig}
                      className={`relative w-16 h-8 rounded-full transition-all duration-300 ${
                        appConfig.live_event_email_notify_artists
                          ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                          : 'bg-gray-600'
                      } ${loadingConfig ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <div
                        className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform duration-300 ${
                          appConfig.live_event_email_notify_artists ? 'translate-x-8' : 'translate-x-0'
                        }`}
                      />
                      {appConfig.live_event_email_notify_artists ? (
                        <ToggleRight className="absolute top-1/2 left-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                      ) : (
                        <ToggleLeft className="absolute top-1/2 right-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                      )}
                    </button>
                  </div>

                  {/* Email Notify Fans Toggle */}
                  <div className="flex items-center justify-between p-6 backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center">
                        <Users className="w-6 h-6 text-blue-300" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-white mb-1">Email Notify Fans</h3>
                        <p className="text-sm text-gray-400">Send email notifications to fans (regular users) when live events start</p>
                      </div>
                    </div>
                    <button
                      onClick={() => updateConfig('live_event_email_notify_fans', !appConfig.live_event_email_notify_fans)}
                      disabled={loadingConfig}
                      className={`relative w-16 h-8 rounded-full transition-all duration-300 ${
                        appConfig.live_event_email_notify_fans
                          ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                          : 'bg-gray-600'
                      } ${loadingConfig ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <div
                        className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform duration-300 ${
                          appConfig.live_event_email_notify_fans ? 'translate-x-8' : 'translate-x-0'
                        }`}
                      />
                      {appConfig.live_event_email_notify_fans ? (
                        <ToggleRight className="absolute top-1/2 left-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                      ) : (
                        <ToggleLeft className="absolute top-1/2 right-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Phone Notifications Section */}
              <div className="border-t border-white/10 pt-6 mt-6">
                <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                  <Phone className="w-6 h-6 text-purple-400" />
                  Phone Notifications
                </h3>
                <p className="text-sm text-gray-400 mb-6">
                  Control phone (SMS) notifications for event scheduling and live event starts. Notifications are sent via phone number only.
                </p>

                {/* Event Scheduled Phone Notifications */}
                <div className="mb-6">
                  <h4 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-purple-300" />
                    Event Scheduled Notifications
                  </h4>
                  <div className="space-y-4">
                    {/* Phone Notify Followers - Event Scheduled */}
                    <div className="flex items-center justify-between p-6 backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center">
                          <Users className="w-6 h-6 text-green-300" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-white mb-1">Phone Notify Followers (Event Scheduled)</h3>
                          <p className="text-sm text-gray-400">Send phone notifications to users following an artist when that artist schedules an event</p>
                        </div>
                      </div>
                      <button
                        onClick={() => updateConfig('event_scheduled_phone_notify_followers', !appConfig.event_scheduled_phone_notify_followers)}
                        disabled={loadingConfig}
                        className={`relative w-16 h-8 rounded-full transition-all duration-300 ${
                          appConfig.event_scheduled_phone_notify_followers
                            ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                            : 'bg-gray-600'
                        } ${loadingConfig ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        <div
                          className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform duration-300 ${
                            appConfig.event_scheduled_phone_notify_followers ? 'translate-x-8' : 'translate-x-0'
                          }`}
                        />
                        {appConfig.event_scheduled_phone_notify_followers ? (
                          <ToggleRight className="absolute top-1/2 left-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                        ) : (
                          <ToggleLeft className="absolute top-1/2 right-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                        )}
                      </button>
                    </div>

                    {/* Phone Notify All - Event Scheduled */}
                    <div className="flex items-center justify-between p-6 backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center">
                          <Globe className="w-6 h-6 text-blue-300" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-white mb-1">Phone Notify All (Event Scheduled)</h3>
                          <p className="text-sm text-gray-400">Send phone notifications to all users when any artist schedules an event</p>
                        </div>
                      </div>
                      <button
                        onClick={() => updateConfig('event_scheduled_phone_notify_all', !appConfig.event_scheduled_phone_notify_all)}
                        disabled={loadingConfig}
                        className={`relative w-16 h-8 rounded-full transition-all duration-300 ${
                          appConfig.event_scheduled_phone_notify_all
                            ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                            : 'bg-gray-600'
                        } ${loadingConfig ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        <div
                          className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform duration-300 ${
                            appConfig.event_scheduled_phone_notify_all ? 'translate-x-8' : 'translate-x-0'
                          }`}
                        />
                        {appConfig.event_scheduled_phone_notify_all ? (
                          <ToggleRight className="absolute top-1/2 left-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                        ) : (
                          <ToggleLeft className="absolute top-1/2 right-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Live Event Started Phone Notifications */}
                <div className="mb-6">
                  <h4 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <MonitorPlay className="w-5 h-5 text-purple-300" />
                    Live Event Started Notifications
                  </h4>
                  <div className="space-y-4">
                    {/* Phone Notify Followers - Live Event Started */}
                    <div className="flex items-center justify-between p-6 backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500/20 to-red-500/20 flex items-center justify-center">
                          <Users className="w-6 h-6 text-pink-300" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-white mb-1">Phone Notify Followers (Live Event Started)</h3>
                          <p className="text-sm text-gray-400">Send phone notifications to users following an artist when that artist starts a live event</p>
                        </div>
                      </div>
                      <button
                        onClick={() => updateConfig('live_event_started_phone_notify_followers', !appConfig.live_event_started_phone_notify_followers)}
                        disabled={loadingConfig}
                        className={`relative w-16 h-8 rounded-full transition-all duration-300 ${
                          appConfig.live_event_started_phone_notify_followers
                            ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                            : 'bg-gray-600'
                        } ${loadingConfig ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        <div
                          className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform duration-300 ${
                            appConfig.live_event_started_phone_notify_followers ? 'translate-x-8' : 'translate-x-0'
                          }`}
                        />
                        {appConfig.live_event_started_phone_notify_followers ? (
                          <ToggleRight className="absolute top-1/2 left-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                        ) : (
                          <ToggleLeft className="absolute top-1/2 right-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                        )}
                      </button>
                    </div>

                    {/* Phone Notify All - Live Event Started */}
                    <div className="flex items-center justify-between p-6 backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-indigo-500/20 flex items-center justify-center">
                          <Globe className="w-6 h-6 text-purple-300" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-white mb-1">Phone Notify All (Live Event Started)</h3>
                          <p className="text-sm text-gray-400">Send phone notifications to all users when any artist starts a live event</p>
                        </div>
                      </div>
                      <button
                        onClick={() => updateConfig('live_event_started_phone_notify_all', !appConfig.live_event_started_phone_notify_all)}
                        disabled={loadingConfig}
                        className={`relative w-16 h-8 rounded-full transition-all duration-300 ${
                          appConfig.live_event_started_phone_notify_all
                            ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                            : 'bg-gray-600'
                        } ${loadingConfig ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        <div
                          className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform duration-300 ${
                            appConfig.live_event_started_phone_notify_all ? 'translate-x-8' : 'translate-x-0'
                          }`}
                        />
                        {appConfig.live_event_started_phone_notify_all ? (
                          <ToggleRight className="absolute top-1/2 left-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                        ) : (
                          <ToggleLeft className="absolute top-1/2 right-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Creator Studio Analytics Toggle */}
              <div className="flex items-center justify-between p-6 backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center">
                    <BarChart3 className="w-6 h-6 text-indigo-300" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">Creator Studio Analytics</h3>
                    <p className="text-sm text-gray-400">Show or hide the Analytics tab in Creator Studio</p>
                  </div>
                </div>
                <button
                  onClick={() => updateConfig('creator_studio_analytics_enabled', !appConfig.creator_studio_analytics_enabled)}
                  disabled={loadingConfig}
                  className={`relative w-16 h-8 rounded-full transition-all duration-300 ${
                    appConfig.creator_studio_analytics_enabled
                      ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                      : 'bg-gray-600'
                  } ${loadingConfig ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <div
                    className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform duration-300 ${
                      appConfig.creator_studio_analytics_enabled ? 'translate-x-8' : 'translate-x-0'
                    }`}
                  />
                  {appConfig.creator_studio_analytics_enabled ? (
                    <ToggleRight className="absolute top-1/2 left-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                  ) : (
                    <ToggleLeft className="absolute top-1/2 right-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                  )}
                </button>
              </div>
              </div>

              {/* Live + Replay bundle toggle (Revenue & pricing) */}
              <div className={`border-t border-white/10 pt-6 mt-6 ${activeGroup !== 'revenue' ? 'hidden' : ''}`}>
                <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                  <Ticket className="w-6 h-6 text-fuchsia-400" />
                  Live + Replay Payment Option
                </h3>
                <p className="text-sm text-gray-400 mb-6">
                  Controls the &quot;Live + Replay&quot; combined ticket shown in View Event Details (Upcoming Concerts, Watch page). When disabled, only &quot;Live only&quot; pricing is offered to fans.
                </p>
                <div className="flex items-center justify-between p-6 backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-fuchsia-500/20 to-pink-500/20 flex items-center justify-center">
                      <Ticket className="w-6 h-6 text-fuchsia-300" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white mb-1">Live + Replay bundle enabled</h3>
                      <p className="text-sm text-gray-400">Show combined live+replay ticket option on event pages</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      updateConfig(
                        'live_replay_bundle_enabled',
                        !(appConfig.live_replay_bundle_enabled ?? true)
                      )
                    }
                    disabled={loadingConfig}
                    className={`relative w-16 h-8 rounded-full transition-all duration-300 ${
                      (appConfig.live_replay_bundle_enabled ?? true)
                        ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                        : 'bg-gray-600'
                    } ${loadingConfig ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <div
                      className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform duration-300 ${
                        (appConfig.live_replay_bundle_enabled ?? true) ? 'translate-x-8' : 'translate-x-0'
                      }`}
                    />
                    {(appConfig.live_replay_bundle_enabled ?? true) ? (
                      <ToggleRight className="absolute top-1/2 left-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                    ) : (
                      <ToggleLeft className="absolute top-1/2 right-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                    )}
                  </button>
                </div>
              </div>

              {/* Revenue Settings Section */}
              <div className={`border-t border-white/10 pt-6 mt-6 ${activeGroup !== 'revenue' ? 'hidden' : ''}`}>
                <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                  <CreditCard className="w-6 h-6 text-purple-400" />
                  Revenue Distribution Settings
                </h3>
                <p className="text-sm text-gray-400 mb-6">
                  Configure how revenue from ticket sales is distributed between the platform and artists. 
                  Platform percentage is kept for site maintenance, artist percentage is paid to artists after live events.
                </p>

                <div className="space-y-4">
                  {/* Platform Revenue Percentage */}
                  <div className="backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center">
                          <Globe className="w-6 h-6 text-blue-300" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-white mb-1">Platform Revenue Percentage</h3>
                          <p className="text-sm text-gray-400">Percentage kept by platform for maintenance</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <label className="block text-sm text-gray-400 mb-2">Platform % (0-100)</label>
                        <input
                          type="number"
                          value={platformRevenuePercentage}
                          onChange={(e) => {
                            const value = e.target.value;
                            if (value === '' || (!isNaN(Number(value)) && Number(value) >= 0 && Number(value) <= 100)) {
                              setPlatformRevenuePercentage(value);
                            }
                          }}
                          min="0"
                          max="100"
                          step="1"
                          className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500/50"
                          placeholder="Enter percentage"
                        />
                        <p className="text-xs text-gray-500 mt-2">
                          Current: {appConfig.platform_revenue_percentage || 30}%
                        </p>
                      </div>
                      <div className="flex flex-col gap-2">
                        <button
                          onClick={async () => {
                            const percentage = parseFloat(platformRevenuePercentage);
                            if (!isNaN(percentage) && percentage >= 0 && percentage <= 100) {
                              try {
                                setLoadingConfig(true);
                                await updateConfig('platform_revenue_percentage', percentage);
                                // Auto-update artist percentage to maintain 100% total
                                const newArtistPercentage = 100 - percentage;
                                await updateConfig('artist_revenue_percentage', newArtistPercentage);
                                setArtistRevenuePercentage(newArtistPercentage.toString());
                                setSuccess(`Revenue percentages updated! Platform: ${percentage}%, Artist: ${newArtistPercentage}%`);
                                setTimeout(() => setSuccess(null), 5000);
                              } catch (err) {
                                console.error('Error updating revenue percentages:', err);
                              } finally {
                                setLoadingConfig(false);
                              }
                            }
                          }}
                          disabled={loadingConfig}
                          className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 rounded-xl font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Update
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Artist Revenue Percentage */}
                  <div className="backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                          <Music className="w-6 h-6 text-purple-300" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-white mb-1">Artist Revenue Percentage</h3>
                          <p className="text-sm text-gray-400">Percentage paid to artist after live event</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <label className="block text-sm text-gray-400 mb-2">Artist % (0-100)</label>
                        <input
                          type="number"
                          value={artistRevenuePercentage}
                          onChange={(e) => {
                            const value = e.target.value;
                            if (value === '' || (!isNaN(Number(value)) && Number(value) >= 0 && Number(value) <= 100)) {
                              setArtistRevenuePercentage(value);
                            }
                          }}
                          min="0"
                          max="100"
                          step="1"
                          className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500/50"
                          placeholder="Enter percentage"
                        />
                        <p className="text-xs text-gray-500 mt-2">
                          Current: {appConfig.artist_revenue_percentage || 70}%
                        </p>
                      </div>
                      <div className="flex flex-col gap-2">
                        <button
                          onClick={async () => {
                            const percentage = parseFloat(artistRevenuePercentage);
                            if (!isNaN(percentage) && percentage >= 0 && percentage <= 100) {
                              try {
                                setLoadingConfig(true);
                                await updateConfig('artist_revenue_percentage', percentage);
                                // Auto-update platform percentage to maintain 100% total
                                const newPlatformPercentage = 100 - percentage;
                                await updateConfig('platform_revenue_percentage', newPlatformPercentage);
                                setPlatformRevenuePercentage(newPlatformPercentage.toString());
                                setSuccess(`Revenue percentages updated! Platform: ${newPlatformPercentage}%, Artist: ${percentage}%`);
                                setTimeout(() => setSuccess(null), 5000);
                              } catch (err) {
                                console.error('Error updating revenue percentages:', err);
                              } finally {
                                setLoadingConfig(false);
                              }
                            }
                          }}
                          disabled={loadingConfig}
                          className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-xl font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Update
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Tip platform fee (%) - Super Admin only */}
                  {isSuperAdmin && (
                    <div className="backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-500/20 to-orange-500/20 flex items-center justify-center">
                            <Gift className="w-6 h-6 text-yellow-300" />
                          </div>
                          <div>
                            <h3 className="text-lg font-bold text-white mb-1">Tip platform fee (%)</h3>
                            <p className="text-sm text-gray-400">Percentage retained from tips. Used in confirmation emails and artist notifications.</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex-1">
                          <label className="block text-sm text-gray-400 mb-2">Platform % (0-100)</label>
                          <input
                            type="number"
                            value={tipPlatformPercentage}
                            onChange={(e) => {
                              const value = e.target.value;
                              if (value === '' || (!isNaN(Number(value)) && Number(value) >= 0 && Number(value) <= 100)) {
                                setTipPlatformPercentage(value);
                              }
                            }}
                            min="0"
                            max="100"
                            step="1"
                            className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500/50"
                            placeholder="20"
                          />
                          <p className="text-xs text-gray-500 mt-2">
                            Current: {appConfig.tip_platform_percentage ?? 20}%
                          </p>
                        </div>
                        <div className="flex flex-col gap-2">
                          <button
                            onClick={async () => {
                              const pct = parseFloat(tipPlatformPercentage);
                              if (!isNaN(pct) && pct >= 0 && pct <= 100) {
                                try {
                                  setSavingTipPlatformPercentage(true);
                                  await updateConfig('tip_platform_percentage', pct);
                                  setSuccess(`Tip platform fee set to ${pct}%. It will apply to future tip confirmations and artist notifications.`);
                                  setTimeout(() => setSuccess(null), 5000);
                                } catch (err) {
                                  console.error('Error updating tip platform %:', err);
                                } finally {
                                  setSavingTipPlatformPercentage(false);
                                }
                              }
                            }}
                            disabled={savingTipPlatformPercentage}
                            className="px-6 py-2.5 bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-700 hover:to-orange-700 rounded-xl font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Update
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Revenue Summary */}
                  <div className="backdrop-blur-sm bg-gradient-to-br from-emerald-600/20 to-teal-600/20 border border-emerald-500/30 rounded-xl p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-lg font-bold text-white mb-2">Total Distribution</h4>
                        <p className="text-sm text-gray-300">
                          Platform: <span className="font-bold text-blue-300">{appConfig.platform_revenue_percentage || 30}%</span> | 
                          Artist: <span className="font-bold text-purple-300">{appConfig.artist_revenue_percentage || 70}%</span>
                        </p>
                        <p className={`text-xs mt-2 font-semibold ${
                          ((appConfig.platform_revenue_percentage || 30) + (appConfig.artist_revenue_percentage || 70)) === 100
                            ? 'text-green-400'
                            : 'text-red-400'
                        }`}>
                          {((appConfig.platform_revenue_percentage || 30) + (appConfig.artist_revenue_percentage || 70)) === 100
                            ? '✓ Total equals 100%'
                            : '⚠ Total does not equal 100%'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-white">
                          ${((appConfig.platform_revenue_percentage || 30) / 100 * 1000).toFixed(2)}
                        </p>
                        <p className="text-xs text-gray-400">Platform share (example: $1000 revenue)</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Feature toggles (continued): Live Notifications through Artist Application CTA */}
              <div className={activeGroup === 'features' ? '' : 'hidden'}>
              {/* Live Notifications Section */}
              <div className="border-t border-white/10 pt-6 mt-6">
                <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                  <Activity className="w-6 h-6 text-purple-400" />
                  Live Stream Notifications
                </h3>
                <p className="text-sm text-gray-400 mb-6">
                  Control which user types receive notifications when an artist goes live
                </p>

                <div className="space-y-4">
                  {/* Fans Notifications Toggle */}
                  <div className="flex items-center justify-between p-6 backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center">
                        <Users className="w-6 h-6 text-blue-300" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-white mb-1">Fans Notifications</h3>
                        <p className="text-sm text-gray-400">Send notifications to fans when artists go live</p>
                      </div>
                    </div>
                    <button
                      onClick={() => updateConfig('live_notifications_fans_enabled', !appConfig.live_notifications_fans_enabled)}
                      disabled={loadingConfig}
                      className={`relative w-16 h-8 rounded-full transition-all duration-300 ${
                        appConfig.live_notifications_fans_enabled
                          ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                          : 'bg-gray-600'
                      } ${loadingConfig ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <div
                        className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform duration-300 ${
                          appConfig.live_notifications_fans_enabled ? 'translate-x-8' : 'translate-x-0'
                        }`}
                      />
                      {appConfig.live_notifications_fans_enabled ? (
                        <ToggleRight className="absolute top-1/2 left-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                      ) : (
                        <ToggleLeft className="absolute top-1/2 right-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                      )}
                    </button>
                  </div>

                  {/* Artists Notifications Toggle */}
                  <div className="flex items-center justify-between p-6 backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                        <Music className="w-6 h-6 text-purple-300" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-white mb-1">Artists Notifications</h3>
                        <p className="text-sm text-gray-400">Send notifications to artists when other artists go live</p>
                      </div>
                    </div>
                    <button
                      onClick={() => updateConfig('live_notifications_artists_enabled', !appConfig.live_notifications_artists_enabled)}
                      disabled={loadingConfig}
                      className={`relative w-16 h-8 rounded-full transition-all duration-300 ${
                        appConfig.live_notifications_artists_enabled
                          ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                          : 'bg-gray-600'
                      } ${loadingConfig ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <div
                        className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform duration-300 ${
                          appConfig.live_notifications_artists_enabled ? 'translate-x-8' : 'translate-x-0'
                        }`}
                      />
                      {appConfig.live_notifications_artists_enabled ? (
                        <ToggleRight className="absolute top-1/2 left-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                      ) : (
                        <ToggleLeft className="absolute top-1/2 right-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                      )}
                    </button>
                  </div>

                  {/* Admins Notifications Toggle */}
                  <div className="flex items-center justify-between p-6 backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500/20 to-red-500/20 flex items-center justify-center">
                        <Settings2 className="w-6 h-6 text-orange-300" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-white mb-1">Admins Notifications</h3>
                        <p className="text-sm text-gray-400">Send notifications to admins when artists go live</p>
                      </div>
                    </div>
                    <button
                      onClick={() => updateConfig('live_notifications_admins_enabled', !appConfig.live_notifications_admins_enabled)}
                      disabled={loadingConfig}
                      className={`relative w-16 h-8 rounded-full transition-all duration-300 ${
                        appConfig.live_notifications_admins_enabled
                          ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                          : 'bg-gray-600'
                      } ${loadingConfig ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <div
                        className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform duration-300 ${
                          appConfig.live_notifications_admins_enabled ? 'translate-x-8' : 'translate-x-0'
                        }`}
                      />
                      {appConfig.live_notifications_admins_enabled ? (
                        <ToggleRight className="absolute top-1/2 left-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                      ) : (
                        <ToggleLeft className="absolute top-1/2 right-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Artist survey configuration (Super admin only) */}
              {isSuperAdmin && (
                <div className="border-t border-white/10 pt-6 mt-10">
                  <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                    <BarChart3 className="w-6 h-6 text-purple-400" />
                    Artist survey configuration
                  </h3>
                  <p className="text-sm text-gray-400 mb-4">
                    Control how many countries and artists appear in the initial favorite-artists survey.
                    Artist lists can be edited via the <span className="font-semibold text-purple-300">Artist Survey Insights</span> page.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                      <label className="block text-sm font-semibold text-gray-200 mb-2">
                        Max countries to show
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={appConfig.artist_survey_max_countries}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          setAppConfig((prev) => ({
                            ...prev,
                            artist_survey_max_countries: Number.isFinite(val) ? val : prev.artist_survey_max_countries
                          }));
                        }}
                        onBlur={async (e) => {
                          const val = parseInt(e.target.value, 10);
                          if (!Number.isFinite(val)) return;
                          try {
                            setLoadingConfig(true);
                            const { error } = await supabase
                              .from('app_config')
                              .upsert({ key: 'artist_survey_max_countries', value: val }, { onConflict: 'key' });
                            if (error) throw error;
                          } catch (err) {
                            console.error('Error saving artist_survey_max_countries:', err);
                          } finally {
                            setLoadingConfig(false);
                          }
                        }}
                        className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500/60"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        How many countries (e.g. Nigeria, France, Ghana) appear in the survey.
                      </p>
                    </div>
                    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                      <label className="block text-sm font-semibold text-gray-200 mb-2">
                        Artists per country
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={appConfig.artist_survey_artists_per_country}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          setAppConfig((prev) => ({
                            ...prev,
                            artist_survey_artists_per_country: Number.isFinite(val) ? val : prev.artist_survey_artists_per_country
                          }));
                        }}
                        onBlur={async (e) => {
                          const val = parseInt(e.target.value, 10);
                          if (!Number.isFinite(val)) return;
                          try {
                            setLoadingConfig(true);
                            const { error } = await supabase
                              .from('app_config')
                              .upsert({ key: 'artist_survey_artists_per_country', value: val }, { onConflict: 'key' });
                            if (error) throw error;
                          } catch (err) {
                            console.error('Error saving artist_survey_artists_per_country:', err);
                          } finally {
                            setLoadingConfig(false);
                          }
                        }}
                        className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500/60"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        How many artists are shown per country in the survey.
                      </p>
                    </div>
                    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                      <label className="block text-sm font-semibold text-gray-200 mb-2">
                        Popup frequency (days)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={365}
                        value={appConfig.artist_survey_popup_days}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          setAppConfig((prev) => ({
                            ...prev,
                            artist_survey_popup_days: Number.isFinite(val) ? val : prev.artist_survey_popup_days
                          }));
                        }}
                        onBlur={async (e) => {
                          const val = parseInt(e.target.value, 10);
                          if (!Number.isFinite(val)) return;
                          try {
                            setLoadingConfig(true);
                            const { error } = await supabase
                              .from('app_config')
                              .upsert({ key: 'artist_survey_popup_days', value: val }, { onConflict: 'key' });
                            if (error) throw error;
                          } catch (err) {
                            console.error('Error saving artist_survey_popup_days:', err);
                          } finally {
                            setLoadingConfig(false);
                          }
                        }}
                        className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500/60"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        Minimum number of days between popup survey prompts for the same user.
                      </p>
                    </div>
                    <div className="p-4 rounded-xl bg-white/5 border border-white/10 md:col-span-2">
                      <label className="block text-sm font-semibold text-gray-200 mb-2">
                        Minimum followers to qualify (any platform)
                      </label>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          step={1000}
                          value={appConfig.artist_min_followers}
                          onChange={(e) => {
                            setMinFollowersMessage(null);
                            const val = parseInt(e.target.value, 10);
                            setAppConfig((prev) => ({
                              ...prev,
                              artist_min_followers: Number.isFinite(val) ? val : prev.artist_min_followers
                            }));
                          }}
                          onBlur={async (e) => {
                            const val = parseInt(e.target.value, 10);
                            if (!Number.isFinite(val)) return;
                            try {
                              setLoadingConfig(true);
                              const { error } = await supabase
                                .from('app_config')
                                .upsert({ key: 'artist_min_followers', value: val }, { onConflict: 'key' });
                              if (error) throw error;
                            } catch (err) {
                              console.error('Error saving artist_min_followers:', err);
                            } finally {
                              setLoadingConfig(false);
                            }
                          }}
                          className="w-full max-w-xs px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500/60"
                        />
                        <button
                          type="button"
                          disabled={savingMinFollowers}
                          onClick={async () => {
                            const val = appConfig.artist_min_followers ?? 100000;
                            if (!Number.isFinite(val) || val < 0) {
                              setMinFollowersMessage({ type: 'error', text: 'Please enter a valid number (0 or more).' });
                              setTimeout(() => setMinFollowersMessage(null), 4000);
                              return;
                            }
                            setSavingMinFollowers(true);
                            setMinFollowersMessage(null);
                            try {
                              const { error } = await supabase
                                .from('app_config')
                                .upsert({ key: 'artist_min_followers', value: val }, { onConflict: 'key' });
                              if (error) throw error;
                              setMinFollowersMessage({ type: 'success', text: `Saved: minimum ${val.toLocaleString()} followers.` });
                              setTimeout(() => setMinFollowersMessage(null), 4000);
                            } catch (err: any) {
                              setMinFollowersMessage({ type: 'error', text: err?.message || 'Failed to save.' });
                              setTimeout(() => setMinFollowersMessage(null), 5000);
                            } finally {
                              setSavingMinFollowers(false);
                            }
                          }}
                          className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-purple-400"
                        >
                          {savingMinFollowers ? 'Saving…' : 'Validate & Save'}
                        </button>
                      </div>
                      {minFollowersMessage && (
                        <p className={`mt-2 text-xs font-medium ${minFollowersMessage.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                          {minFollowersMessage.text}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-gray-500">
                        Artists with at least this many followers on YouTube, Instagram, TikTok or Facebook will be auto-qualified.
                      </p>
                    </div>
                  </div>
                  <div className="mt-6 p-4 rounded-xl bg-white/5 border border-white/10">
                    <div className="flex items-center justify-between mb-3 gap-4 flex-wrap">
                      <div>
                        <p className="text-sm font-semibold text-gray-200 flex items-center gap-2">
                          <Globe className="w-4 h-4 text-purple-300" />
                          Countries included in survey
                        </p>
                        <p className="text-xs text-gray-400">
                          Toggle which countries appear. Artists per country are configured in the suggestions list.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={newSurveyCountry}
                          onChange={(e) => setNewSurveyCountry(e.target.value)}
                          className="px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500/60"
                        >
                          <option value="">Add country…</option>
                          {COUNTRIES.filter(
                            (c) => !surveyCountries.some((sc) => sc.country === c)
                          ).map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={handleAddSurveyCountry}
                          disabled={!newSurveyCountry || togglingSurveyCountry === newSurveyCountry || loadingConfig}
                          className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 text-xs font-semibold text-white hover:from-purple-700 hover:to-pink-700 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          Add
                        </button>
                        {surveyCountriesLoading && (
                          <span className="text-xs text-gray-400">Loading…</span>
                        )}
                      </div>
                    </div>
                    {surveyCountries.length === 0 && !surveyCountriesLoading ? (
                      <p className="text-xs text-gray-500">
                        No artist survey suggestions found yet. Use the Artist Survey Insights page or the database to add suggestions.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {surveyCountries.map((c) => {
                          const isOn = c.enabled;
                          const disabled = togglingSurveyCountry === c.country || loadingConfig;
                          return (
                            <button
                              key={c.country}
                              type="button"
                              disabled={disabled}
                              onClick={() => toggleSurveyCountryEnabled(c.country, !isOn)}
                              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all duration-200 ${
                                isOn
                                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white border-purple-400 shadow-lg shadow-purple-500/30'
                                  : 'bg-white/5 text-gray-200 border-white/15 hover:bg-white/10'
                              } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
                            >
                              {c.country} <span className="opacity-75">({c.totalArtists})</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Advertisements Home Visibility Toggle */}
              <div className="border-t border-white/10 pt-6 mt-6">
                <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                  <MonitorPlay className="w-6 h-6 text-purple-400" />
                  Advertisement Settings
                </h3>
                <p className="text-sm text-gray-400 mb-6">
                  Control advertisement visibility on the home page
                </p>

                <div className="flex items-center justify-between p-6 backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500/20 to-rose-500/20 flex items-center justify-center">
                      <MonitorPlay className="w-6 h-6 text-pink-300" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white mb-1">Home Page Advertisements</h3>
                      <p className="text-sm text-gray-400">Show or hide advertisements on the home page</p>
                    </div>
                  </div>
                  <button
                    onClick={() => updateConfig('advertisements_home_enabled', !appConfig.advertisements_home_enabled)}
                    disabled={loadingConfig}
                    className={`relative w-16 h-8 rounded-full transition-all duration-300 ${
                      appConfig.advertisements_home_enabled
                        ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                        : 'bg-gray-600'
                    } ${loadingConfig ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <div
                      className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform duration-300 ${
                        appConfig.advertisements_home_enabled ? 'translate-x-8' : 'translate-x-0'
                      }`}
                    />
                    {appConfig.advertisements_home_enabled ? (
                      <ToggleRight className="absolute top-1/2 left-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                    ) : (
                      <ToggleLeft className="absolute top-1/2 right-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                    )}
                  </button>
                </div>
              </div>

              {/* Visitor Counter Visibility Toggle */}
              <div className="border-t border-white/10 pt-6 mt-6">
                <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                  <Eye className="w-6 h-6 text-purple-400" />
                  Visitor Counter Settings
                </h3>
                <p className="text-sm text-gray-400 mb-6">
                  Control the visibility of the visitor counter in the navbar
                </p>

                <div className="flex items-center justify-between p-6 backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-500/20 to-orange-500/20 flex items-center justify-center">
                      <Eye className="w-6 h-6 text-yellow-300" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white mb-1">Visitor Counter Visibility</h3>
                      <p className="text-sm text-gray-400">Show or hide the visitor counter in the navigation bar</p>
                    </div>
                  </div>
                  <button
                    onClick={() => updateConfig('visitor_counter_visible', !appConfig.visitor_counter_visible)}
                    disabled={loadingConfig}
                    className={`relative w-16 h-8 rounded-full transition-all duration-300 ${
                      appConfig.visitor_counter_visible
                        ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                        : 'bg-gray-600'
                    } ${loadingConfig ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <div
                      className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform duration-300 ${
                        appConfig.visitor_counter_visible ? 'translate-x-8' : 'translate-x-0'
                      }`}
                    />
                    {appConfig.visitor_counter_visible ? (
                      <ToggleRight className="absolute top-1/2 left-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                    ) : (
                      <ToggleLeft className="absolute top-1/2 right-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                    )}
                  </button>
                </div>
              </div>

              {/* Auth Gate (Sign-in prompt) Toggle */}
              <div className="border-t border-white/10 pt-6 mt-6">
                <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                  <Lock className="w-6 h-6 text-purple-400" />
                  Auth Gate
                </h3>
                <p className="text-sm text-gray-400 mb-6">
                  When enabled, a sign-in/sign-up pop-up appears when a guest clicks anywhere on the site (e.g. nav, images). Guests can dismiss it via &quot;Ignore or Later&quot;.
                </p>

                <div className="flex items-center justify-between p-6 backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-indigo-500/20 flex items-center justify-center">
                      <Lock className="w-6 h-6 text-purple-300" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white mb-1">Auth Gate Pop-up</h3>
                      <p className="text-sm text-gray-400">Show sign-in/sign-up prompt on first click for guests</p>
                    </div>
                  </div>
                  <button
                    onClick={() => updateConfig('auth_gate_enabled', !appConfig.auth_gate_enabled)}
                    disabled={loadingConfig}
                    className={`relative w-16 h-8 rounded-full transition-all duration-300 ${
                      appConfig.auth_gate_enabled
                        ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                        : 'bg-gray-600'
                    } ${loadingConfig ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <div
                      className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform duration-300 ${
                        appConfig.auth_gate_enabled ? 'translate-x-8' : 'translate-x-0'
                      }`}
                    />
                    {appConfig.auth_gate_enabled ? (
                      <ToggleRight className="absolute top-1/2 left-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                    ) : (
                      <ToggleLeft className="absolute top-1/2 right-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                    )}
                  </button>
                </div>
              </div>

              {/* Communication (Artist Management) Toggle */}
              <div className="border-t border-white/10 pt-6 mt-6">
                <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                  <MessageSquare className="w-6 h-6 text-purple-400" />
                  Communication
                </h3>
                <p className="text-sm text-gray-400 mb-6">
                  When enabled, the Communication section is visible in Artist Management, allowing super admins to send in-app notifications to artists.
                </p>

                <div className="flex items-center justify-between p-6 backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-indigo-500/20 flex items-center justify-center">
                      <MessageSquare className="w-6 h-6 text-purple-300" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white mb-1">Artist Management Communication</h3>
                      <p className="text-sm text-gray-400">Show Communication section (send in-app notifications to artists)</p>
                    </div>
                  </div>
                  <button
                    onClick={() => updateConfig('artist_management_communication_enabled', !appConfig.artist_management_communication_enabled)}
                    disabled={loadingConfig}
                    className={`relative w-16 h-8 rounded-full transition-all duration-300 ${
                      appConfig.artist_management_communication_enabled
                        ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                        : 'bg-gray-600'
                    } ${loadingConfig ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <div
                      className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform duration-300 ${
                        appConfig.artist_management_communication_enabled ? 'translate-x-8' : 'translate-x-0'
                      }`}
                    />
                    {appConfig.artist_management_communication_enabled ? (
                      <ToggleRight className="absolute top-1/2 left-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                    ) : (
                      <ToggleLeft className="absolute top-1/2 right-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                    )}
                  </button>
                </div>
              </div>

              {/* Ticket bundles (platform-wide) */}
              <div className="border-t border-white/10 pt-6 mt-6">
                <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                  <Ticket className="w-6 h-6 text-purple-400" />
                  Ticket Bundles
                </h3>
                <p className="text-sm text-gray-400 mb-6">
                  When enabled, 3/5-ticket bundles are available: Bundles page, cart bundle offer when 3 or 5 events are in cart, and &quot;Use 1 credit&quot; on event pages.
                </p>
                <div className="flex items-center justify-between p-6 backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center">
                      <Ticket className="w-6 h-6 text-emerald-300" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white mb-1">Bundles enabled (platform-wide)</h3>
                      <p className="text-sm text-gray-400">Show Bundles page, cart bundle offer, and use-credit option</p>
                    </div>
                  </div>
                  <button
                    onClick={() => updateConfig('bundles_enabled', !appConfig.bundles_enabled)}
                    disabled={loadingConfig}
                    className={`relative w-16 h-8 rounded-full transition-all duration-300 ${
                      appConfig.bundles_enabled
                        ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                        : 'bg-gray-600'
                    } ${loadingConfig ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <div
                      className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform duration-300 ${
                        appConfig.bundles_enabled ? 'translate-x-8' : 'translate-x-0'
                      }`}
                    />
                    {appConfig.bundles_enabled ? (
                      <ToggleRight className="absolute top-1/2 left-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                    ) : (
                      <ToggleLeft className="absolute top-1/2 right-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                    )}
                  </button>
                </div>
              </div>

              {/* Replays (platform-wide) */}
              <div className="border-t border-white/10 pt-6 mt-6">
                <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                  <PlayCircle className="w-6 h-6 text-purple-400" />
                  Replays
                </h3>
                <p className="text-sm text-gray-400 mb-6">
                  When enabled, the Replays page and watch-on-demand purchase are available platform-wide.
                </p>
                <div className="flex items-center justify-between p-6 backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 flex items-center justify-center">
                      <PlayCircle className="w-6 h-6 text-violet-300" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white mb-1">Replays enabled (platform-wide)</h3>
                      <p className="text-sm text-gray-400">Show Replays page and buy-replay option on event pages</p>
                    </div>
                  </div>
                  <button
                    onClick={() => updateConfig('replays_enabled', !appConfig.replays_enabled)}
                    disabled={loadingConfig}
                    className={`relative w-16 h-8 rounded-full transition-all duration-300 ${
                      appConfig.replays_enabled
                        ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                        : 'bg-gray-600'
                    } ${loadingConfig ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <div
                      className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform duration-300 ${
                        appConfig.replays_enabled ? 'translate-x-8' : 'translate-x-0'
                      }`}
                    />
                    {appConfig.replays_enabled ? (
                      <ToggleRight className="absolute top-1/2 left-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                    ) : (
                      <ToggleLeft className="absolute top-1/2 right-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                    )}
                  </button>
                </div>

                {/* Live + Replay bundle — same card as Replays (Watch page ticket options) */}
                <div className="mt-6 pt-6 border-t border-white/10">
                  <p className="text-sm text-gray-400 mb-4">
                    <span className="text-fuchsia-300 font-semibold">Live + Replay bundle:</span>{' '}
                    When on, fans see the combined live+replay ticket next to &quot;Live only&quot; before the show. When off, only live-only pricing is shown. (If Replays above is off, the bundle is hidden on the site automatically.)
                  </p>
                  <div className="flex items-center justify-between p-6 backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-fuchsia-500/20 to-pink-500/20 flex items-center justify-center">
                        <Ticket className="w-6 h-6 text-fuchsia-300" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-white mb-1">Live + Replay payment option</h3>
                        <p className="text-sm text-gray-400">Bundle ticket on Watch / pre-show purchase</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        updateConfig(
                          'live_replay_bundle_enabled',
                          !(appConfig.live_replay_bundle_enabled ?? true)
                        )
                      }
                      disabled={loadingConfig}
                      className={`relative w-16 h-8 rounded-full transition-all duration-300 ${
                        (appConfig.live_replay_bundle_enabled ?? true)
                          ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                          : 'bg-gray-600'
                      } ${loadingConfig ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <div
                        className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform duration-300 ${
                          (appConfig.live_replay_bundle_enabled ?? true) ? 'translate-x-8' : 'translate-x-0'
                        }`}
                      />
                      {(appConfig.live_replay_bundle_enabled ?? true) ? (
                        <ToggleRight className="absolute top-1/2 left-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                      ) : (
                        <ToggleLeft className="absolute top-1/2 right-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Artist Application CTA (platform-wide) */}
              <div className="border-t border-white/10 pt-6 mt-6">
                <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                  <Sparkles className="w-6 h-6 text-purple-400" />
                  Artist Application CTA
                </h3>
                <p className="text-sm text-gray-400 mb-6">
                  When enabled, &quot;Are you an Artist?&quot; application buttons are shown in the Navbar and on the Home page.
                </p>
                <div className="flex items-center justify-between p-6 backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 flex items-center justify-center">
                      <Sparkles className="w-6 h-6 text-violet-300" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white mb-1">Artist application CTA enabled</h3>
                      <p className="text-sm text-gray-400">Show &quot;Are you an Artist?&quot; / Apply here in Navbar and Home</p>
                    </div>
                  </div>
                  <button
                    onClick={() => updateConfig('artist_application_enabled', !appConfig.artist_application_enabled)}
                    disabled={loadingConfig}
                    className={`relative w-16 h-8 rounded-full transition-all duration-300 ${
                      appConfig.artist_application_enabled
                        ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                        : 'bg-gray-600'
                    } ${loadingConfig ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <div
                      className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform duration-300 ${
                        appConfig.artist_application_enabled ? 'translate-x-8' : 'translate-x-0'
                      }`}
                    />
                    {appConfig.artist_application_enabled ? (
                      <ToggleRight className="absolute top-1/2 left-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                    ) : (
                      <ToggleLeft className="absolute top-1/2 right-2 transform -translate-y-1/2 w-4 h-4 text-white" />
                    )}
                  </button>
                </div>
              </div>
              </div>
            </div>
          </div>
        )}

        {/* Super Admin: Revenue / Tools / Applications (second card) */}
        {isSuperAdmin && (activeGroup === 'revenue' || activeGroup === 'tools' || activeGroup === 'applications') && (
          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-8 shadow-2xl mb-10">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-500/20 to-amber-500/20 flex items-center justify-center">
                <Euro className="w-5 h-5 text-yellow-300" />
              </div>
              <h2 className="text-3xl font-bold bg-gradient-to-r from-yellow-300 to-amber-300 bg-clip-text text-transparent">
                {activeGroup === 'revenue' && 'Revenue &amp; pricing'}
                {activeGroup === 'tools' && 'Tools'}
                {activeGroup === 'applications' && 'Artist applications'}
              </h2>
            </div>
            <div className="space-y-6">
              {/* Free Access Link Generator — visible in Tools */}
              <div className={`border-t border-white/10 pt-6 mt-6 ${activeGroup !== 'tools' ? 'hidden' : ''}`}>
                <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                  <Link2 className="w-6 h-6 text-purple-400" />
                  Free Access Link Generator
                </h3>
                <p className="text-sm text-gray-400 mb-6">
                  Generate and send free access links to users for specific events (for ticket/access problems)
                </p>

                {/* Error Display for Free Access Link Generator */}
                {error && (error.includes('access link') || error.includes('email') || error.includes('event')) && (
                  <div className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-500/50 backdrop-blur-sm">
                    <p className="text-red-400 text-sm">
                      {error}
                    </p>
                  </div>
                )}

                {/* Success Display for Free Access Link Generator */}
                {success && (success.includes('access link') || success.includes('sent successfully')) && (
                  <div className="mb-4 p-4 rounded-xl bg-green-500/10 border border-green-500/50 backdrop-blur-sm">
                    <p className="text-green-400 text-sm">
                      {success}
                    </p>
                  </div>
                )}

                <div className="space-y-4">
                  {/* Event Selection */}
                  <div className="backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl p-6">
                    <label className="block text-sm font-semibold text-white mb-2">
                      Select Event
                    </label>
                    <select
                      value={selectedEventId}
                      onChange={(e) => setSelectedEventId(e.target.value)}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500/50"
                    >
                      <option value="">-- Select an event --</option>
                      {availableEvents.map((event) => (
                        <option key={event.id} value={event.id} className="bg-gray-800">
                          {event.title} - {event.profiles?.full_name || event.profiles?.username || 'Unknown Artist'} ({new Date(event.start_time).toLocaleDateString()})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* User Email */}
                  <div className="backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl p-6">
                    <label className="block text-sm font-semibold text-white mb-2">
                      User Email
                    </label>
                    <input
                      type="email"
                      value={userEmail}
                      onChange={(e) => setUserEmail(e.target.value)}
                      placeholder="user@example.com"
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500/50"
                    />
                  </div>

                  {/* Generate Link Button */}
                  <div className="flex gap-3">
                    <button
                      onClick={generateFreeAccessLink}
                      disabled={generatingLink || !selectedEventId || !userEmail}
                      className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-xl hover:from-purple-700 hover:to-pink-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {generatingLink ? (
                        <>
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                          Generating...
                        </>
                      ) : (
                        <>
                          <Link2 className="w-5 h-5" />
                          Generate Access Link
                        </>
                      )}
                    </button>
                  </div>

                  {/* Generated Link Display */}
                  {generatedLink && (
                    <div className="backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl p-6">
                      <label className="block text-sm font-semibold text-white mb-2">
                        Generated Access Link
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={generatedLink}
                          readOnly
                          className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none"
                        />
                        <button
                          onClick={copyLinkToClipboard}
                          className="px-4 py-3 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl text-white transition-colors"
                          title="Copy link"
                        >
                          {linkCopied ? (
                            <Check className="w-5 h-5 text-green-400" />
                          ) : (
                            <Copy className="w-5 h-5" />
                          )}
                        </button>
                      </div>
                      <p className="text-xs text-gray-400 mt-2">
                        This link allows the user to watch the event without purchasing a ticket
                      </p>
                    </div>
                  )}

                  {/* Send Email Button */}
                  {generatedLink && (
                    <>
                      <button
                        onClick={sendAccessLinkEmail}
                        disabled={sendingEmail}
                        className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-cyan-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {sendingEmail ? (
                          <>
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                            Sending...
                          </>
                        ) : (
                          <>
                            <Mail className="w-5 h-5" />
                            Send Link via Email
                          </>
                        )}
                      </button>
                      <p className="text-xs text-gray-500 text-center mt-2">
                        Note: If email sending fails, you can copy the link above and send it manually to the user.
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* Default Event Price — visible in Revenue */}
              <div className={`border-t border-white/10 pt-6 mt-6 ${activeGroup !== 'revenue' ? 'hidden' : ''}`}>
                <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                  <Euro className="w-6 h-6 text-yellow-400" />
                  Default Event Price
                </h3>
                <p className="text-sm text-gray-400 mb-6">
                  Set the standard ticket price for all future events scheduled by artists. Admins can still override the price per event.
                </p>

                <div className="backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl p-6">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-500/20 to-amber-500/20 flex items-center justify-center">
                      <Euro className="w-6 h-6 text-yellow-300" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white mb-1">Standard Artist Price</h3>
                      <p className="text-sm text-gray-400">Currently <span className="text-yellow-400 font-semibold">${(appConfig.default_event_price ?? 1.99).toFixed(2)}</span> — applies when artists schedule events</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="relative flex-1 max-w-xs">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-semibold">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={defaultEventPrice}
                        onChange={(e) => setDefaultEventPrice(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') updateDefaultEventPrice(); }}
                        className="w-full pl-9 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500/50"
                      />
                    </div>
                    <button
                      onClick={updateDefaultEventPrice}
                      disabled={savingDefaultPrice}
                      className="px-6 py-3 bg-gradient-to-r from-yellow-600 to-amber-600 hover:from-yellow-700 hover:to-amber-700 text-white font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {savingDefaultPrice ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      {savingDefaultPrice ? 'Saving...' : 'Update'}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-3">
                    This price is locked for artists when they schedule events. Admins can still set a custom price per event from the Schedule page.
                  </p>
                </div>
              </div>

              {/* Default Event Duration — visible in Revenue (super admin only) */}
              {isSuperAdmin && (
                <div className={`border-t border-white/10 pt-6 mt-6 ${activeGroup !== 'revenue' ? 'hidden' : ''}`}>
                  <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                    <Clock className="w-6 h-6 text-blue-400" />
                    Default Event Duration
                  </h3>
                  <p className="text-sm text-gray-400 mb-6">
                    Set the standard event duration (in minutes) for all future events scheduled by artists. Artists cannot change this value on the Schedule page; admins can override it per event if needed.
                  </p>

                  <div className="backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl p-6">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center">
                        <Clock className="w-6 h-6 text-blue-300" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-white mb-1">Standard Event Duration</h3>
                        <p className="text-sm text-gray-400">
                          Currently <span className="text-blue-400 font-semibold">{appConfig.default_event_duration ?? 60} minutes</span> — applies when artists schedule events
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="relative flex-1 max-w-xs">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-semibold">⏱</span>
                        <input
                          type="number"
                          step="1"
                          min="1"
                          value={defaultEventDuration}
                          onChange={(e) => setDefaultEventDuration(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') updateDefaultEventDuration(); }}
                          className="w-full pl-9 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500/50"
                        />
                      </div>
                      <button
                        onClick={updateDefaultEventDuration}
                        disabled={savingDefaultDuration}
                        className="px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        {savingDefaultDuration ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        ) : (
                          <Save className="w-4 h-4" />
                        )}
                        {savingDefaultDuration ? 'Saving...' : 'Update'}
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-3">
                      This duration is locked for artists when they schedule events. Admins and super admins can still adjust it per event on the Schedule page.
                    </p>
                  </div>
                </div>
              )}

              {/* Streaming Limits — visible in Revenue (super admin only) */}
              {isSuperAdmin && (
                <div className={`border-t border-white/10 pt-6 mt-6 ${activeGroup !== 'revenue' ? 'hidden' : ''}`}>
                  <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                    <MonitorPlay className="w-6 h-6 text-red-400" />
                    Streaming Limits
                  </h3>
                  <p className="text-sm text-gray-400 mb-6">
                    Control how long a live stream can run before it ends automatically, and when the streamer sees a warning banner in the studio.
                  </p>

                  <div className="backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl p-6 space-y-4">
                    <div className="flex flex-col md:flex-row md:items-center gap-4">
                      <div className="flex-1">
                        <label className="block text-gray-300 mb-2 text-sm font-semibold">
                          Max streaming time (minutes)
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={streamingMaxMinutes}
                          onChange={(e) => setStreamingMaxMinutes(e.target.value)}
                          className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500/50"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Current: {appConfig.streaming_max_minutes ?? 60} minutes. After this time, the stream ends automatically for the streamer and viewers.
                        </p>
                      </div>
                      <div className="flex-1">
                        <label className="block text-gray-300 mb-2 text-sm font-semibold">
                          Warning before end (minutes)
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={streamingWarningMinutes}
                          onChange={(e) => setStreamingWarningMinutes(e.target.value)}
                          className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500/50"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Current: {appConfig.streaming_warning_minutes ?? 5} minutes. The studio shows a countdown banner when the remaining time is less than or equal to this.
                        </p>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        onClick={updateStreamingLimits}
                        disabled={savingStreamingLimits}
                        className="px-6 py-3 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        {savingStreamingLimits ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        ) : (
                          <Save className="w-4 h-4" />
                        )}
                        {savingStreamingLimits ? 'Saving...' : 'Update streaming limits'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Event Pricing Manager — visible in Revenue */}
              <div className={`border-t border-white/10 pt-6 mt-6 ${activeGroup !== 'revenue' ? 'hidden' : ''}`}>
                <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                  <Euro className="w-6 h-6 text-purple-400" />
                  Event Pricing Manager
                </h3>
                <p className="text-sm text-gray-400 mb-6">
                  Quickly view and update ticket prices for all events without leaving the dashboard.
                </p>

                {priceSuccess && (
                  <div className="mb-4 p-4 rounded-xl bg-green-500/10 border border-green-500/50 backdrop-blur-sm">
                    <p className="text-green-400 text-sm">{priceSuccess}</p>
                  </div>
                )}

                {pricingLoading ? (
                  <div className="text-center py-6">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-500 mx-auto"></div>
                    <p className="text-gray-400 mt-3 text-sm">Loading events...</p>
                  </div>
                ) : pricingEvents.length === 0 ? (
                  <div className="text-center py-6 text-gray-500 text-sm">No events found.</div>
                ) : (
                  <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                    {pricingEvents.map((ev) => {
                      const isEditing = editingPriceId === ev.id;
                      const artistName = ev.profiles?.full_name || ev.profiles?.username || 'Unknown';
                      const dateStr = new Date(ev.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                      const statusColor = ev.status === 'live' ? 'text-red-400' : ev.status === 'upcoming' ? 'text-purple-400' : 'text-gray-500';
                      return (
                        <div key={ev.id} className="backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl p-4 flex items-center gap-4">
                          {ev.image_url ? (
                            <img src={ev.image_url} alt={ev.title} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-gray-700 flex items-center justify-center flex-shrink-0">
                              <Calendar className="w-5 h-5 text-gray-500" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-white font-semibold text-sm truncate">{ev.title}</p>
                            <p className="text-gray-400 text-xs truncate">{artistName} &middot; {dateStr} &middot; <span className={statusColor}>{ev.status}</span></p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {isEditing ? (
                              <>
                                <span className="text-gray-400 text-sm">$</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={editingPriceValue}
                                  onChange={(e) => setEditingPriceValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handlePriceUpdate(ev.id);
                                    if (e.key === 'Escape') { setEditingPriceId(null); setEditingPriceValue(''); }
                                  }}
                                  autoFocus
                                  className="w-24 bg-gray-700 border border-purple-500 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-purple-400"
                                />
                                <button
                                  onClick={() => handlePriceUpdate(ev.id)}
                                  disabled={priceSaving}
                                  className="px-3 py-2 bg-green-600 hover:bg-green-500 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                                >
                                  {priceSaving ? '...' : 'Save'}
                                </button>
                                <button
                                  onClick={() => { setEditingPriceId(null); setEditingPriceValue(''); }}
                                  className="px-3 py-2 bg-white/10 hover:bg-white/20 text-gray-300 text-xs rounded-lg transition-colors"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                <span className="text-white font-bold text-sm">${(ev.price ?? 0).toFixed(2)}</span>
                                <button
                                  onClick={() => { setEditingPriceId(ev.id); setEditingPriceValue((ev.price ?? 0).toString()); }}
                                  className="px-3 py-2 bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 text-xs font-semibold rounded-lg transition-colors border border-purple-500/30"
                                >
                                  Edit
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Visitor Count Base Management — visible in Revenue */}
              <div className={`border-t border-white/10 pt-6 mt-6 ${activeGroup !== 'revenue' ? 'hidden' : ''}`}>
                <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                  <BarChart3 className="w-6 h-6 text-purple-400" />
                  Visitor Count Base Settings
                </h3>
                <p className="text-sm text-gray-400 mb-6">
                  Set a starting/base number for the visitor counter. The displayed count = base + actual unique visitors.
                </p>

                <div className="space-y-4">
                  <div className="backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center">
                          <BarChart3 className="w-6 h-6 text-blue-300" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-white mb-1">Base Visitor Count</h3>
                          <p className="text-sm text-gray-400">Set the starting number for the visitor counter</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <label className="block text-sm text-gray-400 mb-2">Base Count</label>
                        <input
                          type="number"
                          value={visitorCountBase}
                          onChange={(e) => {
                            const value = e.target.value;
                            if (value === '' || (!isNaN(Number(value)) && Number(value) >= 0)) {
                              setVisitorCountBase(value);
                            }
                          }}
                          min="0"
                          step="1"
                          className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500/50"
                          placeholder="Enter base count"
                        />
                        <p className="text-xs text-gray-500 mt-2">
                          Current base: {appConfig.visitor_count_base?.toLocaleString() || 0}
                        </p>
                      </div>
                      <div className="flex flex-col gap-2">
                        <button
                          onClick={() => {
                            const newBase = parseInt(visitorCountBase, 10);
                            if (!isNaN(newBase) && newBase >= 0) {
                              updateVisitorCountBase(newBase);
                            } else {
                              setError('Please enter a valid number (0 or greater)');
                            }
                          }}
                          disabled={loadingConfig || resettingVisitorCount}
                          className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-xl font-semibold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          <Save className="w-4 h-4" />
                          Update Base
                        </button>
                        <button
                          onClick={resetVisitorCount}
                          disabled={loadingConfig || resettingVisitorCount}
                          className="px-6 py-2.5 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white rounded-xl font-semibold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          {resettingVisitorCount ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                              Resetting...
                            </>
                          ) : (
                            <>
                              <RotateCcw className="w-4 h-4" />
                              Reset Count
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                    
                    <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                      <p className="text-sm text-blue-300">
                        <strong>How it works:</strong> The displayed visitor count = Base Count + Actual Unique Visitors.
                        <br />
                        <strong>Reset:</strong> Sets the base to the current total, preserving the displayed number while clearing tracking data.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Artist Applications Management — visible in Applications */}
              <div className={`border-t border-white/10 pt-6 mt-6 ${activeGroup !== 'applications' ? 'hidden' : ''}`}>
                <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                  <Sparkles className="w-6 h-6 text-pink-400" />
                  Artist Applications
                </h3>
                <p className="text-sm text-gray-400 mb-4">
                  Review and manage artist applications. Qualified artists receive an invite link to create their account.
                </p>

                {/* Filter tabs */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {(['all', 'pending', 'qualified', 'rejected', 'registered'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setApplicationFilter(f)}
                      className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                        applicationFilter === f
                          ? 'bg-purple-600 text-white'
                          : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white border border-white/10'
                      }`}
                    >
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                      {f !== 'all' && (
                        <span className="ml-1.5 text-xs opacity-70">
                          ({artistApplications.filter(a => a.status === f).length})
                        </span>
                      )}
                      {f === 'all' && (
                        <span className="ml-1.5 text-xs opacity-70">({artistApplications.length})</span>
                      )}
                    </button>
                  ))}
                  <button
                    onClick={fetchArtistApplications}
                    disabled={applicationsLoading}
                    className="ml-auto px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white rounded-lg text-sm transition-all"
                  >
                    {applicationsLoading ? 'Loading...' : 'Refresh'}
                  </button>
                </div>

                {applicationsLoading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-500 mx-auto" />
                    <p className="text-gray-400 mt-3 text-sm">Loading applications...</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                    {artistApplications
                      .filter(a => applicationFilter === 'all' || a.status === applicationFilter)
                      .length === 0 ? (
                      <div className="text-center py-8 text-gray-500 text-sm">No applications found.</div>
                    ) : (
                      artistApplications
                        .filter(a => applicationFilter === 'all' || a.status === applicationFilter)
                        .map((app) => {
                          const statusColors: Record<string, string> = {
                            pending: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
                            qualified: 'text-green-400 bg-green-500/10 border-green-500/30',
                            rejected: 'text-red-400 bg-red-500/10 border-red-500/30',
                            registered: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
                          };
                          const statusColor = statusColors[app.status] || 'text-gray-400 bg-gray-500/10 border-gray-500/30';
                          const maxFollowers = Math.max(
                            app.youtube_followers || 0,
                            app.instagram_followers || 0,
                            app.tiktok_followers || 0,
                            app.facebook_followers || 0
                          );
                          const minFollowers = appConfig.artist_min_followers ?? 100000;
                          const meetsThreshold = maxFollowers >= minFollowers;
                          const dateStr = new Date(app.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

                          return (
                            <div key={app.id} className="backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl p-5">
                              <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                                    <h4 className="text-lg font-bold text-white">{app.stage_name}</h4>
                                    <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full border ${statusColor}`}>
                                      {app.status.toUpperCase()}
                                    </span>
                                    {meetsThreshold && (
                                      <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-green-500/10 text-green-400 border border-green-500/30">
                                        {minFollowers.toLocaleString()}+ Followers
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-sm text-gray-400 mb-1">
                                    {app.first_name} {app.last_name} &middot; {app.country_of_residence} &middot; Applied {dateStr}
                                  </p>
                                  <p className="text-sm text-gray-400 mb-2">
                                    <Mail className="w-3.5 h-3.5 inline mr-1" />{app.email}
                                    <span className="mx-2">&middot;</span>
                                    <Phone className="w-3.5 h-3.5 inline mr-1" />{app.phone}
                                  </p>

                                  {/* Social media stats */}
                                  <div className="flex flex-wrap gap-2 mb-2">
                                    {app.youtube_url && (
                                      <a href={app.youtube_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-1 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-300 hover:bg-red-500/20 transition-colors">
                                        <Video className="w-3 h-3" /> YT: {(app.youtube_followers || 0).toLocaleString()}
                                      </a>
                                    )}
                                    {app.instagram_url && (
                                      <a href={app.instagram_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-1 bg-pink-500/10 border border-pink-500/20 rounded-lg text-xs text-pink-300 hover:bg-pink-500/20 transition-colors">
                                        <Camera className="w-3 h-3" /> IG: {(app.instagram_followers || 0).toLocaleString()}
                                      </a>
                                    )}
                                    {app.tiktok_url && (
                                      <a href={app.tiktok_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-1 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-xs text-cyan-300 hover:bg-cyan-500/20 transition-colors">
                                        <Music className="w-3 h-3" /> TT: {(app.tiktok_followers || 0).toLocaleString()}
                                      </a>
                                    )}
                                    {app.facebook_url && (
                                      <a href={app.facebook_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-1 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs text-blue-300 hover:bg-blue-500/20 transition-colors">
                                        <Globe className="w-3 h-3" /> FB: {(app.facebook_followers || 0).toLocaleString()}
                                      </a>
                                    )}
                                  </div>

                                  {/* Screenshot proof thumbnails */}
                                  {(app.youtube_screenshot_url || app.instagram_screenshot_url || app.tiktok_screenshot_url || app.facebook_screenshot_url) && (
                                    <div className="flex flex-wrap gap-2 mb-2">
                                      {app.youtube_screenshot_url && (
                                        <a href={app.youtube_screenshot_url} target="_blank" rel="noopener noreferrer" className="group relative">
                                          <img src={app.youtube_screenshot_url} alt="YT proof" className="w-16 h-16 object-cover rounded-lg border-2 border-red-500/30 group-hover:border-red-500/60 transition-colors" />
                                          <span className="absolute bottom-0 left-0 right-0 bg-red-600/80 text-white text-[9px] text-center font-bold rounded-b-lg py-0.5">YT</span>
                                        </a>
                                      )}
                                      {app.instagram_screenshot_url && (
                                        <a href={app.instagram_screenshot_url} target="_blank" rel="noopener noreferrer" className="group relative">
                                          <img src={app.instagram_screenshot_url} alt="IG proof" className="w-16 h-16 object-cover rounded-lg border-2 border-pink-500/30 group-hover:border-pink-500/60 transition-colors" />
                                          <span className="absolute bottom-0 left-0 right-0 bg-pink-600/80 text-white text-[9px] text-center font-bold rounded-b-lg py-0.5">IG</span>
                                        </a>
                                      )}
                                      {app.tiktok_screenshot_url && (
                                        <a href={app.tiktok_screenshot_url} target="_blank" rel="noopener noreferrer" className="group relative">
                                          <img src={app.tiktok_screenshot_url} alt="TT proof" className="w-16 h-16 object-cover rounded-lg border-2 border-cyan-500/30 group-hover:border-cyan-500/60 transition-colors" />
                                          <span className="absolute bottom-0 left-0 right-0 bg-cyan-600/80 text-white text-[9px] text-center font-bold rounded-b-lg py-0.5">TT</span>
                                        </a>
                                      )}
                                      {app.facebook_screenshot_url && (
                                        <a href={app.facebook_screenshot_url} target="_blank" rel="noopener noreferrer" className="group relative">
                                          <img src={app.facebook_screenshot_url} alt="FB proof" className="w-16 h-16 object-cover rounded-lg border-2 border-blue-500/30 group-hover:border-blue-500/60 transition-colors" />
                                          <span className="absolute bottom-0 left-0 right-0 bg-blue-600/80 text-white text-[9px] text-center font-bold rounded-b-lg py-0.5">FB</span>
                                        </a>
                                      )}
                                    </div>
                                  )}

                                  {app.description && (
                                    <p className="text-xs text-gray-500 italic line-clamp-2">&ldquo;{app.description}&rdquo;</p>
                                  )}
                                  {app.online_event_video_url && (
                                    <a href={app.online_event_video_url} target="_blank" rel="noopener noreferrer" className="text-xs text-purple-400 hover:text-purple-300 mt-1 inline-flex items-center gap-1">
                                      <Link2 className="w-3 h-3" /> Previous event video
                                    </a>
                                  )}

                                  {/* Contract signature record (for qualified/registered) */}
                                  {app.contract_signed_at && (
                                    <div className="mt-3 pt-3 border-t border-white/10">
                                      <p className="text-xs font-semibold text-green-400/90 mb-1">Contract signed for record</p>
                                      <p className="text-xs text-gray-500">
                                        {new Date(app.contract_signed_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                                        {app.contract_signed_ip && <span className="ml-2">· IP {app.contract_signed_ip}</span>}
                                      </p>
                                      {app.contract_terms_snapshot && (
                                        <p className="text-xs text-gray-500 mt-1 italic">&ldquo;{app.contract_terms_snapshot}&rdquo;</p>
                                      )}
                                    </div>
                                  )}
                                </div>

                                {/* Actions */}
                                <div className="flex flex-row sm:flex-col gap-2 flex-shrink-0">
                                  {app.status === 'pending' && (
                                    <>
                                      <button
                                        onClick={() => handleApplicationAction(app.id, 'qualified')}
                                        className="px-4 py-2 bg-green-600/30 hover:bg-green-600/50 text-green-300 text-xs font-semibold rounded-lg transition-colors border border-green-500/30"
                                      >
                                        Approve
                                      </button>
                                      <button
                                        onClick={() => handleApplicationAction(app.id, 'rejected')}
                                        className="px-4 py-2 bg-red-600/30 hover:bg-red-600/50 text-red-300 text-xs font-semibold rounded-lg transition-colors border border-red-500/30"
                                      >
                                        Reject
                                      </button>
                                    </>
                                  )}
                                  {app.status === 'qualified' && (
                                    <button
                                      onClick={() => handleResendInvite(app)}
                                      disabled={resendingInvite === app.id}
                                      className="px-4 py-2 bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 text-xs font-semibold rounded-lg transition-colors border border-purple-500/30 disabled:opacity-50"
                                    >
                                      {resendingInvite === app.id ? 'Sending...' : 'Resend Invite'}
                                    </button>
                                  )}
                                  {app.status === 'rejected' && (
                                    <button
                                      onClick={() => handleApplicationAction(app.id, 'qualified')}
                                      className="px-4 py-2 bg-green-600/30 hover:bg-green-600/50 text-green-300 text-xs font-semibold rounded-lg transition-colors border border-green-500/30"
                                    >
                                      Override: Approve
                                    </button>
                                  )}
                                  {app.status === 'registered' && (
                                    <span className="px-4 py-2 text-blue-300 text-xs font-semibold bg-blue-500/10 border border-blue-500/20 rounded-lg text-center">
                                      Account Created
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;