/**
 * Stream utility functions for DREEMYSTAR platform
 */

export interface StreamEndpoint {
  rtmpUrl: string;
  playbackUrl: string;
  streamKey: string;
}

/**
 * Generate secure stream endpoint for an event
 */
export const generateStreamEndpoint = (eventId: string, userId: string): StreamEndpoint => {
  const timestamp = Date.now();
  const streamKey = generateSecureStreamKey(eventId, userId, timestamp);
  
  // In production, these would come from environment variables
  const RTMP_SERVER = process.env.REACT_APP_RTMP_SERVER || 'rtmp://streaming.dreemystar.com:1935/live';
  const HLS_SERVER = process.env.REACT_APP_HLS_SERVER || 'https://streaming.dreemystar.com/hls';
  
  return {
    rtmpUrl: `${RTMP_SERVER}/${streamKey}`,
    playbackUrl: `${HLS_SERVER}/${streamKey}.m3u8`,
    streamKey
  };
};

/**
 * Generate secure stream key
 */
const generateSecureStreamKey = (eventId: string, userId: string, timestamp: number): string => {
  // Simple key generation for demo - in production, use proper crypto
  const data = `${eventId}-${userId}-${timestamp}`;
  return btoa(data).replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);
};

/**
 * Validate stream URL format
 */
export const isValidStreamUrl = (url: string): boolean => {
  try {
    const urlObj = new URL(url);
    return ['rtmp:', 'rtmps:', 'http:', 'https:'].includes(urlObj.protocol);
  } catch {
    return false;
  }
};

/**
 * Get stream type from URL
 */
export const getStreamType = (url: string): 'rtmp' | 'hls' | 'dash' | 'unknown' => {
  if (url.startsWith('rtmp')) return 'rtmp';
  if (url.includes('.m3u8')) return 'hls';
  if (url.includes('.mpd')) return 'dash';
  return 'unknown';
};

/**
 * Format viewer count for display
 */
export const formatViewerCount = (count: number): string => {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  } else if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
};

/**
 * Calculate stream duration
 */
export const calculateStreamDuration = (startTime: string): string => {
  const start = new Date(startTime);
  const now = new Date();
  const diff = now.getTime() - start.getTime();
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};

/**
 * Check if browser supports WebRTC
 */
export const supportsWebRTC = (): boolean => {
  return !!(
    navigator.mediaDevices &&
    navigator.mediaDevices.getUserMedia &&
    window.RTCPeerConnection
  );
};

/** Prefer labels from the pass that has a non-empty label (helps virtual cams). */
function mergeDeviceLabels(
  primary: MediaDeviceInfo,
  secondary: MediaDeviceInfo
): MediaDeviceInfo {
  if (primary.label && !secondary.label) return primary;
  if (secondary.label && !primary.label) return secondary;
  return secondary;
}

/**
 * Stable key for merging: some virtual cameras briefly report empty deviceId.
 * Never drop those entries — older code skipped them and hid OBS Virtual Camera.
 */
function mergeKey(d: MediaDeviceInfo): string {
  if (d.deviceId) return d.deviceId;
  return `fallback:${d.kind}:${d.groupId || 'nogroup'}:${d.label || 'nolabel'}`;
}

function mergeDeviceListsMany(lists: MediaDeviceInfo[][]): MediaDeviceInfo[] {
  const map = new Map<string, MediaDeviceInfo>();
  for (const list of lists) {
    for (const d of list) {
      const k = mergeKey(d);
      const prev = map.get(k);
      map.set(k, prev ? mergeDeviceLabels(prev, d) : d);
    }
  }
  return [...map.values()];
}

/**
 * Deduplicate media devices by deviceId (some browsers enumerate duplicates).
 */
export function dedupeMediaDevicesById(devices: MediaDeviceInfo[]): MediaDeviceInfo[] {
  return mergeDeviceListsMany([devices]);
}

/**
 * Deduplicate video inputs by deviceId (some browsers enumerate duplicates).
 */
export function dedupeVideoInputDevices(devices: MediaDeviceInfo[]): MediaDeviceInfo[] {
  return mergeDeviceListsMany([devices.filter((d) => d.kind === 'videoinput')]);
}

/**
 * Sort so OBS / virtual / NDI-style cameras appear first (easier to find in the dropdown).
 */
export function sortVideoInputDevices(devices: MediaDeviceInfo[]): MediaDeviceInfo[] {
  const priority = (label: string) => {
    const l = label.toLowerCase();
    if (l.includes('obs')) return 0;
    if (l.includes('virtual')) return 1;
    if (l.includes('ndi')) return 2;
    return 50;
  };
  return [...devices].sort((a, b) => {
    const pa = priority(a.label || '');
    const pb = priority(b.label || '');
    if (pa !== pb) return pa - pb;
    return (a.label || a.deviceId).localeCompare(b.label || b.deviceId);
  });
}

async function ensureVideoPermissionForEnumerate(): Promise<void> {
  try {
    const q = await navigator.permissions.query({ name: 'camera' as PermissionName });
    if (q.state === 'granted') return;
  } catch {
    /* Permissions API unsupported or no camera descriptor */
  }
  await navigator.mediaDevices
    .getUserMedia({ video: true })
    .then((s) => s.getTracks().forEach((t) => t.stop()))
    .catch(() => {});
}

