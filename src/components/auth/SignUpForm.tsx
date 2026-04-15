import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabaseClient';
import { Lock, Mail, User, UserCircle, Music, Mic, Search, Eye, EyeOff, X, Phone, Plus } from 'lucide-react';

/** Levenshtein distance for spelling suggestion */
function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) matrix[i][j] = matrix[i - 1][j - 1];
      else matrix[i][j] = 1 + Math.min(matrix[i - 1][j - 1], matrix[i][j - 1], matrix[i - 1][j]);
    }
  }
  return matrix[b.length][a.length];
}

function getClosestGenreSuggestion(query: string, genreNames: string[]): string | null {
  const q = query.trim().toLowerCase();
  if (q.length < 2 || genreNames.length === 0) return null;
  let best: string | null = null;
  let bestDist = Infinity;
  for (const name of genreNames) {
    const d = levenshtein(q, name.toLowerCase());
    if (d < bestDist && d <= Math.max(3, Math.ceil(name.length / 2))) {
      bestDist = d;
      best = name;
    }
  }
  return best;
}

function capitalizeGenreName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}
import { COUNTRIES, filterCountries } from '../../utils/countries';
import { getRegionForCountry } from '../../utils/countryToRegion';
import PhoneInput, { type PhoneValue } from '../PhoneInput';
import OTPVerification from '../OTPVerification';
import { formatFullPhone, parseFullPhone } from '../../utils/phoneCountryCodes';
import {
  isDuplicateEmailSignUpError,
  isDuplicateProfileIdError,
  isDuplicateUsernameConstraintError,
} from '../../utils/authSignUpErrors';

export interface ContractInvitePayload {
  registrationToken: string;
  email?: string;
}

interface SignUpFormProps {
  contractInvite?: ContractInvitePayload;
}

