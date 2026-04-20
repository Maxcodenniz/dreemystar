import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store/useStore';
import { useCartStore } from '../store/useCartStore';
import { SUPER_ADMIN_ID } from '../utils/constants';
import { Search, User, LogOut, Activity, Users, Heart, HelpCircle, MonitorPlay, Menu, X, UserCog, Settings, UserCircle, Music, Mic, Globe, ChevronRight, Calendar, Radio, MoreVertical, LayoutDashboard, Video, Ticket, BarChart3, Sparkles, PlayCircle, ShoppingCart, Newspaper } from 'lucide-react';
import VisitorCounter from './VisitorCounter';
import NotificationsPanel from './NotificationsPanel';
import CartIcon from './CartIcon';
import { supabase } from '../lib/supabaseClient';
import { normalizeCountryName } from '../utils/countries';

const LANGUAGES = [
  { code: 'en', label: 'EN' },
  { code: 'fr', label: 'FR' },
  { code: 'es', label: 'ES' },
] as const;

const Navbar: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, userProfile, signOut } = useStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showCategoriesDropdown, setShowCategoriesDropdown] = useState(false);
  const [showArtistToolsMenu, setShowArtistToolsMenu] = useState(false);
  const [showAdminToolsMenu, setShowAdminToolsMenu] = useState(false);
  const [popularCategories, setPopularCategories] = useState<Array<{name: string; type: string; count: number}>>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [artistRecordingsVisible, setArtistRecordingsVisible] = useState(true);
  const [adminRecordingsVisible, setAdminRecordingsVisible] = useState(true);
  const [visitorCounterVisible, setVisitorCounterVisible] = useState(true);
  const [bundlesEnabled, setBundlesEnabled] = useState(true);
  const [replaysEnabled, setReplaysEnabled] = useState(true);
  const [artistApplicationEnabled, setArtistApplicationEnabled] = useState(true);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [mobileSearchExpanded, setMobileSearchExpanded] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(typeof window !== 'undefined' ? window.innerWidth < 1280 : false);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);
  const cartCount = useCartStore((s) => s.getItemCount());

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 1279px)');
    const handler = () => setIsMobileViewport(mql.matches);
    handler();
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  const categoriesDropdownRef = useRef<HTMLDivElement>(null);
  const artistToolsDropdownRef = useRef<HTMLDivElement>(null);
  const adminToolsDropdownRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuPanelRef = useRef<HTMLDivElement>(null);
  const langMenuRef = useRef<HTMLDivElement>(null);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setShowMobileMenu(false);
      navigate(`/search?query=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleSearchKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      setShowMobileMenu(false);
      navigate(`/search?query=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  // Fetch popular categories for dropdown
  useEffect(() => {
    const fetchPopularCategories = async () => {
      try {
        setCategoriesLoading(true);
        // Fetch artists to calculate category counts
        const { data: artistsData, error } = await supabase
          .from('profiles')
          .select('artist_type, region, genres, country')
          .eq('user_type', 'artist');

        if (error) throw error;

        const categories: Array<{name: string; type: string; count: number}> = [];

        // Maghreb countries list (normalized)
        const maghrebCountries = ['Morocco', 'Algeria', 'Tunisia', 'Libya', 'Mauritania'].map(c => c.toLowerCase());

        // Add regions with counts (including Maghreb) — always include all regions so Asian/Maghreb show even with 0 count
        const regions = ['African', 'European', 'American', 'Asian', 'Maghreb'];
        regions.forEach(region => {
          let count = artistsData?.filter(artist => artist.region === region).length || 0;

          // For Maghreb, also check country field for backward compatibility
          if (region === 'Maghreb') {
            const maghrebByCountry = artistsData?.filter(artist => {
              if (artist.region === 'Maghreb') return false;
              if (!artist.country) return false;
              const normalizedCountry = normalizeCountryName(artist.country);
              if (!normalizedCountry) return false;
              return maghrebCountries.includes(normalizedCountry.toLowerCase());
            }).length || 0;
            count += maghrebByCountry;
          }

          categories.push({ name: region, type: 'region', count });
        });

        // Add artist types with counts (genres) — always include so they always show
        ['music', 'comedy'].forEach(type => {
          const count = artistsData?.filter(artist => artist.artist_type === type).length || 0;
          categories.push({
            name: type.charAt(0).toUpperCase() + type.slice(1),
            type: 'type',
            count
          });
        });

        // Sort: genres first (by count), then regions (by count)
        // Define region order
        const regionOrder = ['African', 'European', 'American', 'Asian', 'Maghreb'];
        
        const sorted = categories.sort((a, b) => {
          // First, separate by type: genres (type='type') come before regions (type='region')
          if (a.type !== b.type) {
            if (a.type === 'type') return -1; // Genres first
            if (b.type === 'type') return 1;
          }
          
          // If both are genres, sort by count (descending)
          if (a.type === 'type' && b.type === 'type') {
            return b.count - a.count;
          }
          
          // If both are regions, sort by predefined order, then by count
          if (a.type === 'region' && b.type === 'region') {
            const aIndex = regionOrder.indexOf(a.name);
            const bIndex = regionOrder.indexOf(b.name);
            
            // If both are in the predefined order, maintain that order
            if (aIndex !== -1 && bIndex !== -1) {
              return aIndex - bIndex;
            }
            // If only one is in the order, prioritize it
            if (aIndex !== -1) return -1;
            if (bIndex !== -1) return 1;
            // If neither is in the order, sort by count
            return b.count - a.count;
          }
          
          return 0;
        });
        
        // Get all categories (no limit, show all genres and regions)
        setPopularCategories(sorted);
      } catch (err) {
        console.error('Error fetching popular categories:', err);
        // Fallback to default categories (genres first, then regions in order)
        setPopularCategories([
          { name: 'Music', type: 'type', count: 0 },
          { name: 'Comedy', type: 'type', count: 0 },
          { name: 'African', type: 'region', count: 0 },
          { name: 'European', type: 'region', count: 0 },
          { name: 'American', type: 'region', count: 0 },
          { name: 'Asian', type: 'region', count: 0 },
          { name: 'Maghreb', type: 'region', count: 0 }
        ]);
      } finally {
        setCategoriesLoading(false);
      }
    };

    fetchPopularCategories();
  }, []);

  const isArtist = userProfile?.user_type === 'artist';
  const isAdmin = userProfile?.user_type === 'global_admin' || userProfile?.user_type === 'super_admin';
  const isSuperAdmin = userProfile?.user_type === 'super_admin' || userProfile?.id === SUPER_ADMIN_ID;

  // Fetch artist recordings visibility config (after isArtist is declared)
  useEffect(() => {
    const fetchRecordingsVisibility = async () => {
      try {
        const { data, error } = await supabase
          .from('app_config')
          .select('key, value')
          .eq('key', 'artist_recordings_visible')
          .single();

        if (!error && data) {
          setArtistRecordingsVisible(data.value === true || data.value === 'true');
        }
      } catch (err) {
        console.error('Error fetching recordings visibility config:', err);
        // Default to visible if error
        setArtistRecordingsVisible(true);
      }
    };

    if (isArtist) {
      fetchRecordingsVisibility();
    }
  }, [isArtist]);

  // Fetch admin recordings visibility config (for normal admins; super admins always see Recordings)
  useEffect(() => {
    const fetchAdminRecordingsVisibility = async () => {
      try {
        const { data, error } = await supabase
          .from('app_config')
          .select('key, value')
          .eq('key', 'admin_recordings_visible')
          .single();

        if (!error && data) {
          setAdminRecordingsVisible(data.value === true || data.value === 'true');
        }
      } catch (err) {
        console.error('Error fetching admin recordings visibility config:', err);
        setAdminRecordingsVisible(true);
      }
    };

    if (isAdmin) {
      fetchAdminRecordingsVisibility();
    }
  }, [isAdmin]);

  // Fetch visitor counter visibility config
  useEffect(() => {
    const fetchVisitorCounterVisibility = async () => {
      try {
        const { data, error } = await supabase
          .from('app_config')
          .select('key, value')
          .eq('key', 'visitor_counter_visible')
          .single();

        if (!error && data) {
          setVisitorCounterVisible(data.value === true || data.value === 'true');
        }
      } catch (err) {
        console.error('Error fetching visitor counter visibility config:', err);
        // Default to visible if error
        setVisitorCounterVisible(true);
      }
    };

    fetchVisitorCounterVisibility();
  }, []);

  useEffect(() => {
    const fetchBundlesEnabled = async () => {
      try {
        const { data, error } = await supabase
          .from('app_config')
          .select('value')
          .eq('key', 'bundles_enabled')
          .maybeSingle();
        if (!error && data != null) {
          setBundlesEnabled(data.value === true || data.value === 'true');
        }
      } catch {
        setBundlesEnabled(true);
      }
    };
    fetchBundlesEnabled();
  }, []);

  useEffect(() => {
    const fetchReplaysEnabled = async () => {
      try {
        const { data, error } = await supabase
          .from('app_config')
          .select('value')
          .eq('key', 'replays_enabled')
          .maybeSingle();
        if (!error && data != null) {
          setReplaysEnabled(data.value === true || data.value === 'true');
        }
      } catch {
        setReplaysEnabled(true);
      }
    };
    fetchReplaysEnabled();
  }, []);

  useEffect(() => {
    const fetchArtistApplicationEnabled = async () => {
      try {
        const { data, error } = await supabase
          .from('app_config')
          .select('value')
          .eq('key', 'artist_application_enabled')
          .maybeSingle();
        if (!error && data != null) {
          setArtistApplicationEnabled(data.value === true || data.value === 'true');
        }
      } catch {
        setArtistApplicationEnabled(true);
      }
    };
    fetchArtistApplicationEnabled();
  }, []);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (showMobileMenu) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [showMobileMenu]);

  // Close dropdowns when clicking/touching outside (works for mobile touch)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = (e.target as Node);
      if (categoriesDropdownRef.current && !categoriesDropdownRef.current.contains(target)) {
        setShowCategoriesDropdown(false);
      }
      if (artistToolsDropdownRef.current && !artistToolsDropdownRef.current.contains(target)) {
        setShowArtistToolsMenu(false);
      }
      if (adminToolsDropdownRef.current && !adminToolsDropdownRef.current.contains(target)) {
        setShowAdminToolsMenu(false);
      }
      if (profileMenuRef.current && !profileMenuRef.current.contains(target)) {
        setShowProfileMenu(false);
      }
      if (langMenuRef.current && !langMenuRef.current.contains(target)) {
        setShowLangMenu(false);
      }
      // Close mobile menu when tapping/clicking outside the hamburger button and the menu panel
      if (
        showMobileMenu &&
        !mobileMenuButtonRef.current?.contains(target) &&
        !mobileMenuPanelRef.current?.contains(target)
      ) {
        setShowMobileMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showMobileMenu]);

  // Main navigation items (Help and Favorites moved to profile menu for smaller screens)
  const mainNavItems = [
    { to: '/', labelKey: 'home' as const },
    { to: '/live-events', labelKey: 'liveEvents' as const, icon: Radio },
    { to: '/upcoming-concerts', labelKey: 'upcomingConcerts' as const, icon: Calendar },
    ...(replaysEnabled ? [{ to: '/replays', labelKey: 'replays' as const, icon: PlayCircle }] : []),
    ...(bundlesEnabled ? [{ to: '/bundles', labelKey: 'bundles' as const, icon: Ticket }] : []),
    { to: '/news', labelKey: 'news' as const, icon: Newspaper },
    { to: '/categories', labelKey: 'categories' as const }
  ];

  const desktopMainNavItems = mainNavItems;

  // Artist-specific items
  const artistNavItems = [
    { to: '/schedule', labelKey: 'schedule' as const, icon: Calendar },
    { to: '/go-live', labelKey: 'goLive' as const, icon: Radio },
    { to: '/dashboard', labelKey: 'dashboard' as const, icon: LayoutDashboard },
    { to: '/followers', labelKey: 'followers' as const, icon: Users },
    ...(artistRecordingsVisible ? [{ to: '/recordings', labelKey: 'myRecordings' as const, icon: Video }] : [])
  ];

  // Admin items (grouped in dropdown)
  const adminNavItems = isSuperAdmin ? [
    { to: '/schedule', labelKey: 'schedule' as const, icon: Calendar },
    { to: '/monitoring', labelKey: 'monitoring' as const, icon: Activity },
    { to: '/users', labelKey: 'users' as const, icon: Users },
    { to: '/advertisements', labelKey: 'advertisements' as const, icon: MonitorPlay },
    { to: '/artist-management', labelKey: 'artistManagement' as const, icon: UserCog },
    { to: '/recordings', labelKey: 'recordings' as const, icon: Video },
    { to: '/tickets', labelKey: 'tickets' as const, icon: Ticket },
    { to: '/analytics', labelKey: 'analytics' as const, icon: BarChart3 },
    { to: '/artist-survey-insights', labelKey: 'artistSurveyInsights' as const, icon: BarChart3 },
    { to: '/help-management', labelKey: 'helpManagement' as const, icon: Settings },
    { to: '/photo-management', labelKey: 'photoManagement' as const, icon: Settings }
  ] : isAdmin ? [
    { to: '/schedule', labelKey: 'schedule' as const, icon: Calendar },
    { to: '/monitoring', labelKey: 'monitoring' as const, icon: Activity },
    { to: '/users', labelKey: 'users' as const, icon: Users },
    { to: '/advertisements', labelKey: 'advertisements' as const, icon: MonitorPlay },
    { to: '/artist-management', labelKey: 'artistManagement' as const, icon: UserCog },
    ...(adminRecordingsVisible ? [{ to: '/recordings', labelKey: 'recordings' as const, icon: Video }] : []),
    { to: '/tickets', labelKey: 'tickets' as const, icon: Ticket },
    { to: '/analytics', labelKey: 'analytics' as const, icon: BarChart3 },
    { to: '/artist-survey-insights', labelKey: 'artistSurveyInsights' as const, icon: BarChart3 },
    { to: '/help-management', labelKey: 'helpManagement' as const, icon: Settings }
  ] : [];

  // Mobile nav items in specified order: Home, Go Live, Schedule, Live Events, Upcoming Concert, Dashboard, Categories
  const mobileNavItemsBase = [
    { to: '/', labelKey: 'home' as const },
    ...(isArtist ? [{ to: '/go-live', labelKey: 'goLive' as const, icon: Radio }] : []),
    ...(isArtist || isAdmin || isSuperAdmin ? [{ to: '/schedule', labelKey: 'schedule' as const, icon: Calendar }] : []),
    { to: '/live-events', labelKey: 'liveEvents' as const, icon: Radio },
    { to: '/upcoming-concerts', labelKey: 'upcomingConcerts' as const, icon: Calendar },
    ...(replaysEnabled ? [{ to: '/replays', labelKey: 'replays' as const, icon: PlayCircle }] : []),
    ...(bundlesEnabled ? [{ to: '/bundles', labelKey: 'bundles' as const, icon: Ticket }] : []),
    ...(isArtist ? [{ to: '/dashboard', labelKey: 'dashboard' as const, icon: LayoutDashboard }] : []),
    { to: '/categories', labelKey: 'categories' as const },
  ];
  const mobileNavPaths = new Set(mobileNavItemsBase.map((i) => i.to));
  const mobileNavAdminTail = adminNavItems.filter((item) => !mobileNavPaths.has(item.to));
  const mobileNavItems = [...mobileNavItemsBase, ...mobileNavAdminTail];
  // For mobile: use ordered list; for other uses (e.g. future) keep combined items
  const allNavItems = [
    ...mainNavItems,
    ...(isArtist ? artistNavItems : []),
    ...adminNavItems
  ];

  return (
    <nav className="bg-gradient-to-b from-gray-900/95 via-gray-900/90 to-gray-900/95 backdrop-blur-xl text-white py-4 fixed w-full z-50 shadow-2xl border-b border-white/10 min-h-20">
      <div className="flex items-center">
        {/* Logo - Fixed left with minimal padding */}
        <div className="pl-2 xl:pl-4 flex-shrink-0">
          <Link to="/" className="flex items-center space-x-2 group">
            <div className="relative w-12 h-12 flex-shrink-0">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full blur-md opacity-50 group-hover:opacity-75 transition-opacity"></div>
              <div className="relative w-full h-full rounded-full overflow-hidden ring-2 ring-white/20 group-hover:ring-purple-500/50 transition-all duration-300">
                <img 
                  src="/logod.png" 
                  alt="DREEMYSTAR Logo" 
                  className="w-full h-full object-cover"
                  style={{ objectPosition: 'center' }}
                />
              </div>
            </div>
            <span className="text-lg font-bold hidden xl:block bg-gradient-to-r from-purple-300 via-pink-300 to-purple-300 bg-clip-text text-transparent group-hover:from-purple-200 group-hover:via-pink-200 group-hover:to-purple-200 transition-all duration-300 whitespace-nowrap">
              DREEMYSTAR LIVE CONCERT
            </span>
          </Link>
        </div>

        {/* Navigation Container - Takes remaining space; min-w-0 allows shrinking */}
        <div className="flex-1 min-w-0 max-w-7xl px-2 ml-2 xl:px-6 xl:ml-10">
          <div className="flex items-center justify-between gap-2 xl:gap-4 min-w-0">
            {/* Desktop Navigation - Centered; no scroll (Favorites/My Profile in More dropdown) */}
            <div className="hidden xl:flex items-center space-x-2 flex-1 min-w-0 px-4 justify-center">
            {desktopMainNavItems.map(item => (
              item.to === '/categories' ? (
                <div 
                  key={item.to}
                  ref={categoriesDropdownRef}
                  className="relative flex-shrink-0"
                >
                  <div className="flex items-center">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (popularCategories.length > 0) {
                          setShowCategoriesDropdown(prev => !prev);
                        } else {
                          navigate('/categories');
                          window.scrollTo(0, 0);
                        }
                      }}
                      className={`px-3 py-2 rounded-xl font-semibold text-sm transition-all duration-300 flex items-center space-x-1.5 whitespace-nowrap ${
                        location.pathname === item.to 
                          ? 'bg-gradient-to-r from-purple-600/30 to-pink-600/30 text-white border border-purple-500/50 shadow-lg shadow-purple-500/20' 
                          : 'text-gray-300 hover:text-white hover:bg-white/5 border border-transparent'
                      }`}
                      aria-expanded={showCategoriesDropdown}
                      aria-haspopup="true"
                    >
                      {item.icon && <item.icon size={16} />}
                      <span>{t(`nav.${item.labelKey}`)}</span>
                      <ChevronRight 
                        size={14} 
                        className={`transition-transform duration-300 ${
                          showCategoriesDropdown ? 'rotate-90' : ''
                        }`} 
                      />
                    </button>
                  </div>
                  {showCategoriesDropdown && popularCategories.length > 0 && (
                    <div 
                      className="absolute left-0 mt-2 w-72 bg-gradient-to-br from-gray-900/95 via-gray-800/95 to-gray-900/95 backdrop-blur-xl rounded-2xl shadow-2xl py-3 border border-white/10 z-[100] animate-in fade-in slide-in-from-top-2 duration-300"
                    >
                      {/* View All Categories */}
                      <Link
                        to="/categories"
                        className="block px-4 py-3 mx-2 mb-2 text-white hover:bg-gradient-to-r hover:from-purple-600/30 hover:to-pink-600/30 transition-all duration-300 font-bold rounded-xl border border-white/10 hover:border-purple-500/50 group"
                        onClick={() => {
                          setShowCategoriesDropdown(false);
                          window.scrollTo(0, 0);
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <span className="bg-gradient-to-r from-purple-300 to-pink-300 bg-clip-text text-transparent group-hover:from-purple-200 group-hover:to-pink-200 transition-all">
                            {t('nav.viewAllCategories')}
                          </span>
                          <ChevronRight size={14} className="text-purple-400 group-hover:translate-x-1 transition-transform" />
                        </div>
                      </Link>
                      
                      {/* Popular Categories */}
                      <div className="px-2 py-2">
                        <div className="px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                          <div className="w-1 h-4 bg-gradient-to-b from-purple-500 to-pink-500 rounded-full"></div>
                          {t('nav.quickAccess')}
                        </div>
                        {popularCategories.map((category) => {
                          const categoryUrl = `/categories?${category.type === 'region' ? 'genre' : 'genre'}=${encodeURIComponent(category.name)}`;
                          const isActive = location.search.includes(encodeURIComponent(category.name));
                          
                          return (
                            <Link
                              key={`${category.type}-${category.name}`}
                              to={categoryUrl}
                              className={`flex items-center justify-between px-3 py-2.5 mx-2 rounded-xl transition-all duration-300 group/item cursor-pointer mb-1 ${
                                isActive 
                                  ? 'bg-gradient-to-r from-purple-600/40 to-pink-600/40 text-white border border-purple-500/50 shadow-lg shadow-purple-500/20' 
                                  : 'text-white hover:bg-white/5 border border-transparent hover:border-white/10'
                              }`}
                              onClick={() => {
                                setShowCategoriesDropdown(false);
                                window.scrollTo(0, 0);
                              }}
                            >
                              <div className="flex items-center space-x-3">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                  isActive 
                                    ? 'bg-white/20' 
                                    : category.type === 'type' && category.name === 'Music'
                                    ? 'bg-purple-500/20'
                                    : category.type === 'type' && category.name === 'Comedy'
                                    ? 'bg-pink-500/20'
                                    : 'bg-blue-500/20'
                                }`}>
                                  {category.type === 'type' ? (
                                    category.name === 'Music' ? (
                                      <Music size={16} className={isActive ? "text-white" : "text-purple-400"} />
                                    ) : (
                                      <Mic size={16} className={isActive ? "text-white" : "text-pink-400"} />
                                    )
                                  ) : (
                                    <Globe size={16} className={isActive ? "text-white" : "text-blue-400"} />
                                  )}
                                </div>
                                <span className="text-sm font-semibold">{t(`common.${category.name.toLowerCase()}`)}</span>
                              </div>
                              {category.count > 0 && (
                                <span className={`text-xs px-2.5 py-1 rounded-lg font-bold ${
                                  isActive 
                                    ? 'bg-white/20 text-white' 
                                    : 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-300 group-hover/item:from-purple-500/40 group-hover/item:to-pink-500/40'
                                }`}>
                                  {category.count}
                                </span>
                              )}
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`px-3 py-2 rounded-xl font-semibold text-sm transition-all duration-300 flex items-center space-x-1.5 whitespace-nowrap flex-shrink-0 ${
                    location.pathname === item.to 
                      ? 'bg-gradient-to-r from-purple-600/30 to-pink-600/30 text-white border border-purple-500/50 shadow-lg shadow-purple-500/20' 
                      : 'text-gray-300 hover:text-white hover:bg-white/5 border border-transparent'
                  }`}
                  onClick={() => window.scrollTo(0, 0)}
                >
                  {item.icon && <item.icon size={16} />}
                  <span>{t(`nav.${item.labelKey}`)}</span>
                </Link>
              )
            ))}

            {/* Artist Tools Dropdown */}
            {isArtist && (
              <div 
                ref={artistToolsDropdownRef}
                className="relative flex-shrink-0"
              >
                <button
                  type="button"
                  onClick={() => setShowArtistToolsMenu(prev => !prev)}
                  className={`px-3 py-2 rounded-xl font-semibold text-sm transition-all duration-300 flex items-center space-x-1.5 whitespace-nowrap ${
                    artistNavItems.some(item => location.pathname === item.to)
                      ? 'bg-gradient-to-r from-purple-600/30 to-pink-600/30 text-white border border-purple-500/50 shadow-lg shadow-purple-500/20' 
                      : 'text-gray-300 hover:text-white hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <Radio size={16} />
                  <span>{t('nav.artistTools')}</span>
                  <ChevronRight 
                    size={14} 
                    className={`transition-transform duration-300 ${
                      showArtistToolsMenu ? 'rotate-90' : ''
                    }`} 
                  />
                </button>
                {showArtistToolsMenu && (
                  <div 
                    className="absolute left-0 mt-2 w-56 bg-gradient-to-br from-gray-900/95 via-gray-800/95 to-gray-900/95 backdrop-blur-xl rounded-2xl shadow-2xl py-2 border border-white/10 z-[100] animate-in fade-in slide-in-from-top-2 duration-300"
                  >
                    {artistNavItems.map((item) => (
                      <Link
                        key={item.to}
                        to={item.to}
                        className={`flex items-center px-4 py-3 text-white hover:bg-gradient-to-r hover:from-purple-600/30 hover:to-pink-600/30 transition-all duration-300 mx-2 rounded-xl group ${
                          location.pathname === item.to ? 'bg-gradient-to-r from-purple-600/30 to-pink-600/30' : ''
                        }`}
                        onClick={() => {
                          setShowArtistToolsMenu(false);
                          window.scrollTo(0, 0);
                        }}
                      >
                        <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center mr-3 group-hover:bg-purple-500/30 transition-colors">
                          {item.icon && <item.icon size={16} className="text-purple-400" />}
                        </div>
                        <span className="font-semibold">{t(`nav.${item.labelKey}`)}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Admin Tools Dropdown */}
            {(isAdmin || isSuperAdmin) && adminNavItems.length > 0 && (
              <div 
                ref={adminToolsDropdownRef}
                className="relative flex-shrink-0"
              >
                <button
                  type="button"
                  onClick={() => setShowAdminToolsMenu(prev => !prev)}
                  className={`px-3 py-2 rounded-xl font-semibold text-sm transition-all duration-300 flex items-center space-x-1.5 whitespace-nowrap ${
                    adminNavItems.some(item => location.pathname === item.to)
                      ? 'bg-gradient-to-r from-purple-600/30 to-pink-600/30 text-white border border-purple-500/50 shadow-lg shadow-purple-500/20' 
                      : 'text-gray-300 hover:text-white hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <LayoutDashboard size={16} />
                  <span>{t('nav.adminTools')}</span>
                  <ChevronRight 
                    size={14} 
                    className={`transition-transform duration-300 ${
                      showAdminToolsMenu ? 'rotate-90' : ''
                    }`} 
                  />
                </button>
                {showAdminToolsMenu && (
                  <div 
                    className="absolute left-0 mt-2 w-64 bg-gradient-to-br from-gray-900/95 via-gray-800/95 to-gray-900/95 backdrop-blur-xl rounded-2xl shadow-2xl py-2 border border-white/10 z-[100] animate-in fade-in slide-in-from-top-2 duration-300"
                  >
                    <div className="px-3 py-2 mb-2">
                      <div className="px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                        <div className="w-1 h-4 bg-gradient-to-b from-purple-500 to-pink-500 rounded-full"></div>
                        {isSuperAdmin ? t('nav.superAdminPanel') : t('nav.adminPanel')}
                      </div>
                    </div>
                    {adminNavItems.map((item) => (
                      <Link
                        key={item.to}
                        to={item.to}
                        className={`flex items-center px-4 py-3 text-white hover:bg-gradient-to-r hover:from-purple-600/30 hover:to-pink-600/30 transition-all duration-300 mx-2 rounded-xl group ${
                          location.pathname === item.to ? 'bg-gradient-to-r from-purple-600/30 to-pink-600/30' : ''
                        }`}
                        onClick={() => {
                          setShowAdminToolsMenu(false);
                          window.scrollTo(0, 0);
                        }}
                      >
                        <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center mr-3 group-hover:bg-purple-500/30 transition-colors">
                          {item.icon && <item.icon size={16} className="text-purple-400" />}
                        </div>
                        <span className="font-semibold">{t(`nav.${item.labelKey}`)}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
            </div>

            {/* Mobile: News button with purple-orange gradient effect */}
            <Link
              to="/news"
              onClick={() => window.scrollTo(0, 0)}
              className="xl:hidden flex-shrink-0 h-9 min-w-[3.25rem] px-2 rounded-xl bg-gradient-to-r from-purple-600/50 via-purple-500/40 to-orange-500/50 hover:from-purple-500/60 hover:via-purple-400/50 hover:to-orange-400/60 border border-purple-500/40 hover:border-orange-400/50 text-white transition-all flex items-center justify-center text-xs font-semibold uppercase tracking-wide shadow-lg shadow-purple-500/20"
            >
              {t('nav.newsMobile')}
            </Link>

            {/* Search, Auth, and Visitor Counter - on mobile use smaller gap so profile stays visible */}
            <div className="flex items-center space-x-1 xl:space-x-2 ml-auto flex-shrink-0 min-w-0">
            {/* Mobile: compact search between burger and language; expands on tap/focus */}
            <div className="relative xl:hidden order-2 flex-shrink-0 ml-2">
              {!mobileSearchExpanded ? (
                <button
                  type="button"
                  onClick={() => {
                    setMobileSearchExpanded(true);
                    setTimeout(() => mobileSearchInputRef.current?.focus(), 50);
                  }}
                  className="w-9 h-9 xl:w-10 xl:h-10 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-purple-400 transition-all flex items-center justify-center flex-shrink-0"
                  aria-label={t('nav.searchPlaceholder')}
                >
                  <Search size={18} />
                </button>
              ) : (
                <form onSubmit={(e) => { handleSearchSubmit(e); setMobileSearchExpanded(false); }} className="relative flex items-center">
                  <Search className="absolute left-3 text-gray-400 pointer-events-none" size={18} />
                  <input
                    ref={mobileSearchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={handleSearch}
                    onKeyPress={handleSearchKeyPress}
                    onBlur={() => setTimeout(() => setMobileSearchExpanded(false), 200)}
                    placeholder={t('nav.searchPlaceholder')}
                    className="w-36 sm:w-44 pl-9 pr-3 py-2 bg-gradient-to-br from-gray-800/80 to-gray-700/60 backdrop-blur-sm border border-white/10 rounded-full text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500/50 transition-all"
                  />
                </form>
              )}
            </div>
            {/* Desktop: search bar (hidden below xl so mobile search shows instead) */}
            <div className="relative hidden xl:block min-w-0 flex-shrink order-2">
              <form onSubmit={handleSearchSubmit} className="relative min-w-0">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 cursor-pointer hover:text-purple-400 transition-colors z-10" size={18} onClick={handleSearchSubmit} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={handleSearch}
                  onKeyPress={handleSearchKeyPress}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  placeholder={t('nav.searchPlaceholder')}
                  className={`pl-10 pr-4 py-2 bg-gradient-to-br from-gray-800/80 to-gray-700/60 backdrop-blur-sm border border-white/10 rounded-full text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500/50 transition-all duration-300 shadow-xl hover:shadow-2xl hover:shadow-purple-500/20 ${
                    searchFocused || searchQuery.length > 0 ? 'w-48 min-w-[8rem] max-w-[14rem]' : 'w-20 min-w-[5rem]'
                  }`}
                />
              </form>
            </div>

            {/* Language selector */}
            <div ref={langMenuRef} className="relative flex-shrink-0 order-2">
              <button
                type="button"
                onClick={() => setShowLangMenu(!showLangMenu)}
                className="flex items-center justify-center w-9 h-9 xl:w-auto xl:h-auto xl:min-w-0 gap-1.5 px-2 xl:px-2.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all"
                aria-label="Select language"
              >
                <Globe className="h-4 w-4 text-purple-400 flex-shrink-0" />
                <span className="hidden xl:inline text-sm font-semibold text-gray-300 uppercase">
                  {LANGUAGES.find((l) => l.code === i18n.language)?.label || 'EN'}
                </span>
              </button>
              {showLangMenu && (
                <div className="absolute right-0 mt-2 w-32 bg-gradient-to-br from-gray-900/95 via-gray-800/95 to-gray-900/95 backdrop-blur-xl rounded-xl shadow-xl py-1 border border-white/10 z-[100]">
                  {LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      type="button"
                      onClick={() => {
                        i18n.changeLanguage(lang.code);
                        setShowLangMenu(false);
                      }}
                      className={`w-full text-left px-4 py-2.5 text-sm font-semibold transition-colors ${
                        i18n.language === lang.code
                          ? 'bg-purple-600/30 text-purple-300'
                          : 'text-gray-300 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Visitor Counter */}
            {visitorCounterVisible && (
              <div className="hidden xl:block flex-shrink-0 order-2">
                <VisitorCounter />
              </div>
            )}

            {/* Cart Icon — desktop only; on mobile cart is inside burger menu */}
            <div className="hidden xl:block flex-shrink-0 order-2">
              <CartIcon />
            </div>

            {user && (
              <div className="flex-shrink-0 order-2 flex items-center">
                <NotificationsPanel compact={isMobileViewport} />
              </div>
            )}

            {user ? (
              <div ref={profileMenuRef} className="relative flex-shrink-0 order-2">
                <button
                  onClick={() => setShowProfileMenu(!showProfileMenu)}
                  className="flex items-center justify-center xl:justify-start space-x-2 w-9 h-9 xl:w-auto xl:h-auto xl:min-w-0 px-2 xl:px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all duration-300 group"
                >
                  {userProfile?.avatar_url ? (
                    <div className="relative flex-shrink-0">
                      <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full blur-sm opacity-50 group-hover:opacity-75 transition-opacity"></div>
                      <img
                        src={userProfile.avatar_url}
                        alt="Profile"
                        className="h-7 w-7 xl:h-8 xl:w-8 rounded-full object-cover ring-2 ring-purple-500/50 relative z-10 group-hover:ring-purple-500 transition-all"
                        style={{ objectPosition: 'center top' }}
                      />
                    </div>
                  ) : (
                    <div className="h-7 w-7 xl:h-8 xl:w-8 bg-gradient-to-br from-purple-500/30 to-pink-500/30 rounded-full flex items-center justify-center ring-2 ring-purple-500/50 group-hover:ring-purple-500 transition-all">
                      <User className="h-4 w-4 xl:h-5 xl:w-5 text-purple-300" />
                    </div>
                  )}
                  <span className="hidden sm:inline font-semibold text-gray-300 group-hover:text-white transition-colors">
                    {userProfile?.full_name || t('nav.user', 'User')}
                  </span>
                </button>
                
                {showProfileMenu && (
                  <div className="absolute right-0 mt-2 w-56 bg-gradient-to-br from-gray-900/95 via-gray-800/95 to-gray-900/95 backdrop-blur-xl rounded-2xl shadow-2xl py-2 border border-white/10 z-[100] animate-in fade-in slide-in-from-top-2 duration-300">
                    <Link
                      to={`/artist/${user.id}`}
                      className="flex items-center px-4 py-3 text-white hover:bg-gradient-to-r hover:from-purple-600/30 hover:to-pink-600/30 transition-all duration-300 mx-2 rounded-xl group"
                      onClick={() => {
                        setShowProfileMenu(false);
                        window.scrollTo(0, 0);
                      }}
                    >
                      <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center mr-3 group-hover:bg-purple-500/30 transition-colors">
                        <UserCircle size={16} className="text-purple-400" />
                      </div>
                      <span className="font-semibold">{t('nav.myProfile')}</span>
                    </Link>
                    {!isAdmin && !isSuperAdmin && (
                      <>
                        <Link
                          to="/favorites"
                          className="flex items-center px-4 py-3 text-white hover:bg-gradient-to-r hover:from-purple-600/30 hover:to-pink-600/30 transition-all duration-300 mx-2 rounded-xl group"
                          onClick={() => {
                            setShowProfileMenu(false);
                            window.scrollTo(0, 0);
                          }}
                        >
                          <div className="w-8 h-8 rounded-lg bg-pink-500/20 flex items-center justify-center mr-3 group-hover:bg-pink-500/30 transition-colors">
                            <Heart size={16} className="text-pink-400" />
                          </div>
                          <span className="font-semibold">{t('nav.favorites')}</span>
                        </Link>
                        <Link
                          to="/help"
                          className="flex items-center px-4 py-3 text-white hover:bg-gradient-to-r hover:from-purple-600/30 hover:to-pink-600/30 transition-all duration-300 mx-2 rounded-xl group"
                          onClick={() => {
                            setShowProfileMenu(false);
                            window.scrollTo(0, 0);
                          }}
                        >
                          <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center mr-3 group-hover:bg-amber-500/30 transition-colors">
                            <HelpCircle size={16} className="text-amber-400" />
                          </div>
                          <span className="font-semibold">{t('nav.help')}</span>
                        </Link>
                      </>
                    )}
                    {isArtist || isAdmin ? (
                      <Link
                        to="/dashboard"
                        className="flex items-center px-4 py-3 text-white hover:bg-gradient-to-r hover:from-blue-600/30 hover:to-cyan-600/30 transition-all duration-300 mx-2 rounded-xl group"
                        onClick={() => {
                          setShowProfileMenu(false);
                          window.scrollTo(0, 0);
                        }}
                      >
                        <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center mr-3 group-hover:bg-blue-500/30 transition-colors">
                          <Activity size={16} className="text-blue-400" />
                        </div>
                        <span className="font-semibold">{t('nav.dashboard')}</span>
                      </Link>
                    ) : (
                      <Link
                        to="/profile"
                        className="flex items-center px-4 py-3 text-white hover:bg-gradient-to-r hover:from-gray-600/30 hover:to-gray-700/30 transition-all duration-300 mx-2 rounded-xl group"
                        onClick={() => {
                          setShowProfileMenu(false);
                          window.scrollTo(0, 0);
                        }}
                      >
                        <div className="w-8 h-8 rounded-lg bg-gray-500/20 flex items-center justify-center mr-3 group-hover:bg-gray-500/30 transition-colors">
                          <Settings size={16} className="text-gray-400" />
                        </div>
                        <span className="font-semibold">{t('nav.settings', 'Settings')}</span>
                      </Link>
                    )}
                    <div className="border-t border-white/10 my-2"></div>
                    <button
                      onClick={() => {
                        handleSignOut();
                        setShowProfileMenu(false);
                      }}
                      className="flex items-center w-full text-left px-4 py-3 text-white hover:bg-gradient-to-r hover:from-red-600/30 hover:to-rose-600/30 transition-all duration-300 mx-2 rounded-xl group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center mr-3 group-hover:bg-red-500/30 transition-colors">
                        <LogOut size={16} className="text-red-400" />
                      </div>
                      <span className="font-semibold">{t('nav.signOut')}</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center space-x-3 order-2">
                {artistApplicationEnabled && (
                  <Link
                    to="/artist-application"
                    className="hidden lg:flex items-center space-x-1.5 px-4 py-2 text-purple-300 hover:text-white border border-purple-500/30 hover:border-purple-500/60 hover:bg-purple-500/10 rounded-xl font-semibold text-sm transition-all duration-300 animate-artist-cta"
                    onClick={() => window.scrollTo(0, 0)}
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>{t('nav.areYouArtist')}</span>
                  </Link>
                )}
                <Link
                  to="/login"
                  aria-label={t('nav.signIn')}
                  className="flex-shrink-0 px-3 py-2 sm:px-6 sm:py-3 bg-gradient-to-r from-yellow-500 via-orange-500 to-yellow-500 hover:from-yellow-600 hover:via-orange-600 hover:to-yellow-600 text-white rounded-xl font-bold transition-all duration-300 shadow-xl shadow-yellow-500/40 hover:shadow-2xl hover:shadow-yellow-500/50 hover:scale-105 flex items-center justify-center sm:justify-start space-x-2 border border-yellow-400/30 relative overflow-hidden group min-w-0"
                  onClick={() => window.scrollTo(0, 0)}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                  <User className="w-5 h-5 flex-shrink-0 relative z-10" />
                  <span className="relative z-10 hidden sm:inline">{t('nav.signIn')}</span>
                </Link>
              </div>
            )}

            {/* Mobile Menu Button — first on mobile (between logo and search); xl:hidden so only when burger is visible) */}
            <button
              ref={mobileMenuButtonRef}
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              className="xl:hidden order-first w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white transition-all duration-300 flex items-center justify-center group flex-shrink-0"
            >
              {showMobileMenu ? <X size={18} className="group-hover:scale-110 transition-transform" /> : <Menu size={18} className="group-hover:scale-110 transition-transform" />}
            </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Navigation (xl so it matches hamburger visibility) */}
      {showMobileMenu && (
        <div
          ref={mobileMenuPanelRef}
          className="xl:hidden mt-4 py-4 border-t border-white/10 animate-in slide-in-from-top duration-300 px-4 bg-gradient-to-b from-gray-900/95 via-gray-900/90 to-gray-900/95 backdrop-blur-xl relative z-[60] max-h-[calc(100vh-5rem)] overflow-y-auto overflow-x-hidden overscroll-behavior-y-contain pb-8"
          style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
        >
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col space-y-4 pb-16">
              {/* Mobile Visitor Counter */}
              {visitorCounterVisible && (
                <div className="flex justify-center sm:hidden">
                  <VisitorCounter />
                </div>
              )}

              {/* Cart — in burger menu on mobile */}
              <Link
                to="/cart"
                onClick={() => { setShowMobileMenu(false); window.scrollTo(0, 0); }}
                className={`flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-300 font-semibold ${
                  location.pathname === '/cart'
                    ? 'bg-gradient-to-r from-purple-600/30 to-pink-600/30 text-white border border-purple-500/50 shadow-lg'
                    : 'text-gray-300 hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                <div className="relative">
                  <ShoppingCart size={20} />
                  {cartCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-purple-600 text-white text-xs font-bold rounded-full h-4 w-4 flex items-center justify-center min-w-[1rem]">
                      {cartCount > 9 ? '9+' : cartCount}
                    </span>
                  )}
                </div>
                <span>{t('nav.cart')}</span>
              </Link>

              {/* Artist Application CTA — first in mobile menu for visibility */}
              {artistApplicationEnabled && (!userProfile || userProfile.user_type === 'fan') && (
                <Link
                  to="/artist-application"
                  onClick={() => { setShowMobileMenu(false); window.scrollTo(0, 0); }}
                  className={`flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-300 font-semibold bg-gradient-to-r from-purple-600/20 to-pink-600/20 text-purple-300 hover:text-white border border-purple-500/30 hover:border-purple-500/50 mb-2 ${!user ? 'animate-artist-cta' : ''}`}
                >
                  <Sparkles size={20} />
                  <span>{t('nav.areYouArtistApplyHere')}</span>
                </Link>
              )}

              {/* Mobile Nav Items */}
              {mobileNavItems.map(item => (
                item.to === '/categories' ? (
                  <div key={item.to} className="flex flex-col">
                    <Link
                      to={item.to}
                      onClick={() => {
                        setShowMobileMenu(false);
                        window.scrollTo(0, 0);
                      }}
                      className={`flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-300 font-semibold ${
                        location.pathname === item.to 
                          ? 'bg-gradient-to-r from-purple-600/30 to-pink-600/30 text-white border border-purple-500/50 shadow-lg' 
                          : 'text-gray-300 hover:text-white hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      {item.icon && <item.icon size={20} />}
                      <span>{t(`nav.${item.labelKey}`)}</span>
                    </Link>
                    <div className="ml-6 mt-2 flex flex-col space-y-2 bg-gray-800/95 backdrop-blur-sm rounded-xl p-3 border border-white/10 relative z-[70]">
                      {popularCategories.length > 0 ? (
                        <>
                          <Link
                            to="/categories"
                            onClick={() => {
                              setShowMobileMenu(false);
                              window.scrollTo(0, 0);
                            }}
                            className="px-3 py-2 rounded-lg hover:bg-gradient-to-r hover:from-purple-600/30 hover:to-pink-600/30 transition-all duration-300 font-bold text-purple-300 border border-purple-500/30"
                          >
                            {t('nav.viewAllCategories')}
                          </Link>
                          {popularCategories.map((category) => (
                            <Link
                              key={`${category.type}-${category.name}`}
                              to={`/categories?${category.type === 'region' ? 'genre' : 'genre'}=${encodeURIComponent(category.name)}`}
                              onClick={() => {
                                setShowMobileMenu(false);
                                window.scrollTo(0, 0);
                              }}
                              className={`px-3 py-2 rounded-lg hover:bg-white/5 transition-all duration-300 flex items-center justify-between ${
                                location.pathname === '/categories' ? 'text-gray-200' : 'text-gray-400'
                              }`}
                            >
                              <div className="flex items-center space-x-3">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                  category.type === 'type' && category.name === 'Music'
                                    ? 'bg-purple-500/20'
                                    : category.type === 'type' && category.name === 'Comedy'
                                    ? 'bg-pink-500/20'
                                    : 'bg-blue-500/20'
                                }`}>
                                  {category.type === 'type' ? (
                                    category.name === 'Music' ? (
                                      <Music size={14} className="text-purple-400" />
                                    ) : (
                                      <Mic size={14} className="text-pink-400" />
                                    )
                                  ) : (
                                    <Globe size={14} className="text-blue-400" />
                                  )}
                                </div>
                                <span className="font-semibold">{t(`common.${category.name.toLowerCase()}`)}</span>
                              </div>
                              {category.count > 0 && (
                                <span className="text-xs px-2 py-1 rounded-lg bg-purple-500/20 text-purple-300 font-bold">({category.count})</span>
                              )}
                            </Link>
                          ))}
                        </>
                      ) : (
                        <>
                          <Link
                            to="/categories?genre=Music"
                            onClick={() => {
                              setShowMobileMenu(false);
                              window.scrollTo(0, 0);
                            }}
                            className="px-3 py-2 rounded-lg hover:bg-white/5 transition-all duration-300 flex items-center space-x-3"
                          >
                            <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                              <Music size={14} className="text-purple-400" />
                            </div>
                            <span className="font-semibold">{t('common.music')}</span>
                          </Link>
                          <Link
                            to="/categories?genre=Comedy"
                            onClick={() => {
                              setShowMobileMenu(false);
                              window.scrollTo(0, 0);
                            }}
                            className="px-3 py-2 rounded-lg hover:bg-white/5 transition-all duration-300 flex items-center space-x-3"
                          >
                            <div className="w-8 h-8 rounded-lg bg-pink-500/20 flex items-center justify-center">
                              <Mic size={14} className="text-pink-400" />
                            </div>
                            <span className="font-semibold">{t('common.comedy')}</span>
                          </Link>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => {
                      setShowMobileMenu(false);
                      window.scrollTo(0, 0);
                    }}
                    className={`flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-300 font-semibold ${
                      location.pathname === item.to 
                        ? 'bg-gradient-to-r from-purple-600/30 to-pink-600/30 text-white border border-purple-500/50 shadow-lg' 
                        : 'text-gray-300 hover:text-white hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    {item.icon && <item.icon size={20} />}
                    <span>{t(`nav.${item.labelKey}`)}</span>
                  </Link>
                )
              ))}
            </div>
          </div>
        </div>
        )}
    </nav>
  );
};

export default Navbar;