import AgoraRTC, {
  IAgoraRTCClient,
  IMicrophoneAudioTrack,
  ICameraVideoTrack,
  ILocalVideoTrack,
  ILocalAudioTrack
} from 'agora-rtc-sdk-ng';
import { supabase } from './supabaseClient';

export type LocalTracks = [IMicrophoneAudioTrack | ILocalAudioTrack, ICameraVideoTrack | ILocalVideoTrack];

export function createClient(opts?: { mode?: 'live' | 'rtc'; codec?: 'vp8' | 'h264' }) {
  return AgoraRTC.createClient({ 
    mode: (opts?.mode ?? 'live') as any, 
    codec: opts?.codec ?? 'vp8' 
  });
}

export async function createLocalTracks(microphoneId?: string, cameraId?: string, encoderConfig?: any) {
  const audioConfig: any = microphoneId ? { microphoneId } : true;
  const videoConfig: any = {};
  
  if (cameraId) {
    videoConfig.cameraId = cameraId;
  }
  
  if (encoderConfig) {
    if (encoderConfig.width || encoderConfig.height || encoderConfig.frameRate || encoderConfig.zoom || encoderConfig.advanced) {
      videoConfig.encoderConfig = encoderConfig;
    } else {
      Object.assign(videoConfig, encoderConfig);
    }
  }
  
  if (!videoConfig.zoom && !videoConfig.encoderConfig?.zoom) {
    videoConfig.zoom = { min: 1.0, max: 1.0 };
  }
  
  if (Object.keys(videoConfig).length === 0) {
    videoConfig.encoderConfig = {
      width: { exact: 720 },
      height: { exact: 1280 },
      frameRate: { ideal: 30 },
      zoom: { min: 1.0, max: 1.0 }
    };
  }
  
  const tracks = await AgoraRTC.createMicrophoneAndCameraTracks(audioConfig, videoConfig);
  return tracks as LocalTracks;
}

export async function generateToken(channelName: string, uid: number | string, role = 'publisher', expireTime = 3600) {
  try {
    if ((supabase as any)?.functions?.invoke) {
      const res = await (supabase as any).functions.invoke('generate-agora-token', {
        body: { channelName, uid, role, expireTime }
      });
      
      if (res.error) {
        throw new Error(`Supabase function error: ${res.error.message || res.error}`);
      }
      
      if (res.data && res.data.token && res.data.appId) {
        return res.data as { token: string; appId: string };
      } else {
        throw new Error('Invalid response from token service');
      }
    }
  } catch (err) {
    // Fall through to direct fetch
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
  if (!supabaseUrl) {
    throw new Error('Service unavailable');
  }
  
  const { data: { session } } = await supabase.auth.getSession();
  const bearerToken = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || '';

  const response = await fetch(`${supabaseUrl}/functions/v1/generate-agora-token`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${bearerToken}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || '',
    },
    body: JSON.stringify({ channelName, uid, role, expireTime }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error || `Token service returned ${response.status}`);
  }

  const tokenData = await response.json();
  
  if (tokenData && tokenData.token && tokenData.appId) {
    return tokenData as { token: string; appId: string };
  }
  
  // Final fallback for testing — return appId without token
  const envAppId = import.meta.env.VITE_AGORA_APP_ID;
  if (envAppId) {
    console.warn('Using environment appId without token as final fallback');
    return { token: '', appId: envAppId };
  }
  
  throw new Error('Token generation failed');
}

export async function joinChannel(
  client: IAgoraRTCClient,
  channelName: string,
  tokenOrTokenData: string | { token: string; appId: string },
  uid: number | string,
  localTracks?: LocalTracks
) {
  let token: string;
  let appId: string | undefined;

  if (typeof tokenOrTokenData === 'string') {
    token = tokenOrTokenData;
    appId = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_AGORA_APP_ID) || undefined;
  } else {
    token = tokenOrTokenData.token;
    appId = tokenOrTokenData.appId;
  }

  if (!appId) {
    throw new Error('Agora App ID not provided. Ensure generateToken returns appId or set VITE_AGORA_APP_ID.');
  }

  await client.join(appId, channelName, token, uid as any);

  if (localTracks) {
    await client.publish(localTracks);
  }
}

export async function leaveChannel(client: IAgoraRTCClient, localTracks?: LocalTracks) {
  if (localTracks) {
    try { await client.unpublish(localTracks); } catch { /* non-critical */ }
    try { localTracks[0].close(); localTracks[1].close(); } catch { /* non-critical */ }
  }

  await client.leave();
}

export async function updateStreamStatus(eventId: string | number, status: 'live' | 'ended' | 'scheduled', viewer_count?: number) {
  try {
    const updatePayload: any = { status };
    if (typeof viewer_count === 'number') updatePayload.viewer_count = viewer_count;
    
    const { error } = await supabase
      .from('events')
      .update(updatePayload)
      .eq('id', eventId);
      
    if (error) throw error;

    if (status === 'live') {
      try {
        const { data: event, error: eventError } = await supabase
          .from('events')
          .select(`
            id,
            title,
            artist_id,
            profiles:artist_id (
              full_name,
              username,
              id
            )
          `)
          .eq('id', eventId)
          .single();

        if (!eventError && event) {
          const eventTitle = event.title || 'Live Stream';
          const artistName = (event.profiles as any)?.full_name || 
                           (event.profiles as any)?.username || 
                           'Artist';

          const projectUrl = supabase.supabaseUrl;
          
          if (projectUrl) {
            supabase.functions.invoke('send-live-event-notifications', {
              body: { eventId: event.id, eventTitle, artistName }
            }).catch((err) => console.error('Notification send failed:', err));

            supabase.functions.invoke('send-live-event-emails', {
              body: { eventId: event.id, eventTitle, artistName }
            }).catch((err) => console.error('Email send failed:', err));

            if (event.artist_id) {
              supabase.functions.invoke('send-phone-notifications', {
                body: {
                  eventId: event.id,
                  eventTitle,
                  artistId: event.artist_id,
                  artistName,
                  notificationType: 'live_event_started'
                }
              }).catch((err) => console.error('Phone notification failed:', err));
            }
          }
        }
      } catch (notifError) {
        console.error('Error triggering live stream notifications:', notifError);
      }
    }
  } catch (err) {
    console.error('Failed to update stream status:', err);
  }
}

export function validateAgoraConfig() {
  const errors: string[] = [];
  const envAny = (typeof import.meta !== 'undefined' && (import.meta as any).env) || {};
  const appId = envAny?.VITE_AGORA_APP_ID || undefined;
  if (!appId) {
    errors.push('VITE_AGORA_APP_ID not found in client build environment.');
  }
  return { isValid: errors.length === 0, errors, appId } as const;
}