const SignUpForm: React.FC<SignUpFormProps> = ({ contractInvite }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('invite');
  const isContractMode = !!contractInvite?.registrationToken;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [genres, setGenres] = useState<any[]>([]);
  const [genreSearchQuery, setGenreSearchQuery] = useState('');
  const [addingGenre, setAddingGenre] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [artistLoginEnabled, setArtistLoginEnabled] = useState(true);
  const [inviteValid, setInviteValid] = useState(false);
  const [inviteApplication, setInviteApplication] = useState<any>(null);
  const [authMethod, setAuthMethod] = useState<'email' | 'phone'>('email');
  const [showOTP, setShowOTP] = useState(false);
  const [otpPhone, setOtpPhone] = useState<string>('');
  const countryInputRef = useRef<HTMLInputElement>(null);
  const countryDropdownRef = useRef<HTMLDivElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const submitInFlightRef = useRef(false);

  useEffect(() => {
    if (!error && !success) return;
    const id = requestAnimationFrame(() => {
      feedbackRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    return () => cancelAnimationFrame(id);
  }, [error, success]);
  const [formData, setFormData] = useState({
    email: contractInvite?.email || '',
    password: '',
    username: '',
    fullName: '',
    userType: (contractInvite?.registrationToken ? 'artist' : 'fan') as 'fan' | 'artist',
    artistType: 'music',
    selectedGenres: [] as string[],
    country: '',
    region: 'European',
    phone: { dialCode: '+33', localNumber: '' } as PhoneValue,
  });

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const { data } = await supabase
          .from('app_config')
          .select('value')
          .eq('key', 'artist_login_enabled')
          .single();
        
        if (data) {
          setArtistLoginEnabled(data.value === true || data.value === 'true');
        }
      } catch (err) {
        console.error('Error fetching config:', err);
        setArtistLoginEnabled(true);
      }
    };
    fetchConfig();
  }, []);

  // Validate invite token if present
  useEffect(() => {
    if (!inviteToken) return;
    const validateInvite = async () => {
      try {
        const { data: inviteRows, error: fetchErr } = await supabase.rpc(
          'get_artist_application_by_invite_token',
          { p_token: inviteToken }
        );
        const data = Array.isArray(inviteRows) ? inviteRows[0] : inviteRows;

        if (!fetchErr && data && data.status === 'qualified') {
          if (!data.contract_signed_at) {
            window.location.href = `/artist-sign-contract?invite=${inviteToken}`;
            return;
          }
          setInviteValid(true);
          setInviteApplication(data);

          const updates: Partial<typeof formData> = {
            userType: 'artist',
            email: data.email || '',
            fullName: `${data.first_name} ${data.last_name}`.trim() || '',
            username: data.stage_name || '',
          };

          if (data.country_of_residence) {
            updates.country = data.country_of_residence;
            updates.region = getRegionForCountry(data.country_of_residence) || 'European';
            setCountrySearch('');
          }

          if (data.phone) {
            const parsed = parseFullPhone(data.phone);
            if (parsed) {
              updates.phone = { dialCode: parsed.dialCode, localNumber: parsed.localNumber };
            }
          }

          setFormData(prev => ({ ...prev, ...updates }));
        } else {
          setInviteValid(false);
          setError(t('signUpForm.invalidInvite', 'This invite link is invalid or has already been used.'));
        }
      } catch {
        setInviteValid(false);
      }
    };
    validateInvite();
  }, [inviteToken]);

  // Filter countries - only show results after typing 2+ characters
  const filteredCountries = filterCountries(countrySearch);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        countryDropdownRef.current &&
        !countryDropdownRef.current.contains(event.target as Node) &&
        countryInputRef.current &&
        !countryInputRef.current.contains(event.target as Node)
      ) {
        setShowCountryDropdown(false);
      }
    };

    if (showCountryDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showCountryDropdown]);

  useEffect(() => {
    if (formData.userType === 'artist') {
      fetchGenres();
    }
  }, [formData.userType, formData.artistType]);

  const fetchGenres = async () => {
    try {
      const { data, error } = await supabase
        .from('genres')
        .select('*')
        .eq('category', formData.artistType)
        .order('name');

      if (error) throw error;
      setGenres(data || []);
    } catch (err) {
      console.error('Error fetching genres:', err);
    }
  };

  const addNewGenre = async (rawName: string) => {
    const name = capitalizeGenreName(rawName);
    if (!name) return;
    const exists = genres.some((g) => g.name.toLowerCase() === name.toLowerCase());
    if (exists) {
      if (!formData.selectedGenres.includes(name)) {
        setFormData({ ...formData, selectedGenres: [...formData.selectedGenres, name] });
      }
      setGenreSearchQuery('');
      return;
    }
    setAddingGenre(true);
    try {
      const { error } = await supabase.from('genres').insert({ name, category: formData.artistType });
      if (error) throw error;
      await fetchGenres();
      if (!formData.selectedGenres.includes(name)) {
        setFormData({ ...formData, selectedGenres: [...formData.selectedGenres, name] });
      }
      setGenreSearchQuery('');
    } catch (err) {
      console.error('Error adding genre:', err);
      setError(err instanceof Error ? err.message : t('signUpForm.couldNotAddGenre', 'Could not add genre. It may already exist.'));
    } finally {
      setAddingGenre(false);
    }
  };

  const checkUsernameAvailability = async (username: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('username')
      .eq('username', username)
      .maybeSingle();

    return data === null && !error;
  };

  const handlePhoneOTPSignup = async () => {
    if (submitInFlightRef.current) return;
    submitInFlightRef.current = true;
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (!formData.username || formData.username.trim().length === 0) {
        throw new Error(t('signUpForm.usernameRequired', 'Username is required'));
      }

      if (!formData.fullName || formData.fullName.trim().length === 0) {
        throw new Error(t('signUpForm.fullNameRequired', 'Full name is required'));
      }

      const fullPhone = formatFullPhone(formData.phone.dialCode, formData.phone.localNumber);
      if (!fullPhone || formData.phone.localNumber.trim().length < 6) {
        throw new Error(t('signUpForm.validPhoneNumber', 'Please enter a valid phone number'));
      }

      if (formData.userType === 'artist') {
        if (!formData.country || formData.country.trim().length === 0) {
          throw new Error(t('signUpForm.countryRequired', 'Country is required for artist accounts'));
        }
        if (!formData.artistType) {
          throw new Error(t('signUpForm.artistTypeRequired', 'Please select an artist type'));
        }
        const allowedRegions = ['African', 'European', 'American', 'Asian', 'Maghreb', 'Other'];
        if (!formData.region || !allowedRegions.includes(formData.region)) {
          throw new Error(t('signUpForm.regionRequired', 'Please select a valid region'));
        }
      }

      const isUsernameAvailable = await checkUsernameAvailability(formData.username);
      if (!isUsernameAvailable) {
        throw new Error(t('signUpForm.usernameTaken', 'This username is already taken. Please choose a different username.'));
      }

      // Send OTP to phone
      const { error: otpError } = await supabase.auth.signInWithOtp({
        phone: fullPhone,
      });

      if (otpError) {
        throw new Error(otpError.message || t('signUpForm.failedSendCode', 'Failed to send verification code. Please try again.'));
      }

      setOtpPhone(fullPhone);
      setShowOTP(true);
      setSuccess(t('signUpForm.codeSent', 'Verification code sent to your phone!'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('signUpForm.anErrorOccurred', 'An error occurred'));
    } finally {
      setLoading(false);
      submitInFlightRef.current = false;
    }
  };

  const handleOTPVerify = async (otp: string) => {
    setLoading(true);
    setError(null);

    try {
      const { data: authData, error: verifyError } = await supabase.auth.verifyOtp({
        phone: otpPhone,
        token: otp,
        type: 'sms',
      });

      if (verifyError) {
        throw new Error(verifyError.message || t('signUpForm.invalidVerificationCode', 'Invalid verification code. Please try again.'));
      }

      if (!authData.user) {
        throw new Error(t('signUpForm.verificationFailed', 'Verification failed. Please try again.'));
      }

      // Prepare profile data
      const profileData = {
        username: formData.username.trim(),
        full_name: formData.fullName.trim(),
        user_type: formData.userType,
        artist_type: formData.userType === 'artist' ? formData.artistType : null,
        genres: formData.userType === 'artist' ? formData.selectedGenres : null,
        country: formData.userType === 'artist' ? formData.country.trim() : null,
        region: formData.userType === 'artist' ? formData.region : null,
        phone: otpPhone,
      };

      if (profileData.region && !['African', 'European', 'American', 'Asian', 'Maghreb', 'Other'].includes(profileData.region)) {
        profileData.region = 'Other';
      }

      // Create profile
      const { error: profileError } = await supabase.from('profiles').insert({
        id: authData.user.id,
        username: profileData.username,
        full_name: profileData.full_name,
        user_type: profileData.user_type,
        artist_type: profileData.artist_type,
        genres: profileData.genres,
        country: profileData.country,
        region: profileData.region,
        phone: profileData.phone,
      });

      if (profileError) {
        if (isDuplicateProfileIdError(profileError)) {
          // Profile already exists — continue to app
        } else if (isDuplicateUsernameConstraintError(profileError)) {
          throw new Error(t('signUpForm.usernameTaken', 'This username is already taken. Please choose a different username.'));
        } else {
          console.error('Profile creation error:', profileError);
          throw new Error(t('signUpForm.failedCreateProfile', 'Failed to create profile. Please try again.'));
        }
      }

      // Success - redirect
      if (formData.userType === 'artist') {
        navigate('/dashboard');
      } else {
        navigate('/');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('signUpForm.verificationFailed', 'Verification failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleOTPResend = async () => {
    setLoading(true);
    setError(null);
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        phone: otpPhone,
      });
      if (otpError) {
        setError(otpError.message || t('signUpForm.failedResend', 'Failed to resend code'));
      } else {
        setSuccess(t('signUpForm.codeResent', 'Verification code resent!'));
      }
    } catch (err) {
      setError(t('signUpForm.failedResend', 'Failed to resend code'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitInFlightRef.current) return;
    setError(null);
    setSuccess(null);

    // When in phone mode, submit triggers phone OTP flow (e.g. user pressed Enter in phone field)
    if (authMethod === 'phone') {
      void handlePhoneOTPSignup();
      return;
    }

    submitInFlightRef.current = true;
    setLoading(true);
    try {
      // Validate required fields
      if (!formData.username || formData.username.trim().length === 0) {
        throw new Error(t('signUpForm.usernameRequired', 'Username is required'));
      }

      if (!formData.fullName || formData.fullName.trim().length === 0) {
        throw new Error(t('signUpForm.fullNameRequired', 'Full name is required'));
      }

      if (authMethod === 'email') {
        if (!formData.email || formData.email.trim().length === 0) {
          throw new Error(t('signUpForm.emailFieldRequired', 'Email is required'));
        }

        if (!formData.password || formData.password.length < 6) {
          throw new Error(t('signUpForm.passwordMinLength', 'Password must be at least 6 characters'));
        }
      }

      // Validate artist-specific required fields
      if (formData.userType === 'artist') {
        if (!formData.country || formData.country.trim().length === 0) {
          throw new Error(t('signUpForm.countryRequired', 'Country is required for artist accounts'));
        }
        if (!formData.artistType) {
          throw new Error(t('signUpForm.artistTypeRequired', 'Please select an artist type'));
        }
        // Validate region is one of the allowed values
        const allowedRegions = ['African', 'European', 'American', 'Asian', 'Maghreb', 'Other'];
        if (!formData.region || !allowedRegions.includes(formData.region)) {
          throw new Error(t('signUpForm.regionRequired', 'Please select a valid region'));
        }
      }

      // First check if username is available
      const isUsernameAvailable = await checkUsernameAvailability(formData.username);
      if (!isUsernameAvailable) {
        throw new Error(t('signUpForm.usernameTaken', 'This username is already taken. Please choose a different username.'));
      }

      const fullPhone =
        formData.phone.localNumber.trim() !== ''
          ? formatFullPhone(formData.phone.dialCode, formData.phone.localNumber) || null
          : null;

      // Prepare profile data to store in metadata
      const profileData = {
        username: formData.username.trim(),
        full_name: formData.fullName.trim(),
        user_type: formData.userType,
        artist_type: formData.userType === 'artist' ? formData.artistType : null,
        genres: formData.userType === 'artist' ? formData.selectedGenres : null,
        country: formData.userType === 'artist' ? formData.country.trim() : null,
        region: formData.userType === 'artist' ? formData.region : null,
        phone: fullPhone,
      };
      
      // Ensure region is valid
      if (profileData.region && !['African', 'European', 'American', 'Asian', 'Maghreb', 'Other'].includes(profileData.region)) {
        profileData.region = 'Other';
      }

      // Get site URL for email confirmation redirect
      const siteUrl = import.meta.env.VITE_SITE_URL || window.location.origin;
      const redirectTo = `${siteUrl}/login?confirmed=true`;

      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: formData.email.trim(),
        password: formData.password,
        options: {
          data: {
            pending_profile: profileData
          },
          emailRedirectTo: redirectTo
        }
      });

      if (signUpError && authData?.user) {
        console.warn('signUp reported an error but user was returned; continuing:', signUpError.message);
      } else if (signUpError && !authData?.user) {
        if (isDuplicateEmailSignUpError(signUpError)) {
          setError(t('signUpForm.emailAlreadyRegistered'));
          return;
        }
        setError(signUpError.message || t('signUpForm.errorDuringSignUp'));
        return;
      }

      if (authData?.user) {
        // Profile data is already stored in metadata during signup
        // Prepare profile data for immediate insertion (if session is available)
        const profileDataForInsert = {
          id: authData.user.id,
          username: profileData.username,
          full_name: profileData.full_name,
          user_type: profileData.user_type,
          artist_type: profileData.artist_type,
          genres: profileData.genres,
          country: profileData.country,
          region: profileData.region,
          phone: profileData.phone,
        };

        // Check if we have a session (email confirmation might be required)
        let session = authData.session;
        if (!session) {
          // Wait a moment for session to be established
          await new Promise(resolve => setTimeout(resolve, 500));
          const { data: { session: newSession } } = await supabase.auth.getSession();
          session = newSession;
        }

        // If no session, email confirmation is required
        if (!session) {
          // Show success message instead of error
          // The profile will be created automatically when email is confirmed
          setSuccess(t('signUpForm.accountCreatedCheckEmail'));
          // Reset form after showing success message
          setFormData({
            email: '',
            password: '',
            username: '',
            fullName: '',
            userType: 'fan',
            artistType: 'music',
            selectedGenres: [],
            country: '',
            region: 'European',
            phone: { dialCode: '+33', localNumber: '' },
          });
          // Don't throw an error - this is expected behavior
          return;
        }

        // If we have a session, try to create the profile immediately
        const { error: profileError } = await supabase
          .from('profiles')
          .insert(profileDataForInsert);

        if (profileError) {
          const msg = profileError.message || '';
          if (msg.includes('row-level security') || msg.includes('RLS')) {
            setSuccess(t('signUpForm.accountCreatedCheckEmail'));
            setFormData({
              email: '',
              password: '',
              username: '',
              fullName: '',
              userType: 'fan',
              artistType: 'music',
              selectedGenres: [],
              country: '',
              region: 'European',
              phone: { dialCode: '+33', localNumber: '' },
            });
            return;
          }

          if (isDuplicateProfileIdError(profileError)) {
            setFormData({
              email: '',
              password: '',
              username: '',
              fullName: '',
              userType: 'fan',
              artistType: 'music',
              selectedGenres: [],
              country: '',
              region: 'European',
              phone: { dialCode: '+33', localNumber: '' },
            });
            if (formData.userType === 'artist') {
              navigate('/dashboard');
            } else {
              navigate('/');
            }
            return;
          }

          if (isDuplicateUsernameConstraintError(profileError)) {
            console.error('Profile creation error:', profileError);
            await supabase.auth.signOut();
            setError(t('signUpForm.usernameTaken', 'This username is already taken. Please choose a different username.'));
            return;
          }

          console.error('Profile creation error:', profileError);
          await supabase.auth.signOut();

          let errorMessage = t('signUpForm.errorCreatingProfile');
          if (msg.includes('null') || msg.includes('required')) {
            errorMessage += t('signUpForm.fillRequiredFields');
          } else {
            errorMessage += msg || t('signUpForm.tryAgainOrSupport');
          }

          setError(errorMessage);
          return;
        }

        // If this signup came from an invite, mark application as registered and send welcome email
        if (inviteValid && inviteToken && inviteApplication) {
          try {
            await supabase
              .from('artist_applications')
              .update({ status: 'registered', processed_at: new Date().toISOString() })
              .eq('id', inviteApplication.id);
            // Fire-and-forget welcome email
            supabase.functions.invoke('send-artist-welcome', {
              body: { email: formData.email, stageName: inviteApplication.stage_name || formData.username, locale: (i18n.language || 'en').slice(0, 2) },
            }).catch(() => {});
          } catch { /* non-blocking */ }
        }

        // If this signup came from a contract invite, mark the contract invite as used
        if (contractInvite?.registrationToken) {
          try {
            const { data: { session: s } } = await supabase.auth.getSession();
            if (s?.access_token) {
              await fetch(
                `${import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/$/, '')}/functions/v1/mark-contract-invite-used`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${s.access_token}`,
                  },
                  body: JSON.stringify({ registration_token: contractInvite.registrationToken }),
                }
              );
            }
            supabase.functions.invoke('send-artist-welcome', {
              body: { email: formData.email, stageName: formData.username, locale: (i18n.language || 'en').slice(0, 2) },
            }).catch(() => {});
          } catch { /* non-blocking */ }
        }

        // Profile created successfully, reset form and redirect based on user type
        setFormData({
          email: '',
          password: '',
          username: '',
          fullName: '',
          userType: 'fan',
          artistType: 'music',
          selectedGenres: [],
          country: '',
          region: 'European',
          phone: { dialCode: '+33', localNumber: '' },
        });
        
        if (formData.userType === 'artist') {
          navigate('/dashboard');
        } else {
          navigate('/');
        }
      } else {
        setError(t('signUpForm.errorDuringSignUp'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('signUpForm.errorDuringSignUp'));
    } finally {
      setLoading(false);
      submitInFlightRef.current = false;
    }
  };

  const handleGoogleSignUp = async () => {
    setLoading(true);
    setError(null);
    try {
      const redirectTo = `${window.location.origin}${location.pathname}${location.search || ''}`;
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      });
      if (oauthError) throw oauthError;
    } catch (err) {
      setError(err instanceof Error ? err.message : t('signUpForm.tryAgainOrSupport'));
    } finally {
      setLoading(false);
    }
  };

  if (showOTP) {
    return (
      <OTPVerification
        phone={otpPhone}
        onVerify={handleOTPVerify}
        onResend={handleOTPResend}
        onCancel={() => {
          setShowOTP(false);
          setOtpPhone('');
          setError(null);
        }}
        loading={loading}
        error={error}
      />
    );
  }

  return (
    <div className="bg-gray-900 p-8 rounded-lg shadow-xl max-w-md w-full">
      <h2 className="text-2xl font-bold mb-6 text-white">{t('signUpForm.title')}</h2>

      <div ref={feedbackRef} className="space-y-4 mb-4 scroll-mt-24">
        {success && (
          <div className="bg-green-500 bg-opacity-10 border border-green-500 text-green-500 px-4 py-3 rounded-lg sticky top-4 z-10 shadow-lg">
            <div className="flex items-start gap-2">
              <div className="flex-shrink-0 mt-0.5">✓</div>
              <div className="flex-1">{success}</div>
            </div>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="bg-red-500 bg-opacity-10 border border-red-500 text-red-400 px-4 py-3 rounded-lg"
          >
            {error}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="mb-4">
          <button
            type="button"
            onClick={handleGoogleSignUp}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-white hover:bg-gray-100 text-gray-800 font-medium rounded-lg border border-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {t('signUpForm.signUpWithGoogle')}
          </button>
        </div>
        <div>
          <label className="block text-gray-300 mb-2">{t('signUpForm.signUpWith')}</label>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <button
              type="button"
              onClick={() => setAuthMethod('email')}
              className={`p-3 rounded-lg flex flex-col items-center justify-center transition-colors ${
                authMethod === 'email'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              <Mail className="h-5 w-5 mb-1" />
              <span className="text-sm">{t('signUpForm.email')}</span>
            </button>
            <button
              type="button"
              onClick={() => setAuthMethod('phone')}
              className={`p-3 rounded-lg flex flex-col items-center justify-center transition-colors ${
                authMethod === 'phone'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              <Phone className="h-5 w-5 mb-1" />
              <span className="text-sm">{t('signUpForm.phone')}</span>
            </button>
          </div>
        </div>

        <div>
          <label className="block text-gray-300 mb-2">{t('signUpForm.accountType')}</label>
          {(inviteValid && inviteToken) || isContractMode ? (
            <div className="p-4 bg-purple-600/20 border border-purple-500/40 rounded-lg text-center">
              <UserCircle className="h-8 w-8 mx-auto mb-2 text-purple-400" />
              <p className="text-purple-300 font-semibold">{t('signUpForm.artistAccount')}</p>
              <p className="text-gray-400 text-xs mt-1">
                {isContractMode ? t('signUpForm.artistViaContract') : t('signUpForm.artistViaInvite')}
              </p>
            </div>
          ) : (
            <div className={`grid gap-2 ${artistLoginEnabled ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, userType: 'fan' })}
                className={`p-3 rounded-lg flex flex-col items-center justify-center transition-colors ${
                  formData.userType === 'fan'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                <User className="h-6 w-6 mb-1" />
                <span className="text-sm">{t('signUpForm.fan')}</span>
              </button>
              {artistLoginEnabled && (
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, userType: 'artist' })}
                  className={`p-3 rounded-lg flex flex-col items-center justify-center transition-colors ${
                    formData.userType === 'artist'
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  <UserCircle className="h-6 w-6 mb-1" />
                  <span className="text-sm">{t('signUpForm.artist')}</span>
                </button>
              )}
            </div>
          )}
        </div>

        {formData.userType === 'artist' && (
          <>
            <div>
<label className="block text-gray-300 mb-2">{t('signUpForm.artistType')}</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setFormData({ ...formData, artistType: 'music', selectedGenres: [] })}
              className={`p-3 rounded-lg flex flex-col items-center justify-center transition-colors ${
                formData.artistType === 'music'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              <Music className="h-6 w-6 mb-1" />
              <span className="text-sm">{t('signUpForm.music')}</span>
            </button>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, artistType: 'comedy', selectedGenres: [] })}
              className={`p-3 rounded-lg flex flex-col items-center justify-center transition-colors ${
                formData.artistType === 'comedy'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              <Mic className="h-6 w-6 mb-1" />
              <span className="text-sm">{t('signUpForm.comedy')}</span>
            </button>
          </div>
            </div>

            <div>
<label className="block text-gray-300 mb-2">{t('signUpForm.genres')}</label>
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              value={genreSearchQuery}
              onChange={(e) => setGenreSearchQuery(e.target.value)}
              placeholder={t('signUpForm.searchOrAddGenre')}
                  className="w-full pl-9 pr-4 py-2 bg-gray-800 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                />
              </div>
              {genreSearchQuery.trim().length >= 2 && (() => {
                const q = genreSearchQuery.trim().toLowerCase();
                const filtered = genres.filter((g) => g.name.toLowerCase().includes(q));
                const exactMatch = genres.find((g) => g.name.toLowerCase() === q);
                const suggestion = getClosestGenreSuggestion(genreSearchQuery.trim(), genres.map((g) => g.name));
                const canAddNew = !exactMatch && !genres.some((g) => g.name.toLowerCase() === capitalizeGenreName(genreSearchQuery).toLowerCase());
                return (
                  <div className="space-y-2 mb-2">
                    {filtered.length > 0 ? (
                      <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                        {filtered.map((genre) => {
                          const isSelected = formData.selectedGenres.includes(genre.name);
                          return (
                            <button
                              key={genre.id}
                              type="button"
                              onClick={() => {
                                setFormData({
                                  ...formData,
                                  selectedGenres: isSelected
                                    ? formData.selectedGenres.filter((g) => g !== genre.name)
                                    : [...formData.selectedGenres, genre.name]
                                });
                              }}
                              className={`p-2 rounded-lg text-sm transition-colors text-left ${
                                isSelected ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                              }`}
                            >
                              {genre.name}
                            </button>
                          );
                        })}
                      </div>
                    ) : suggestion ? (
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="text-gray-400">{t('signUpForm.didYouMean')}</span>
                        <button
                          type="button"
                          onClick={() => {
                            if (!formData.selectedGenres.includes(suggestion)) {
                              setFormData({ ...formData, selectedGenres: [...formData.selectedGenres, suggestion] });
                            }
                            setGenreSearchQuery('');
                          }}
                          className="px-3 py-1.5 rounded-lg bg-purple-600/80 hover:bg-purple-600 text-white font-medium"
                        >
                          {suggestion}
                        </button>
                        {canAddNew && (
                          <span className="text-gray-500">{t('signUpForm.orAddNewBelow')}</span>
                        )}
                      </div>
                    ) : null}
                    {canAddNew && (
                      <button
                        type="button"
                        onClick={() => addNewGenre(genreSearchQuery)}
                        disabled={addingGenre || !genreSearchQuery.trim()}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 border border-white/20 text-gray-300 hover:text-white text-sm transition-colors disabled:opacity-50"
                      >
                        <Plus className="w-4 h-4" />
                        {addingGenre ? t('signUpForm.adding') : t('signUpForm.addAsNewGenre', { name: capitalizeGenreName(genreSearchQuery) })}
                      </button>
                    )}
                  </div>
                );
              })()}
              <div className="flex flex-wrap gap-2">
                {formData.selectedGenres.map((name) => (
                  <span
                    key={name}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-600/80 text-white text-sm"
                  >
                    {name}
                    <button
                      type="button"
                      onClick={() =>
                        setFormData({ ...formData, selectedGenres: formData.selectedGenres.filter((g) => g !== name) })
                      }
                      className="hover:bg-white/20 rounded p-0.5"
                      aria-label={t('signUpForm.removeGenre', { name })}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              {formData.selectedGenres.length === 0 && !genreSearchQuery && (
                <p className="text-gray-500 text-xs mt-1">{t('signUpForm.genreHint')}</p>
              )}
            </div>

            <div>
              <label className="block text-gray-300 mb-2">
                {t('signUpForm.country')} {formData.userType === 'artist' && <span className="text-red-400">*</span>}
              </label>
              <div className="relative">
                <div className="relative">
                  <input
                    ref={countryInputRef}
                    type="text"
                    value={formData.country}
                    onChange={(e) => {
                      const value = e.target.value;
                      setFormData({ ...formData, country: value });
                      setCountrySearch(value);
                      // Show dropdown only if user has typed 2+ characters
                      if (value.length >= 2) {
                        setShowCountryDropdown(true);
                      } else {
                        setShowCountryDropdown(false);
                      }
                    }}
                    onFocus={() => {
                      // Show dropdown if there's a search query with 2+ characters
                      if (countrySearch.length >= 2 && filteredCountries.length > 0) {
                        setShowCountryDropdown(true);
                      }
                    }}
                    className="w-full pl-4 pr-10 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-purple-500 placeholder-gray-500"
                    placeholder={t('signUpForm.countryPlaceholder')}
                    required={formData.userType === 'artist'}
                    autoComplete="off"
                  />
                  {formData.country && (
                    <button
                      type="button"
                      onClick={() => {
                        setFormData({ ...formData, country: '' });
                        setCountrySearch('');
                        setShowCountryDropdown(false);
                        countryInputRef.current?.focus();
                      }}
                      className="absolute right-10 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                      aria-label={t('signUpForm.clearCountry')}
                    >
                      <X size={18} />
                    </button>
                  )}
                  <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                </div>
                
                {showCountryDropdown && filteredCountries.length > 0 && (
                  <div
                    ref={countryDropdownRef}
                    className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl max-h-64 overflow-y-auto"
                  >
                    <div className="p-1">
                      {filteredCountries.map((country) => {
                        // Highlight matching text
                        const index = country.toLowerCase().indexOf(countrySearch.toLowerCase());
                        const beforeMatch = country.substring(0, index);
                        const match = country.substring(index, index + countrySearch.length);
                        const afterMatch = country.substring(index + countrySearch.length);
                        
                        return (
                          <button
                            key={country}
                            type="button"
                            className="w-full px-4 py-2.5 text-left text-white hover:bg-purple-600 transition-colors rounded"
                            onClick={() => {
                              // Always auto-detect region based on selected country using the mapping utility
                              const newRegion = getRegionForCountry(country);
                              
                              setFormData({ ...formData, country, region: newRegion });
                              setShowCountryDropdown(false);
                              setCountrySearch('');
                            }}
                          >
                            {index >= 0 ? (
                              <>
                                {beforeMatch}
                                <span className="font-semibold bg-purple-500/30">{match}</span>
                                {afterMatch}
                              </>
                            ) : (
                              country
                            )}
                          </button>
                        );
                      })}
                      {filteredCountries.length === 20 && (
                        <div className="px-4 py-2 text-xs text-gray-400 text-center">
                          {t('signUpForm.showingFirst20')}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                {showCountryDropdown && countrySearch.length >= 2 && filteredCountries.length === 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl p-4">
                    <div className="text-gray-400 text-sm text-center">
                      {t('signUpForm.noCountriesFound', { search: countrySearch })}
                    </div>
                  </div>
                )}
              </div>
              {countrySearch.length === 1 && (
                <p className="mt-1 text-xs text-gray-500">{t('signUpForm.type2LettersCountry')}</p>
              )}
            </div>

            <div>
              <label className="block text-gray-300 mb-2">{t('signUpForm.region')}</label>
              <select
                value={formData.region}
                onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-purple-500"
                required={formData.userType === 'artist'}
              >
                <option value="">{t('signUpForm.selectRegion')}</option>
                <option value="African">{t('signUpForm.regionAfrican')}</option>
                <option value="European">{t('signUpForm.regionEuropean')}</option>
                <option value="American">{t('signUpForm.regionAmerican')}</option>
                <option value="Asian">{t('signUpForm.regionAsian')}</option>
                <option value="Maghreb">{t('signUpForm.regionMaghreb')}</option>
                <option value="Other">{t('signUpForm.regionOther')}</option>
              </select>
            </div>
          </>
        )}

        <div>
          <label className="block text-gray-300 mb-2">{t('signUpForm.username')}</label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-purple-500"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-gray-300 mb-2">{t('signUpForm.fullName')}</label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-purple-500"
              required
            />
          </div>
        </div>

        {authMethod === 'phone' ? (
          <div>
            <label className="block text-gray-300 mb-2">{t('signUpForm.phoneNumberRequired')} <span className="text-red-400">*</span></label>
            <PhoneInput
              value={formData.phone}
              onChange={(val) => setFormData({ ...formData, phone: val })}
              placeholder={t('signUpForm.phonePlaceholder')}
              required
              className="mb-0"
            />
          </div>
        ) : (
          <>
            <div>
              <label className="block text-gray-300 mb-2">{t('signUpForm.phoneOptional')}</label>
              <PhoneInput
                value={formData.phone}
                onChange={(val) => setFormData({ ...formData, phone: val })}
                placeholder={t('signUpForm.phonePlaceholder')}
                className="mb-0"
              />
            </div>

            <div>
              <label className="block text-gray-300 mb-2">{t('signUpForm.emailRequired')} <span className="text-red-400">*</span></label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-purple-500"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-gray-300 mb-2">{t('signUpForm.passwordLabel', 'Password')} <span className="text-red-400">*</span></label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full pl-10 pr-12 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-purple-500"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-300"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>
          </>
        )}

        <button
          type={authMethod === 'phone' ? 'button' : 'submit'}
          onClick={authMethod === 'phone' ? handlePhoneOTPSignup : undefined}
          disabled={loading}
          className={`w-full bg-purple-600 text-white py-2 rounded-lg font-semibold
            ${loading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-purple-700'}`}
        >
          {loading
            ? authMethod === 'phone'
              ? t('signUpForm.sendingCode')
              : t('signUpForm.creatingAccount')
            : authMethod === 'phone'
            ? t('signUpForm.sendVerificationCode')
            : t('signUpForm.createAccount')}
        </button>
      </form>

      <p className="mt-4 text-gray-400 text-center">
        {t('signUpForm.alreadyHaveAccount')}{' '}
        <a href="/login" className="text-purple-400 hover:text-purple-300">
          {t('signUpForm.signIn')}
        </a>
      </p>
    </div>
  );
};

export default SignUpForm;