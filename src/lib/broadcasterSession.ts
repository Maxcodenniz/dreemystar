import { supabase } from './supabaseClient';

export async function registerBroadcasterSession(eventId: string, broadcasterId: string): Promise<string | null> {
  try {
    if (!eventId || !broadcasterId) return null;

    const { data, error } = await supabase.rpc('register_broadcaster_session', {
      event_uuid: eventId,
      broadcaster_uuid: broadcasterId
    });

    if (error) {
      console.error('Error registering broadcaster session:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Failed to register broadcaster session:', err);
    return null;
  }
}

export async function updateBroadcasterHeartbeat(eventId: string, broadcasterId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('update_broadcaster_heartbeat', {
      event_uuid: eventId,
      broadcaster_uuid: broadcasterId
    });

    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}

export async function removeBroadcasterSession(eventId: string, broadcasterId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('remove_broadcaster_session', {
      event_uuid: eventId,
      broadcaster_uuid: broadcasterId
    });

    if (error) {
      console.error('Error removing broadcaster session:', error);
      return false;
    }

    return data === true;
  } catch (err) {
    console.error('Failed to remove broadcaster session:', err);
    return false;
  }
}

export function startBroadcasterHeartbeat(
  eventId: string,
  broadcasterId: string,
  intervalMs: number = 30000
): NodeJS.Timeout {
  return setInterval(() => {
    updateBroadcasterHeartbeat(eventId, broadcasterId);
  }, intervalMs);
}
