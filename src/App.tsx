import React, { Suspense, useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import ConfigurationNotice from './components/ConfigurationNotice';
import Footer from './components/Footer';
import ErrorBoundary from './components/ErrorBoundary';
import PrivateRoute from './components/auth/PrivateRoute';
import StaffLayout from './components/StaffLayout';
import FloatingActions from './components/FloatingActions';
import CookieConsentBanner from './components/CookieConsentBanner';
import AuthGate from './components/AuthGate';
import { StreamingProvider } from './contexts/StreamingContext';
import { MobileMoneyPaymentProvider } from './contexts/MobileMoneyPaymentContext';
import { lazyWithRetry } from './utils/lazyWithRetry';

// ---------------------------------------------------------------------------
// Route-level code splitting: each page is loaded on demand so the initial
// bundle only contains the shell (Navbar, Footer, ErrorBoundary, Router).
// lazyWithRetry mitigates stale chunk URLs after deploy + flaky network.
// ---------------------------------------------------------------------------

// Public pages
const Home = lazyWithRetry(() => import('./pages/Home'));
const SignIn = lazyWithRetry(() => import('./pages/SignIn'));
const SignUp = lazyWithRetry(() => import('./pages/SignUp'));
const ResetPassword = lazyWithRetry(() => import('./pages/ResetPassword'));
const Categories = lazyWithRetry(() => import('./pages/Categories'));
const Help = lazyWithRetry(() => import('./pages/Help'));
const CookiePolicy = lazyWithRetry(() => import('./pages/CookiePolicy'));
const PrivacyPolicy = lazyWithRetry(() => import('./pages/PrivacyPolicy'));
const TermsOfService = lazyWithRetry(() => import('./pages/TermsOfService'));
const AboutUs = lazyWithRetry(() => import('./pages/AboutUs'));
const Cart = lazyWithRetry(() => import('./pages/Cart'));
const TicketConfirmation = lazyWithRetry(() => import('./pages/TicketConfirmation'));
const TipConfirmation = lazyWithRetry(() => import('./pages/TipConfirmation'));
const UpcomingConcertsPage = lazyWithRetry(() => import('./pages/UpcomingConcerts'));
const LiveEvents = lazyWithRetry(() => import('./pages/LiveEvents'));
const Replays = lazyWithRetry(() => import('./pages/Replays'));
const News = lazyWithRetry(() => import('./pages/News'));
const NewsArticle = lazyWithRetry(() => import('./pages/NewsArticle'));
const Bundles = lazyWithRetry(() => import('./pages/Bundles'));
const Search = lazyWithRetry(() => import('./pages/Search'));
const ArtistProfile = lazyWithRetry(() => import('./pages/ArtistProfile'));
const ArtistApplication = lazyWithRetry(() => import('./pages/ArtistApplication'));
const ArtistSignContract = lazyWithRetry(() => import('./pages/ArtistSignContract'));
const ArtistRegister = lazyWithRetry(() => import('./pages/ArtistRegister'));

// Heavy / authenticated pages (Agora, TipTap, admin tools)
const Watch = lazyWithRetry(() => import('./pages/Watch'));
const Stream = lazyWithRetry(() => import('./pages/Stream'));
const Dashboard = lazyWithRetry(() => import('./pages/Dashboard'));
const GoLive = lazyWithRetry(() => import('./pages/GoLive'));
const Schedule = lazyWithRetry(() => import('./pages/Schedule'));
const Profile = lazyWithRetry(() => import('./pages/Profile'));
const Monitoring = lazyWithRetry(() => import('./pages/Monitoring'));
const UserManagement = lazyWithRetry(() => import('./pages/UserManagement'));
const MyFavorites = lazyWithRetry(() => import('./pages/MyFavorites'));
const MyTickets = lazyWithRetry(() => import('./pages/MyTickets'));
const HelpManagement = lazyWithRetry(() => import('./pages/HelpManagement'));
const Advertisements = lazyWithRetry(() => import('./pages/Advertisements'));
const ArtistManagement = lazyWithRetry(() => import('./pages/ArtistManagement'));
const CameraTestPage = lazyWithRetry(() => import('./pages/CameraTest'));
const PhotoManagement = lazyWithRetry(() => import('./pages/PhotoManagement'));
const RecordingsManagement = lazyWithRetry(() => import('./pages/RecordingsManagement'));
const TicketsManagement = lazyWithRetry(() => import('./pages/TicketsManagement'));
const ArtistFollowers = lazyWithRetry(() => import('./pages/ArtistFollowers'));
const Analytics = lazyWithRetry(() => import('./pages/Analytics'));
const ArtistSurveyInsights = lazyWithRetry(() => import('./pages/ArtistSurveyInsights'));
const ContractInvites = lazyWithRetry(() => import('./pages/ContractInvites'));
const AdminNews = lazyWithRetry(() => import('./pages/AdminNews'));
const NewsArticleEditor = lazyWithRetry(() => import('./pages/NewsArticleEditor'));

// ---------------------------------------------------------------------------
// Shared loading fallback shown while a lazy chunk is being fetched.
// ---------------------------------------------------------------------------
const ROUTE_LOAD_STUCK_MS = 14_000;

/** Shown while lazy route chunks load; offers recovery when import() hangs (network / stale deploy). */
function RouteLoadingFallback() {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setStuck(true), ROUTE_LOAD_STUCK_MS);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-6">
      <div className="flex flex-col items-center space-y-4">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-500" />
        <p className="text-gray-500 text-sm">Loading…</p>
      </div>
      {stuck && (
        <div className="mt-8 max-w-md text-center space-y-3">
          <p className="text-amber-200/90 text-sm">
            This is taking longer than usual. The page script may be blocked, or a new deployment may have
            changed asset URLs — try reloading.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg bg-purple-600 hover:bg-purple-500 px-4 py-2 text-sm font-medium text-white"
          >
            Reload page
          </button>
        </div>
      )}
    </div>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function ConditionalFooter() {
  const location = useLocation();
  if (['/go-live'].includes(location.pathname)) return null;
  return <Footer />;
}

function LayoutWithRoutes() {
  const location = useLocation();
  const isStaffPage = location.pathname === '/contract-invites';

  return (
    <>
      {!isStaffPage && <Navbar />}
      <main className={isStaffPage ? 'flex-grow' : 'flex-grow pt-20'}>
        <div className="container mx-auto px-4 sm:px-6">
          <ConfigurationNotice />
        </div>
        {/* Per-route error boundary: a crash in one page won't bring down the shell */}
        <ErrorBoundary region="routes">
          <Suspense fallback={<RouteLoadingFallback />}>
            <Routes>
              {/* Public */}
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<SignIn />} />
              <Route path="/signup" element={<SignUp />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/categories" element={<Categories />} />
              <Route path="/help" element={<Help />} />
              <Route path="/cookies" element={<CookiePolicy />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<TermsOfService />} />
              <Route path="/about" element={<AboutUs />} />
              <Route path="/cart" element={<Cart />} />
              <Route path="/ticket-confirmation" element={<TicketConfirmation />} />
              <Route path="/tip-confirmation" element={<TipConfirmation />} />
              <Route path="/upcoming-concerts" element={<UpcomingConcertsPage />} />
              <Route path="/live-events" element={<LiveEvents />} />
              <Route path="/replays" element={<Replays />} />
              <Route path="/news" element={<News />} />
              <Route path="/news/:slug" element={<NewsArticle />} />
              <Route path="/bundles" element={<Bundles />} />
              <Route path="/watch/:id" element={<Watch />} />
              <Route path="/stream/:id" element={<Stream />} />
              <Route path="/artist" element={<Navigate to="/" replace />} />
              <Route path="/artist/:id" element={<ArtistProfile />} />
              <Route path="/camera-test" element={<CameraTestPage />} />
              <Route path="/artist-application" element={<ArtistApplication />} />
              <Route path="/artist-sign-contract" element={<ArtistSignContract />} />
              <Route path="/artist-register" element={<ArtistRegister />} />
              <Route path="/search" element={<Search />} />
              <Route
                path="/contract-invites"
                element={
                  <PrivateRoute roles={['super_admin', 'global_admin']}>
                    <StaffLayout title="Contract invites">
                      <ContractInvites />
                    </StaffLayout>
                  </PrivateRoute>
                }
              />

              {/* Authenticated */}
              <Route path="/favorites" element={<PrivateRoute><MyFavorites /></PrivateRoute>} />
              <Route path="/my-tickets" element={<PrivateRoute><MyTickets /></PrivateRoute>} />
              <Route path="/profile" element={<PrivateRoute><Profile /></PrivateRoute>} />

              {/* Artist / Admin */}
              <Route path="/dashboard" element={<PrivateRoute roles={['artist', 'global_admin', 'super_admin']}><Dashboard /></PrivateRoute>} />
              <Route path="/schedule" element={<PrivateRoute roles={['artist', 'global_admin', 'super_admin']}><Schedule /></PrivateRoute>} />
              <Route path="/go-live" element={<PrivateRoute roles={['artist', 'global_admin', 'super_admin']}><GoLive /></PrivateRoute>} />
              <Route path="/followers" element={<PrivateRoute roles={['artist', 'global_admin', 'super_admin']}><ArtistFollowers /></PrivateRoute>} />
              <Route path="/recordings" element={<PrivateRoute roles={['global_admin', 'super_admin', 'artist']}><RecordingsManagement /></PrivateRoute>} />

              {/* Admin only */}
              <Route path="/monitoring" element={<PrivateRoute roles={['global_admin', 'super_admin']}><Monitoring /></PrivateRoute>} />
              <Route path="/users" element={<PrivateRoute roles={['global_admin', 'super_admin']}><UserManagement /></PrivateRoute>} />
              <Route path="/advertisements" element={<PrivateRoute roles={['global_admin', 'super_admin']}><Advertisements /></PrivateRoute>} />
              <Route path="/artist-management" element={<PrivateRoute roles={['global_admin', 'super_admin']}><ArtistManagement /></PrivateRoute>} />
              <Route path="/help-management" element={<PrivateRoute roles={['global_admin', 'super_admin']}><HelpManagement /></PrivateRoute>} />
              <Route path="/photo-management" element={<PrivateRoute roles={['super_admin']}><PhotoManagement /></PrivateRoute>} />
              <Route path="/tickets" element={<PrivateRoute roles={['global_admin', 'super_admin']}><TicketsManagement /></PrivateRoute>} />
              <Route path="/analytics" element={<PrivateRoute roles={['global_admin', 'super_admin']}><Analytics /></PrivateRoute>} />
              <Route path="/artist-survey-insights" element={<PrivateRoute roles={['global_admin', 'super_admin']}><ArtistSurveyInsights /></PrivateRoute>} />

              {/* Admin news CMS */}
              <Route path="/admin/news" element={<PrivateRoute roles={['global_admin', 'super_admin']}><StaffLayout title="News CMS"><AdminNews /></StaffLayout></PrivateRoute>} />
              <Route path="/admin/news/new" element={<PrivateRoute roles={['global_admin', 'super_admin']}><StaffLayout title="New Article"><NewsArticleEditor /></StaffLayout></PrivateRoute>} />
              <Route path="/admin/news/edit/:id" element={<PrivateRoute roles={['global_admin', 'super_admin']}><StaffLayout title="Edit Article"><NewsArticleEditor /></StaffLayout></PrivateRoute>} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
      {!isStaffPage && <ConditionalFooter />}
      {!isStaffPage && <FloatingActions />}
    </>
  );
}

function AppContent() {
  // Auth bootstrap + splash run in main.tsx; no second gate here (avoids stuck
  // "Initializing…" if store.initialized lagged behind the shell in production).

  return (
    <Router>
      <MobileMoneyPaymentProvider>
        <ScrollToTop />
        <AuthGate />
        <div className="min-h-screen bg-gray-900 flex flex-col">
          <LayoutWithRoutes />
          <CookieConsentBanner />
        </div>
      </MobileMoneyPaymentProvider>
    </Router>
  );
}

function App() {
  return (
    <ErrorBoundary region="root">
      <StreamingProvider>
        <AppContent />
      </StreamingProvider>
    </ErrorBoundary>
  );
}

export default App;
