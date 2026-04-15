import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabaseClient';
import { useStore } from '../store/useStore';
import { Calendar, Clock, Users, Image, Euro, Info, Pencil, Trash2, Upload, X, Search, Link as LinkIcon, Lock, Filter } from 'lucide-react';
import { formatDate } from '../utils/formatters';
import { isSuperAdmin } from '../utils/constants';
import { getImageDimensions } from '../utils/imageOrientation';
import SmartImage from '../components/SmartImage';
import { v4 as uuidv4 } from 'uuid';
import heic2any from 'heic2any';

const isHeicFile = (file: File): boolean =>
  file.type === 'image/heic' || file.type === 'image/heif' || /\.(heic|heif)$/i.test(file.name);

/** Log full API/DB errors for debugging; never show these strings to users. */
function logSchedulePageError(context: string, err: unknown): void {
  if (typeof err === 'string') {
    console.error(`[Schedule] ${context}`, err);
    return;
  }
  const o = err as Record<string, unknown> | null | undefined;
  console.error(`[Schedule] ${context}`, {
    message: o?.message,
    details: o?.details,
    hint: o?.hint,
    code: o?.code,
    name: err instanceof Error ? err.name : undefined,
    stack: err instanceof Error ? err.stack : undefined,
  });
}

const Schedule: React.FC = () => {
  const { t } = useTranslation();
  const { userProfile } = useStore();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingEvent, setEditingEvent] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewObjectUrlRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [artists, setArtists] = useState<any[]>([]);
  const [selectedArtist, setSelectedArtist] = useState<any>(null);
  const [showArtistDropdown, setShowArtistDropdown] = useState(false);
  const [artistSearch, setArtistSearch] = useState('');
  const [isUnregisteredArtist, setIsUnregisteredArtist] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [streamLink, setStreamLink] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [failedImageUrls, setFailedImageUrls] = useState<Set<string>>(new Set());
  const [defaultPrice, setDefaultPrice] = useState(1.99);
  const [defaultDuration, setDefaultDuration] = useState(60);
  const [scheduleFilterArtist, setScheduleFilterArtist] = useState<string>('');
  const [scheduleFilterStatus, setScheduleFilterStatus] = useState<string>('all');
  const [deletionRequests, setDeletionRequests] = useState<{ id: string; event_id: string; requested_by: string; status: string; events?: { id: string; title: string; artist_id: string } }[]>([]);
  const [requestingDeletionId, setRequestingDeletionId] = useState<string | null>(null);
  const [resolvingRequestId, setResolvingRequestId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    startTime: '',
    startDate: '',
    startTimeOnly: '12:00',
    duration: 60,
    price: 1.99,
    imageUrl: '',
    artistName: '',
    artistEmail: '',
    artistType: 'music',
    imageFocalX: null as number | null,
    imageFocalY: null as number | null,
  });

  useEffect(() => {
    fetchEvents();
    fetchDefaultPrice();
    fetchDefaultDuration();
    const isAdmin = userProfile?.user_type === 'global_admin' || userProfile?.user_type === 'super_admin';
    if (isAdmin) {
      fetchArtists();
    }
    fetchDeletionRequests();
  }, [userProfile]);

  const fetchDeletionRequests = async () => {
    if (!userProfile) return;
    try {
      let q = supabase
        .from('event_deletion_requests')
        .select('id, event_id, requested_by, status')
        .eq('status', 'pending');
      const isAdmin = userProfile?.user_type === 'global_admin' || isSuperAdmin(userProfile?.id, userProfile?.user_type);
      if (!isAdmin) {
        q = q.eq('requested_by', userProfile.id);
      }
      const { data, error } = await q;
      if (error) return;
      const eventIds = [...new Set((data || []).map((r: any) => r.event_id))];
      if (eventIds.length === 0) {
        setDeletionRequests((data || []).map((r: any) => ({ ...r, events: null })));
        return;
      }
      const { data: evs } = await supabase.from('events').select('id, title, artist_id').in('id', eventIds);
      const eventMap = Object.fromEntries((evs || []).map((e: any) => [e.id, e]));
      setDeletionRequests((data || []).map((r: any) => ({ ...r, events: eventMap[r.event_id] })));
    } catch {
      setDeletionRequests([]);
    }
  };

  const fetchDefaultPrice = async () => {
    try {
      const { data, error: fetchErr } = await supabase
        .from('app_config')
        .select('value')
        .eq('key', 'default_event_price')
        .maybeSingle();
      if (!fetchErr && data) {
        const val = typeof data.value === 'number' ? data.value : parseFloat(data.value as string);
        if (!isNaN(val) && val >= 0) {
          setDefaultPrice(val);
          // Update form price for all users when not editing an existing event
          if (!editingEvent) {
            setFormData(prev => ({ ...prev, price: val }));
          }
        }
      }
    } catch {
      // keep default 1.99
    }
  };

  // Effect to ensure price is the global default for non-admin users
  useEffect(() => {
    if (userProfile?.user_type !== 'global_admin' && userProfile?.user_type !== 'super_admin') {
      setFormData(prev => ({ ...prev, price: defaultPrice }));
    }
  }, [userProfile, defaultPrice]);

  const fetchDefaultDuration = async () => {
    try {
      const { data, error: fetchErr } = await supabase
        .from('app_config')
        .select('value')
        .eq('key', 'default_event_duration')
        .maybeSingle();
      if (!fetchErr && data) {
        const val = typeof data.value === 'number' ? data.value : parseInt(data.value as string, 10);
        if (!isNaN(val) && val > 0) {
          setDefaultDuration(val);
          if (!editingEvent) {
            setFormData(prev => ({ ...prev, duration: val }));
          }
        }
      }
    } catch {
      // keep default 60
    }
  };

  // Effect to ensure duration is the global default for non-admin users
  useEffect(() => {
    if (userProfile?.user_type !== 'global_admin' && userProfile?.user_type !== 'super_admin') {
      setFormData(prev => ({ ...prev, duration: defaultDuration }));
    }
  }, [userProfile, defaultDuration]);

  // Generate time options in 15-minute intervals
  const generateTimeOptions = () => {
    const options = [];
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 15) {
        const timeString = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        const displayTime = `${String(hour % 12 || 12).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
        options.push({ value: timeString, label: displayTime });
      }
    }
    return options;
  };

  const timeOptions = generateTimeOptions();

  // Combine date and time into ISO string
  const combineDateTime = (date: string, time: string): string => {
    if (!date || !time) return '';
    const [hours, minutes] = time.split(':');
    const dateTime = new Date(date);
    dateTime.setHours(parseInt(hours, 10));
    dateTime.setMinutes(parseInt(minutes, 10));
    dateTime.setSeconds(0);
    dateTime.setMilliseconds(0);
    
    // Format as ISO string for datetime-local input
    const year = dateTime.getFullYear();
    const month = String(dateTime.getMonth() + 1).padStart(2, '0');
    const day = String(dateTime.getDate()).padStart(2, '0');
    const hoursStr = String(dateTime.getHours()).padStart(2, '0');
    const minutesStr = String(dateTime.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day}T${hoursStr}:${minutesStr}`;
  };

  // Update startTime when date or time changes
  useEffect(() => {
    if (formData.startDate && formData.startTimeOnly) {
      const combined = combineDateTime(formData.startDate, formData.startTimeOnly);
      setFormData(prev => ({ ...prev, startTime: combined }));
    }
  }, [formData.startDate, formData.startTimeOnly]);

  const fetchArtists = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_type', 'artist');

      if (error) throw error;
      setArtists(data || []);
    } catch (error) {
      console.error('Error fetching artists:', error);
    }
  };

  const filteredArtists = artistSearch
    ? artists.filter(artist => 
        artist.full_name.toLowerCase().includes(artistSearch.toLowerCase()) ||
        artist.username.toLowerCase().includes(artistSearch.toLowerCase())
      )
    : artists;

  const getEventStatus = (startTime: string, duration: number) => {
    const now = new Date();
    const eventStart = new Date(startTime);
    const eventEnd = new Date(eventStart.getTime() + duration * 60000);

    if (now < eventStart) return 'upcoming';
    if (now >= eventStart && now <= eventEnd) return 'live';
    return 'ended';
  };

  const fetchEvents = async () => {
    try {
      if (!userProfile) return;

      const query = supabase
        .from('events')
        .select('*')
        .order('start_time', { ascending: true });

      // Super admins and global admins see all scheduled events; artists see only their own
      const isAdmin = userProfile.user_type === 'global_admin' || isSuperAdmin(userProfile.id, userProfile.user_type);
      if (!isAdmin) {
        query.eq('artist_id', userProfile.id);
      }

      const { data, error } = await query;

      if (error) throw error;

      const updatedEvents = await Promise.all((data || []).map(async (event) => {
        const currentStatus = getEventStatus(event.start_time, event.duration);

        if (currentStatus === event.status) return event;

        // Only auto-mark ended when the scheduled window has passed. Do not auto-flip to
        // "live" from the clock — status becomes live when the broadcaster goes live
        // (studio / Agora), so viewer "live for" timers match the real stream start.
        if (currentStatus === 'ended' && event.status !== 'ended') {
          const { error: updateError } = await supabase
            .from('events')
            .update({ status: 'ended' })
            .eq('id', event.id);

          if (updateError) throw updateError;
          return { ...event, status: 'ended' as const };
        }

        return event;
      }));

      setEvents(updatedEvents);
      setFailedImageUrls(new Set());
    } catch (error) {
      console.error('Error fetching events:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedImage = file.type.startsWith('image/') || isHeicFile(file);
    if (!allowedImage) {
      setError(t('schedulePage.errorImageFile'));
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError(t('schedulePage.errorImageSize'));
      return;
    }

    if (previewObjectUrlRef.current) {
      URL.revokeObjectURL(previewObjectUrlRef.current);
      previewObjectUrlRef.current = null;
    }

    if (isHeicFile(file)) {
      try {
        const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
        const blob = Array.isArray(result) ? result[0] : result;
        const url = URL.createObjectURL(blob);
        previewObjectUrlRef.current = url;
        setPreviewUrl(url);
        setError(null);
      } catch (err) {
        console.error('HEIC conversion failed:', err);
        setError(t('schedulePage.errorHeicProcess'));
      }
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const uploadEventImage = async (file: File): Promise<string> => {
    let fileToUpload: File = file;
    if (isHeicFile(file)) {
      try {
        const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
        const blob = Array.isArray(result) ? result[0] : result;
        const baseName = file.name.replace(/\.(heic|heif)$/i, '');
        fileToUpload = new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
      } catch (err) {
        console.error('HEIC conversion failed:', err);
        throw new Error(t('schedulePage.errorHeicConvert'));
      }
    }

    const rawExt = fileToUpload.name.split('.').pop()?.toLowerCase()?.replace(/[^a-z0-9]/g, '') || 'jpg';
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${rawExt}`;
    const filePath = `events/${userProfile?.id}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('profiles')
      .upload(filePath, fileToUpload, {
        upsert: true,
        contentType: fileToUpload.type || 'image/jpeg',
      });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('profiles')
      .getPublicUrl(filePath);

    return publicUrl;
  };

  const validateForm = () => {
    const now = new Date();
    const eventDate = new Date(formData.startTime);
    
    if (eventDate <= now) {
      setError(t('schedulePage.errorStartTimeFuture'));
      return false;
    }

    const isAdmin = userProfile?.user_type === 'global_admin' || userProfile?.user_type === 'super_admin';
    if (isAdmin) {
      if (!selectedArtist && !isUnregisteredArtist) {
        setError(t('schedulePage.errorSelectArtist'));
        return false;
      }

      if (isUnregisteredArtist) {
        if (!formData.artistName.trim()) {
          setError(t('schedulePage.errorArtistNameRequired'));
          return false;
        }
        if (!formData.artistEmail.trim()) {
          setError(t('schedulePage.errorArtistEmailRequired'));
          return false;
        }
        if (!formData.artistEmail.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
          setError(t('schedulePage.errorValidEmail'));
          return false;
        }
      }

      if (formData.price < 0.01) {
        setError(t('schedulePage.errorMinPrice'));
        return false;
      }
    } else {
      if (formData.price !== defaultPrice) {
        setError(t('schedulePage.errorPriceFixed', { price: defaultPrice.toFixed(2) }));
        return false;
      }
    }

    const isAdminUser = userProfile?.user_type === 'global_admin' || isSuperAdmin(userProfile?.id, userProfile?.user_type);
    if (!editingEvent && !isAdminUser) {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      
      const eventsInLastYear = events.filter(event => {
        const eventDate = new Date(event.start_time);
        return eventDate >= oneYearAgo && event.status !== 'ended';
      });

      if (eventsInLastYear.length >= 12) {
        setError(t('schedulePage.errorMaxEventsPerYear'));
        return false;
      }
    }
    
    if (!isAdminUser) {
      const maxDuration = userProfile?.artist_type === 'music' ? 45 : 30;
      if (formData.duration > maxDuration) {
        setError(t('schedulePage.errorMaxDuration', { type: userProfile?.artist_type || '', count: maxDuration }));
        return false;
      }
      if (formData.duration !== defaultDuration) {
        setError(t('schedulePage.errorDurationFixed', { count: defaultDuration }));
        return false;
      }
    }
    
    return true;
  };

  const generateStreamKey = () => {
    return uuidv4();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;
    
    setError(null);
    setWarning(null);
    setStreamLink(null);
    setSaveSuccess(false);
    if (!validateForm()) return;

    try {
      setLoading(true);
      
      let imageUrl = formData.imageUrl;
      let artistId = userProfile.id;
      let streamKey = null;

      let image_width: number | null = null;
      let image_height: number | null = null;
      let image_orientation: 'portrait' | 'landscape' | 'square' | null = null;

      if (fileInputRef.current?.files?.[0]) {
        imageUrl = await uploadEventImage(fileInputRef.current.files[0]);
        if (imageUrl) {
          try {
            const dims = await getImageDimensions(imageUrl);
            image_width = dims.width;
            image_height = dims.height;
            image_orientation = dims.orientation;
          } catch {
            // keep null
          }
        }
      }

      const isAdmin = userProfile.user_type === 'global_admin' || userProfile.user_type === 'super_admin';
      if (isAdmin) {
        if (isUnregisteredArtist) {
          streamKey = generateStreamKey();
          artistId = null;
        } else {
          artistId = selectedArtist.id;
        }
      }

      const finalPrice = isAdmin ? formData.price : defaultPrice;

      const eventData = {
        title: formData.title,
        description: formData.description,
        artist_id: artistId,
        start_time: formData.startTime,
        duration: formData.duration,
        price: finalPrice,
        image_url: imageUrl,
        status: 'upcoming',
        stream_key: streamKey,
        unregistered_artist_name: isUnregisteredArtist ? formData.artistName : null,
        unregistered_artist_email: isUnregisteredArtist ? formData.artistEmail : null,
        artist_type: isUnregisteredArtist ? formData.artistType : null,
        image_width: image_width ?? undefined,
        image_height: image_height ?? undefined,
        image_orientation: image_orientation ?? undefined,
        image_focal_x: formData.imageFocalX ?? undefined,
        image_focal_y: formData.imageFocalY ?? undefined,
      };

      if (editingEvent) {
        const { error } = await supabase
          .from('events')
          .update(eventData)
          .eq('id', editingEvent);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('events')
          .insert(eventData)
          .select()
          .single();

        if (error) throw error;

        if (streamKey) {
          const streamUrl = `${window.location.origin}/stream/${data.id}?key=${streamKey}`;
          setStreamLink(streamUrl);

          try {
            const { error: emailError } = await supabase.functions.invoke('send-event-email', {
              body: {
                email: formData.artistEmail,
                eventTitle: formData.title,
                streamUrl,
                startTime: formData.startTime,
                duration: formData.duration
              }
            });

            if (emailError) {
              logSchedulePageError('send-event-email', emailError);
              setWarning(t('schedulePage.errorEmailNotification'));
            }
          } catch (emailError: unknown) {
            logSchedulePageError('send-event-email invoke', emailError);
            setWarning(t('schedulePage.errorEmailNotification'));
          }
        }

        // Send phone notifications for event scheduled (only if artistId exists)
        console.log('📱 Checking if phone notifications should be sent...', { artistId, isUnregisteredArtist });
        
        if (artistId) {
          try {
            // Get artist name
            let artistName = 'Artist';
            if (isAdmin && selectedArtist) {
              artistName = selectedArtist.full_name || selectedArtist.username || 'Artist';
            } else if (userProfile) {
              artistName = userProfile.full_name || userProfile.username || 'Artist';
            }

            console.log('📱 About to call send-phone-notifications with:', {
              eventId: data.id,
              eventTitle: formData.title,
              artistId: artistId,
              artistName: artistName,
              notificationType: 'event_scheduled'
            });

            const { data: phoneData, error: phoneError } = await supabase.functions.invoke('send-phone-notifications', {
              body: {
                eventId: data.id,
                eventTitle: formData.title,
                artistId: artistId,
                artistName: artistName,
                notificationType: 'event_scheduled'
              }
            });

            console.log('📱 Phone notification response:', { phoneData, phoneError });

            if (phoneError) {
              console.error('❌ Error sending phone notifications:', phoneError);
              // Don't show error to user, just log it
            } else {
              console.log('✅ Phone notifications triggered for event scheduled:', phoneData);
            }
          } catch (phoneError) {
            console.error('❌ Error invoking phone notification function:', phoneError);
            // Don't show error to user, just log it
          }
        } else {
          console.log('📱 ⚠️ Skipping phone notifications - artistId is null/undefined');
        }
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);

      setFormData({
        title: '',
        description: '',
        startTime: '',
        startDate: '',
        startTimeOnly: '12:00',
        duration: defaultDuration,
        price: defaultPrice,
        imageUrl: '',
        artistName: '',
        artistEmail: '',
        artistType: 'music',
        imageFocalX: null,
        imageFocalY: null,
      });
      setPreviewUrl(null);
      setSelectedArtist(null);
      setIsUnregisteredArtist(false);

      await fetchEvents();
    } catch (err: unknown) {
      logSchedulePageError('save event', err);
      setError(t('schedulePage.errorSaveEvent'));
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (event: any) => {
    setEditingEvent(event.id);
    const eventDate = new Date(event.start_time);
    const dateStr = eventDate.toISOString().split('T')[0];
    const hours = String(eventDate.getHours()).padStart(2, '0');
    // Round minutes to nearest 15-minute interval
    const minutes = String(Math.round(eventDate.getMinutes() / 15) * 15).padStart(2, '0');
    const timeStr = `${hours}:${minutes}`;
    
    // Set date and time separately - useEffect will combine them into startTime
    setFormData({
      title: event.title,
      description: event.description,
      startTime: '',
      startDate: dateStr,
      startTimeOnly: timeStr,
      duration: event.duration,
      price: (userProfile?.user_type === 'global_admin' || userProfile?.user_type === 'super_admin') ? event.price : defaultPrice,
      imageUrl: event.image_url,
      artistName: event.unregistered_artist_name || '',
      artistEmail: event.unregistered_artist_email || '',
      artistType: event.artist_type || 'music',
      imageFocalX: event.image_focal_x ?? null,
      imageFocalY: event.image_focal_y ?? null,
    });
    setPreviewUrl(event.image_url);
    
    const isAdmin = userProfile?.user_type === 'global_admin' || userProfile?.user_type === 'super_admin';
    if (isAdmin) {
      if (event.artist_id) {
        const artist = artists.find(a => a.id === event.artist_id);
        setSelectedArtist(artist);
        setIsUnregisteredArtist(false);
      } else {
        setSelectedArtist(null);
        setIsUnregisteredArtist(true);
      }
    }
  };

  const handleDelete = async (eventId: string) => {
    if (!confirm(t('schedulePage.confirmDelete'))) return;

    try {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from('events')
        .delete()
        .eq('id', eventId)
        .select('id');

      if (error) {
        logSchedulePageError('delete event', error);
        throw error;
      }
      if (!data || data.length === 0) {
        logSchedulePageError('delete event (no rows returned)', { eventId });
        throw new Error('no rows deleted');
      }
      await fetchEvents();
      await fetchDeletionRequests();
    } catch (err: unknown) {
      logSchedulePageError('delete event', err);
      setError(t('schedulePage.errorDeleteEvent'));
    } finally {
      setLoading(false);
    }
  };

  const handleRequestDeletion = async (eventId: string) => {
    if (!userProfile) return;
    try {
      setRequestingDeletionId(eventId);
      setError(null);
      const { error: insertError } = await supabase
        .from('event_deletion_requests')
        .insert({ event_id: eventId, requested_by: userProfile.id, status: 'pending' });

      if (insertError) throw insertError;
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      await fetchDeletionRequests();
    } catch (err: unknown) {
      logSchedulePageError('request deletion', err);
      setError(t('schedulePage.errorRequestDeletion'));
    } finally {
      setRequestingDeletionId(null);
    }
  };

  const handleApproveDeletion = async (requestId: string, eventId: string) => {
    try {
      setResolvingRequestId(requestId);
      setError(null);
      const { error: delError } = await supabase.from('events').delete().eq('id', eventId);
      if (delError) throw delError;
      await fetchEvents();
      await fetchDeletionRequests();
    } catch (err: unknown) {
      logSchedulePageError('approve deletion', err);
      setError(t('schedulePage.errorDeleteEvent'));
    } finally {
      setResolvingRequestId(null);
    }
  };

  const handleRejectDeletion = async (requestId: string) => {
    try {
      setResolvingRequestId(requestId);
      setError(null);
      const { error: updateError } = await supabase
        .from('event_deletion_requests')
        .update({ status: 'rejected', resolved_at: new Date().toISOString(), resolved_by: userProfile?.id ?? null })
        .eq('id', requestId);
      if (updateError) throw updateError;
      await fetchDeletionRequests();
    } catch (err: unknown) {
      logSchedulePageError('reject deletion', err);
      setError(t('schedulePage.errorRejectDeletion'));
    } finally {
      setResolvingRequestId(null);
    }
  };

  const clearPreview = () => {
    if (previewObjectUrlRef.current) {
      URL.revokeObjectURL(previewObjectUrlRef.current);
      previewObjectUrlRef.current = null;
    }
    setPreviewUrl(null);
    setFormData({ ...formData, imageUrl: '' });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getRemainingEvents = () => {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    
    const eventsInLastYear = events.filter(event => {
      const eventDate = new Date(event.start_time);
      return eventDate >= oneYearAgo && event.status !== 'ended';
    });

    return 12 - eventsInLastYear.length;
  };

  const isScheduleAdmin = userProfile?.user_type === 'global_admin' || isSuperAdmin(userProfile?.id, userProfile?.user_type);
  const filteredEvents = !isScheduleAdmin
    ? events
    : events.filter((event) => {
        const matchArtist = !scheduleFilterArtist
          ? true
          : scheduleFilterArtist === 'unregistered'
            ? !event.artist_id
            : event.artist_id === scheduleFilterArtist;
        const matchStatus =
          scheduleFilterStatus === 'all' || event.status === scheduleFilterStatus;
        return matchArtist && matchStatus;
      });

  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const isAdmin = userProfile?.user_type === 'global_admin' || userProfile?.user_type === 'super_admin';
    if (isAdmin) {
      setFormData({ ...formData, price: parseFloat(e.target.value) || 0 });
    } else {
      setFormData({ ...formData, price: defaultPrice });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 relative overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-pink-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
      </div>
      
      <div className="container mx-auto px-6 py-8 pt-24 relative z-10">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-300 via-pink-300 to-purple-300 bg-clip-text text-transparent">
            {editingEvent ? t('schedulePage.editEvent') : t('schedulePage.title')}
          </h1>
          {!editingEvent && !isScheduleAdmin && (
            <div className="bg-gradient-to-br from-purple-600/20 to-pink-600/20 backdrop-blur-xl px-6 py-3 rounded-2xl border border-purple-500/30 shadow-xl">
              <span className="text-gray-300">
                {t('schedulePage.eventsRemaining')} <span className="text-purple-400 font-bold text-lg">{getRemainingEvents()}</span>
              </span>
            </div>
          )}
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Schedule Form */}
          <div className="bg-gradient-to-br from-gray-900/80 via-gray-800/60 to-gray-900/80 backdrop-blur-xl p-8 rounded-3xl border border-white/10 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-gradient-to-r from-red-600/20 via-red-500/20 to-red-600/20 backdrop-blur-sm border-2 border-red-500/50 text-red-300 px-6 py-4 rounded-2xl shadow-xl">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                  <p className="font-semibold">{error}</p>
                </div>
              </div>
            )}

            {streamLink && (
              <div className="bg-gradient-to-r from-green-600/20 via-emerald-500/20 to-green-600/20 backdrop-blur-sm border-2 border-green-500/50 text-green-300 px-6 py-4 rounded-2xl shadow-xl">
                <p className="mb-2">{t('schedulePage.eventCreatedShareLink')}</p>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={streamLink}
                    readOnly
                    className="flex-1 bg-green-500 bg-opacity-20 px-3 py-1 rounded"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(streamLink);
                      alert(t('schedulePage.linkCopied'));
                    }}
                    className="p-2 hover:text-green-400"
                  >
                    <LinkIcon size={20} />
                  </button>
                </div>
              </div>
            )}

            {warning && (
              <div className="bg-gradient-to-r from-yellow-600/20 via-amber-500/20 to-yellow-600/20 backdrop-blur-sm border-2 border-yellow-500/50 text-yellow-300 px-6 py-4 rounded-2xl shadow-xl">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                  <p className="font-semibold text-sm">{warning}</p>
                </div>
              </div>
            )}

            {/* Artist Selection for Admin */}
            {(userProfile?.user_type === 'global_admin' || userProfile?.user_type === 'super_admin') && (
              <div className="space-y-4">
                <div className="flex items-center space-x-4">
                  <button
                    type="button"
                    onClick={() => {
                      setIsUnregisteredArtist(false);
                      setFormData({
                        ...formData,
                        artistName: '',
                        artistEmail: '',
                        artistType: 'music'
                      });
                    }}
                    className={`flex-1 py-2 px-4 rounded-lg transition-colors ${
                      !isUnregisteredArtist
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {t('schedulePage.registeredArtist')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsUnregisteredArtist(true);
                      setSelectedArtist(null);
                    }}
                    className={`flex-1 py-2 px-4 rounded-lg transition-colors ${
                      isUnregisteredArtist
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {t('schedulePage.newArtist')}
                  </button>
                </div>

                {isUnregisteredArtist ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-gray-300 mb-2">{t('schedulePage.artistName')}</label>
                      <input
                        type="text"
                        value={formData.artistName}
                        onChange={(e) => setFormData({ ...formData, artistName: e.target.value })}
                        className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-gray-300 mb-2">{t('schedulePage.artistEmail')}</label>
                      <input
                        type="email"
                        value={formData.artistEmail}
                        onChange={(e) => setFormData({ ...formData, artistEmail: e.target.value })}
                        className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-gray-300 mb-2">{t('schedulePage.artistType')}</label>
                      <select
                        value={formData.artistType}
                        onChange={(e) => setFormData({ ...formData, artistType: e.target.value })}
                        className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
                      >
                        <option value="music">{t('common.music')}</option>
                        <option value="comedy">{t('common.comedy')}</option>
                      </select>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-gray-300 mb-2">{t('schedulePage.selectArtist')}</label>
                    <div className="relative">
                      <div
                        className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white cursor-pointer flex justify-between items-center"
                        onClick={() => setShowArtistDropdown(!showArtistDropdown)}
                      >
                        <span>{selectedArtist ? selectedArtist.full_name : t('schedulePage.selectAnArtist')}</span>
                        <Search className="h-4 w-4 text-gray-400" />
                      </div>
                      
                      {showArtistDropdown && (
                        <div className="absolute z-10 w-full mt-1 bg-gray-700 border border-gray-600 rounded-lg shadow-lg">
                          <input
                            type="text"
                            value={artistSearch}
                            onChange={(e) => setArtistSearch(e.target.value)}
                            className="w-full px-4 py-2 bg-gray-600 text-white border-b border-gray-500 rounded-t-lg focus:outline-none"
                            placeholder={t('schedulePage.searchArtists')}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div className="max-h-48 overflow-y-auto">
                            {filteredArtists.map((artist) => (
                              <div
                                key={artist.id}
                                className="px-4 py-2 hover:bg-gray-600 cursor-pointer text-white flex items-center space-x-2"
                                onClick={() => {
                                  setSelectedArtist(artist);
                                  setShowArtistDropdown(false);
                                }}
                              >
                                <span>{artist.full_name}</span>
                                <span className="text-sm text-gray-400">({artist.artist_type})</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Image Upload with Focal Point Picker */}
            <div className="flex flex-col items-center space-y-4">
              <div className="relative w-full">
                {previewUrl ? (
                  <div className="space-y-2">
                    <div
                      className="relative rounded-xl overflow-hidden border border-white/10 aspect-video w-full cursor-crosshair"
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
                        const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);
                        setFormData((prev) => ({ ...prev, imageFocalX: x, imageFocalY: y }));
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.click()}
                      aria-label={t('schedulePage.clickToSetFocal')}
                    >
                      <img
                        src={previewUrl}
                        alt="Event preview"
                        className="w-full h-full object-cover pointer-events-none"
                        style={{
                          objectPosition: `${formData.imageFocalX ?? 50}% ${formData.imageFocalY ?? 25}%`,
                        }}
                      />
                      <div
                        className="absolute w-8 h-8 border-2 border-white rounded-full pointer-events-none shadow-lg"
                        style={{
                          left: `${formData.imageFocalX ?? 50}%`,
                          top: `${formData.imageFocalY ?? 25}%`,
                          transform: 'translate(-50%, -50%)',
                        }}
                      >
                        <div className="absolute inset-1 border border-white/60 rounded-full" />
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); clearPreview(); setFormData((prev) => ({ ...prev, imageFocalX: null, imageFocalY: null })); }}
                        className="absolute top-2 right-2 bg-red-500/80 hover:bg-red-500 text-white rounded-full p-1 transition-colors"
                      >
                        <X size={16} />
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 text-center">
                      {t('schedulePage.focalPointHint', { x: formData.imageFocalX ?? 50, y: formData.imageFocalY ?? 25 })}
                    </p>
                  </div>
                ) : (
                  <div
                    className="w-full h-48 rounded-xl border-2 border-dashed border-gray-600 bg-gradient-to-br from-gray-800/80 to-gray-800/40 flex flex-col items-center justify-center gap-3 transition-colors hover:border-purple-500/50 hover:from-purple-900/20 hover:to-gray-800/40 cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
                  >
                    <div className="w-14 h-14 rounded-xl bg-gray-700/80 flex items-center justify-center ring-1 ring-gray-600/50">
                      <Image size={28} className="text-purple-400/80" />
                    </div>
                    <span className="text-sm text-gray-400">{t('schedulePage.clickOrUseButton')}</span>
                  </div>
                )}
              </div>
              
              <div className="flex items-center space-x-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*,.heic,.heif"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center space-x-2 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
                >
                  <Upload size={20} />
                  <span>{t('schedulePage.uploadEventImage')}</span>
                </button>
              </div>
            </div>
            
            <div>
              <label className="block text-gray-300 mb-2">{t('schedulePage.eventTitle')}</label>
              <div className="relative">
                <Info className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
                  required
                  placeholder={t('schedulePage.enterEventTitle')}
                />
              </div>
            </div>

            <div>
              <label className="block text-gray-300 mb-2">{t('schedulePage.description')}</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
                rows={4}
                required
                placeholder={t('schedulePage.describeEvent')}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-300 mb-2">{t('schedulePage.date')}</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
                    required
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>
              </div>
              <div>
                <label className="block text-gray-300 mb-2">{t('schedulePage.timeIntervals')}</label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                  <select
                    value={formData.startTimeOnly}
                    onChange={(e) => setFormData({ ...formData, startTimeOnly: e.target.value })}
                    className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-purple-500 appearance-none cursor-pointer"
                    required
                  >
                    {timeOptions.map((option) => (
                      <option key={option.value} value={option.value} className="bg-gray-700">
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-gray-300 mb-2">
                {t('schedulePage.durationMinutes')}
                {userProfile?.user_type !== 'global_admin' && userProfile?.user_type !== 'super_admin' && (
                  <span className="text-sm text-gray-400 ml-2">
                    {t('schedulePage.maxMinutes', { count: userProfile?.artist_type === 'music' ? 45 : 30 })}
                  </span>
                )}
              </label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="number"
                  value={formData.duration}
                  onChange={(e) => {
                    if (userProfile?.user_type === 'global_admin' || userProfile?.user_type === 'super_admin') {
                      const val = parseInt(e.target.value, 10);
                      setFormData({ ...formData, duration: isNaN(val) ? defaultDuration : val });
                    }
                  }}
                  className={`w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-purple-500 ${
                    userProfile?.user_type !== 'global_admin' && userProfile?.user_type !== 'super_admin' ? 'cursor-not-allowed opacity-75' : ''
                  }`}
                  min={1}
                  max={(userProfile?.user_type === 'global_admin' || userProfile?.user_type === 'super_admin') ? undefined : userProfile?.artist_type === 'music' ? 45 : 30}
                  readOnly={userProfile?.user_type !== 'global_admin' && userProfile?.user_type !== 'super_admin'}
                  required
                />
                {userProfile?.user_type !== 'global_admin' && userProfile?.user_type !== 'super_admin' && (
                  <Lock className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                )}
              </div>
              {userProfile?.user_type !== 'global_admin' && userProfile?.user_type !== 'super_admin' && (
                <p className="text-sm text-gray-400 mt-1">
                  {t('schedulePage.standardDuration', { count: defaultDuration })}
                </p>
              )}
            </div>

            {/* Price Field */}
            <div>
              <label className="block text-gray-300 mb-2 flex items-center">
                {t('schedulePage.priceUsd')}
                {userProfile?.user_type !== 'global_admin' && userProfile?.user_type !== 'super_admin' && (
                  <div className="flex items-center ml-2">
                    <Lock size={16} className="text-gray-400 mr-1" />
                    <span className="text-sm text-gray-400">{t('schedulePage.fixedAt', { price: defaultPrice.toFixed(2) })}</span>
                  </div>
                )}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 font-semibold" style={{ fontSize: '18px' }}>$</span>
                <input
                  type="number"
                  value={formData.price}
                  onChange={handlePriceChange}
                  className={`w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-purple-500 ${
                    userProfile?.user_type !== 'global_admin' && userProfile?.user_type !== 'super_admin' ? 'cursor-not-allowed opacity-75' : ''
                  }`}
                  min={(userProfile?.user_type === 'global_admin' || userProfile?.user_type === 'super_admin') ? "0.01" : defaultPrice.toString()}
                  max={(userProfile?.user_type === 'global_admin' || userProfile?.user_type === 'super_admin') ? undefined : defaultPrice.toString()}
                  step="0.01"
                  readOnly={userProfile?.user_type !== 'global_admin' && userProfile?.user_type !== 'super_admin'}
                  required
                />
                {userProfile?.user_type !== 'global_admin' && userProfile?.user_type !== 'super_admin' && (
                  <Lock className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                )}
              </div>
              {userProfile?.user_type !== 'global_admin' && userProfile?.user_type !== 'super_admin' && (
                <p className="text-sm text-gray-400 mt-1">
                  {t('schedulePage.standardPrice', { price: defaultPrice.toFixed(2) })}
                </p>
              )}
            </div>

            <div className="flex space-x-4">
              {editingEvent && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingEvent(null);
                    setFormData({
                      title: '',
                      description: '',
                      startTime: '',
                      startDate: '',
                      startTimeOnly: '12:00',
                      duration: defaultDuration,
                      price: defaultPrice,
                      imageUrl: '',
                      artistName: '',
                      artistEmail: '',
                      artistType: 'music',
                      imageFocalX: null,
                      imageFocalY: null,
                    });
                    setPreviewUrl(null);
                    setSelectedArtist(null);
                    setIsUnregisteredArtist(false);
                  }}
                  className="flex-1 bg-gray-700 text-white py-3 rounded-lg font-semibold transition-colors hover:bg-gray-600"
                >
                  {t('schedulePage.cancel')}
                </button>
              )}
              <button
                type="submit"
                disabled={loading}
                className={`flex-1 py-3 rounded-lg font-semibold transition-all duration-300 ${
                  loading 
                    ? 'bg-gray-600 cursor-not-allowed opacity-50' 
                    : saveSuccess
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-purple-600 hover:bg-purple-700'
                } text-white`}
              >
                {loading 
                  ? t('schedulePage.saving') 
                  : saveSuccess 
                    ? t('schedulePage.saved') 
                    : editingEvent 
                      ? t('schedulePage.updateEvent') 
                      : t('schedulePage.scheduleEvent')}
              </button>
            </div>
          </form>
        </div>

        {/* Scheduled Events */}
        <div>
          <h2 className="text-2xl font-bold text-white mb-6">
            {isScheduleAdmin ? t('schedulePage.allScheduledEvents') : t('schedulePage.yourScheduledEvents')}
          </h2>
          {isScheduleAdmin && events.length > 0 && (
            <div className="flex flex-wrap items-center gap-4 mb-6 p-4 bg-gray-800/60 rounded-xl border border-white/10">
              <Filter className="h-5 w-5 text-gray-400" />
              <span className="text-gray-400 text-sm font-medium">{t('schedulePage.filter')}</span>
              <select
                value={scheduleFilterArtist}
                onChange={(e) => setScheduleFilterArtist(e.target.value)}
                className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="">{t('schedulePage.allArtists')}</option>
                <option value="unregistered">{t('schedulePage.unregisteredOnly')}</option>
                {artists.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.full_name || a.username || a.email || a.id}
                  </option>
                ))}
              </select>
              <select
                value={scheduleFilterStatus}
                onChange={(e) => setScheduleFilterStatus(e.target.value)}
                className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="all">{t('schedulePage.allStatuses')}</option>
                <option value="upcoming">{t('schedulePage.upcoming')}</option>
                <option value="live">{t('schedulePage.live')}</option>
                <option value="ended">{t('schedulePage.ended')}</option>
              </select>
              {(scheduleFilterArtist || scheduleFilterStatus !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setScheduleFilterArtist('');
                    setScheduleFilterStatus('all');
                  }}
                  className="text-sm text-purple-400 hover:text-purple-300"
                >
                  {t('schedulePage.clearFilters')}
                </button>
              )}
            </div>
          )}
          {isScheduleAdmin && deletionRequests.filter((r) => r.status === 'pending').length > 0 && (
            <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
              <h3 className="text-lg font-semibold text-amber-200 mb-3">{t('schedulePage.pendingDeletionRequests')}</h3>
              <ul className="space-y-2">
                {deletionRequests.filter((r) => r.status === 'pending').map((req) => (
                  <li key={req.id} className="flex items-center justify-between gap-4 py-2 border-b border-white/10 last:border-0">
                    <span className="text-white truncate">{req.events?.title ?? req.event_id}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleApproveDeletion(req.id, req.event_id)}
                        disabled={!!resolvingRequestId}
                        className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 text-sm font-medium disabled:opacity-50"
                      >
                        {resolvingRequestId === req.id ? '...' : t('schedulePage.approveDeletion')}
                      </button>
                      <button
                        onClick={() => handleRejectDeletion(req.id)}
                        disabled={!!resolvingRequestId}
                        className="px-3 py-1.5 rounded-lg bg-gray-500/20 text-gray-400 border border-gray-500/30 hover:bg-gray-500/30 text-sm font-medium disabled:opacity-50"
                      >
                        {t('schedulePage.rejectDeletion')}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto"></div>
              <p className="text-gray-400 mt-4">{t('schedulePage.loadingEvents')}</p>
            </div>
          ) : filteredEvents.length > 0 ? (
            <div className="space-y-4">
              {filteredEvents.map((event) => (
                <div key={event.id} className="bg-gray-800 p-6 rounded-lg hover:bg-gray-700 transition-colors">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-semibold text-white">{event.title}</h3>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleEdit(event)}
                        className="p-2 text-gray-400 hover:text-purple-400 transition-colors"
                        title={t('schedulePage.editEventTitle')}
                      >
                        <Pencil size={18} />
                      </button>
                      {isScheduleAdmin ? (
                        <button
                          onClick={() => handleDelete(event.id)}
                          className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                          title={t('schedulePage.deleteEventTitle')}
                        >
                          <Trash2 size={18} />
                        </button>
                      ) : deletionRequests.some((r) => r.event_id === event.id && r.status === 'pending') ? (
                        <span className="px-2 py-1 text-xs text-amber-400 border border-amber-500/30 rounded" title={t('schedulePage.deletionRequested')}>
                          {t('schedulePage.deletionRequested')}
                        </span>
                      ) : (
                        <button
                          onClick={() => handleRequestDeletion(event.id)}
                          disabled={!!requestingDeletionId}
                          className="p-2 text-gray-400 hover:text-amber-400 transition-colors disabled:opacity-50"
                          title={t('schedulePage.requestDeletionTitle')}
                        >
                          {requestingDeletionId === event.id ? '...' : <Trash2 size={18} />}
                        </button>
                      )}
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                        event.status === 'upcoming' ? 'bg-purple-500 text-white' :
                        event.status === 'live' ? 'bg-red-500 text-white' :
                        'bg-gray-500 text-white'
                      }`}>
                        {event.status === 'upcoming' ? t('schedulePage.upcoming') : event.status === 'live' ? t('schedulePage.live') : t('schedulePage.ended')}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-4 mb-4">
                    {failedImageUrls.has(event.image_url) ? (
                      <div className="w-24 h-24 rounded-lg bg-gray-700 flex items-center justify-center flex-shrink-0" title={t('schedulePage.imageUnavailable')}>
                        <Image className="h-8 w-8 text-gray-500" />
                      </div>
                    ) : (
                      <div className="w-24 h-24 rounded-lg overflow-hidden flex-shrink-0">
                        <SmartImage
                          src={event.image_url}
                          alt={event.title}
                          variant="square"
                          focalX={event.image_focal_x ?? 50}
                          focalY={event.image_focal_y ?? 25}
                          containerClassName="w-full h-full"
                          className="w-full h-full"
                          onError={() => setFailedImageUrls(prev => new Set(prev).add(event.image_url))}
                        />
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="text-gray-400 mb-2">{event.description}</p>
                      {(userProfile?.user_type === 'global_admin' || userProfile?.user_type === 'super_admin') && (
                        <div className="text-sm text-gray-500">
                          {event.unregistered_artist_name ? (
                            <span>{t('schedulePage.artistUnregistered', { name: event.unregistered_artist_name })}</span>
                          ) : (
                            <span>{t('schedulePage.artistId', { id: event.artist_id })}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center text-gray-400">
                      <Calendar className="h-4 w-4 mr-2" />
                      <span>{formatDate(event.start_time)}</span>
                    </div>
                    <div className="flex items-center text-gray-400">
                      <Clock className="h-4 w-4 mr-2" />
                      <span>{t('schedulePage.minutes', { count: event.duration })}</span>
                    </div>
                    <div className="flex items-center text-gray-400">
                      <span className="mr-2">$</span>
                      <span>${event.price.toFixed(2)}</span>
                      {event.price === defaultPrice && userProfile?.user_type !== 'global_admin' && (
                        <Lock className="h-3 w-3 ml-1 text-gray-500" />
                      )}
                    </div>
                    <div className="flex items-center text-gray-400">
                      <Users className="h-4 w-4 mr-2" />
                      <span>{t('schedulePage.viewers', { count: event.viewer_count || 0 })}</span>
                    </div>
                  </div>

                  {event.stream_key && (
                    <div className="mt-4 pt-4 border-t border-gray-700">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400">{t('schedulePage.streamingLink')}</span>
                        <button
                          onClick={() => {
                            const link = `${window.location.origin}/stream/${event.id}?key=${event.stream_key}`;
                            navigator.clipboard.writeText(link);
                            alert(t('schedulePage.linkCopied'));
                          }}
                          className="flex items-center space-x-2 text-purple-400 hover:text-purple-300"
                        >
                          <LinkIcon size={16} />
                          <span>{t('schedulePage.copyLink')}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 bg-gray-800 rounded-lg">
              <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-400">
                {isScheduleAdmin && events.length > 0 && (scheduleFilterArtist || scheduleFilterStatus !== 'all')
                  ? t('schedulePage.noEventsMatchFilters')
                  : t('schedulePage.noEventsScheduled')}
              </p>
              <p className="text-gray-500 text-sm mt-2">
                {isScheduleAdmin && events.length > 0 && (scheduleFilterArtist || scheduleFilterStatus !== 'all')
                  ? t('schedulePage.tryClearingFilters')
                  : isScheduleAdmin
                    ? t('schedulePage.createEventsForArtists')
                    : t('schedulePage.scheduleFirstEvent')}
              </p>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
};

export default Schedule;