async function ensureAvPermissionForEnumerate(): Promise<void> {
  let camGranted = false;
  let micGranted = false;
  try {
    const cq = await navigator.permissions.query({ name: 'camera' as PermissionName });
    camGranted = cq.state === 'granted';
  } catch {
    /* ignore */
  }
  try {
    const mq = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    micGranted = mq.state === 'granted';
  } catch {
    /* ignore */
  }
  if (camGranted && micGranted) {
    return;
  }
  await navigator.mediaDevices
    .getUserMedia({ audio: true, video: true })
    .then((s) => s.getTracks().forEach((t) => t.stop()))
    .catch(() => {});
}

async function collectRawVideoInputs(): Promise<MediaDeviceInfo[]> {
  const all = await navigator.mediaDevices.enumerateDevices();
  return all.filter((d) => d.kind === 'videoinput');
}

async function collectRawAv(): Promise<{ cameras: MediaDeviceInfo[]; microphones: MediaDeviceInfo[] }> {
  const all = await navigator.mediaDevices.enumerateDevices();
  return {
    cameras: all.filter((d) => d.kind === 'videoinput'),
    microphones: all.filter((d) => d.kind === 'audioinput'),
  };
}

/**
 * Enumerate video inputs after permission. Skips opening the default camera when
 * permission is already granted (avoids macOS virtual-camera glitches from rapid
 * getUserMedia). Multiple delayed passes catch devices that register late (OBS).
 */
export async function enumerateVideoInputDevicesAfterPermission(): Promise<MediaDeviceInfo[]> {
  await ensureVideoPermissionForEnumerate();

  const passes: MediaDeviceInfo[][] = [];
  passes.push(await collectRawVideoInputs());
  await new Promise((r) => setTimeout(r, 300));
  passes.push(await collectRawVideoInputs());
  await new Promise((r) => setTimeout(r, 500));
  passes.push(await collectRawVideoInputs());

  const merged = mergeDeviceListsMany(passes);
  return sortVideoInputDevices(merged);
}

/**
 * After microphone + camera permission: enumerate with delayed passes so
 * virtual cameras (OBS, etc.) are less likely to be missing.
 */
export async function enumerateCamerasAndMicrophonesAfterPermission(): Promise<{
  cameras: MediaDeviceInfo[];
  microphones: MediaDeviceInfo[];
}> {
  await ensureAvPermissionForEnumerate();

  const camPasses: MediaDeviceInfo[][] = [];
  const micPasses: MediaDeviceInfo[][] = [];

  for (let i = 0; i < 3; i++) {
    if (i === 1) await new Promise((r) => setTimeout(r, 300));
    if (i === 2) await new Promise((r) => setTimeout(r, 500));
    const { cameras, microphones } = await collectRawAv();
    camPasses.push(cameras);
    micPasses.push(microphones);
  }

  const cameras = sortVideoInputDevices(mergeDeviceListsMany(camPasses));
  const microphones = mergeDeviceListsMany(micPasses).sort((a, b) =>
    (a.label || a.deviceId).localeCompare(b.label || b.deviceId)
  );

  return { cameras, microphones };
}

/**
 * Check if browser supports HLS natively
 */
export const supportsHLS = (): boolean => {
  const video = document.createElement('video');
  return video.canPlayType('application/vnd.apple.mpegurl') !== '';
};

/**
 * Get optimal video quality based on connection
 */
export const getOptimalQuality = async (): Promise<'720p' | '480p' | '360p'> => {
  try {
    // Simple connection test - in production, use more sophisticated detection
    const connection = (navigator as any).connection;
    if (connection) {
      const { effectiveType, downlink } = connection;
      
      if (effectiveType === '4g' && downlink > 5) return '720p';
      if (effectiveType === '4g' || downlink > 2) return '480p';
      return '360p';
    }
    
    // Fallback quality
    return '480p';
  } catch {
    return '480p';
  }
};

/**
 * Stream health monitoring
 */
export interface StreamHealth {
  status: 'good' | 'fair' | 'poor';
  bitrate: number;
  fps: number;
  latency: number;
}

export const monitorStreamHealth = (streamUrl: string): Promise<StreamHealth> => {
  return new Promise((resolve) => {
    // Simulate stream health monitoring
    // In production, this would connect to your streaming server's API
    setTimeout(() => {
      resolve({
        status: 'good',
        bitrate: 4500,
        fps: 30,
        latency: 150
      });
    }, 1000);
  });
};

/**
 * OBS Studio configuration generator
 */
export interface OBSConfig {
  server: string;
  streamKey: string;
  settings: {
    resolution: string;
    fps: number;
    bitrate: number;
    encoder: string;
  };
}

export const generateOBSConfig = (streamEndpoint: StreamEndpoint): OBSConfig => {
  const lastSlash = streamEndpoint.rtmpUrl.lastIndexOf('/');
  const server = lastSlash > 0 ? streamEndpoint.rtmpUrl.substring(0, lastSlash) : streamEndpoint.rtmpUrl;

  return {
    server,
    streamKey: streamEndpoint.streamKey,
    settings: {
      resolution: '1920x1080',
      fps: 30,
      bitrate: 4500,
      encoder: 'x264'
    }
  };
};

/**
 * Copy text to clipboard with fallback
 */
export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      return true;
    }
  } catch {
    return false;
  }
};