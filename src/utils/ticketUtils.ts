import { supabase } from '../lib/supabaseClient';
import i18n from '../i18n';

/**
 * Extract error message from Supabase function error response.
 * Handles both Response-in-context (newer client) and parsed body (older client).
 * @param error - The error object from supabase.functions.invoke()
 * @returns Promise<string> - The extracted error message
 */
export async function extractFunctionError(error: any): Promise<string> {
  const defaultMessage = 'Payment failed. Please try again.';
  let errorMessage = defaultMessage;

  // Newer Supabase client: error.context is the raw Response (body is ReadableStream)
  const ctx = error?.context;
  if (ctx && typeof ctx.clone === 'function') {
    try {
      const res = ctx.clone();
      const body = await (typeof res.json === 'function' ? res.json() : res.text().then((t: string) => {
        try { return JSON.parse(t); } catch { return null; }
      }));
      if (body?.error && typeof body.error === 'string') {
        return body.error;
      }
    } catch {
      // ignore parse errors
    }
  }

  // Older client or other shapes: context.body might be string or object
  const rawBody = ctx?.body ?? error.body;
  if (rawBody !== undefined) {
    try {
      const errorBody = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
      if (errorBody?.error && typeof errorBody.error === 'string') {
        errorMessage = errorBody.error;
      }
    } catch {
      if (typeof rawBody === 'string' && rawBody.length < 200) {
        errorMessage = rawBody;
      }
    }
  }

  if (ctx?.message && typeof ctx.message === 'string') {
    errorMessage = ctx.message;
  }
  if (ctx?.data?.error && typeof ctx.data.error === 'string') {
    errorMessage = ctx.data.error;
  }

  const msg = error?.message;
  if (typeof msg === 'string' && msg.length > 0) {
    if (msg.includes('Function not found') || msg.includes('Failed to send') || msg.includes('fetch')) {
      errorMessage = i18n.t('cart.paymentServiceUnavailable');
    } else if (errorMessage === defaultMessage && !msg.includes('FunctionsHttpError')) {
      errorMessage = msg;
    }
  }

  return errorMessage;
}

/**
 * Check if a user has an active ticket for an event (any type: live or replay)
 * @param eventId - The event ID to check
 * @param userId - The user ID (optional, for logged-in users)
 * @param email - The email address (optional, for guest users)
 * @returns Promise<boolean> - True if user has an active ticket
 */
export async function hasActiveTicket(
  eventId: string,
  userId?: string | null,
  email?: string | null
): Promise<boolean> {
  try {
    const hasLive = await hasLiveTicket(eventId, userId, email);
    const hasReplay = await hasReplayTicket(eventId, userId, email);
    return hasLive || hasReplay;
  } catch (error) {
    console.error('Error in hasActiveTicket:', error);
    return false;
  }
}

/**
 * Check if a user has an active LIVE ticket (for live stream; also grants free replay for 3h after event end)
 */
export async function hasLiveTicket(
  eventId: string,
  userId?: string | null,
  email?: string | null
): Promise<boolean> {
  try {
    const liveTypeOrNull = () =>
      supabase
        .from('tickets')
        .select('id')
        .eq('event_id', eventId)
        .eq('status', 'active')
        .or('ticket_type.eq.live,ticket_type.is.null');

    const byUserId = async (uid: string) => {
      // limit(1): multiple matching rows (e.g. data quirks) must not make maybeSingle() error → false negative
      const { data, error } = await liveTypeOrNull().eq('user_id', uid).limit(1).maybeSingle();
      if (error) return false;
      return !!data;
    };

    const byEmail = async (em: string) => {
      const normalizedEmail = em.toLowerCase().trim();
      const { data, error } = await liveTypeOrNull().ilike('email', normalizedEmail).limit(1).maybeSingle();
      if (error) return false;
      return !!data;
    };

    // Guest checkouts often store email only (user_id null). Logged-in users must
    // still match those rows via email (RLS: email = auth.email()).
    if (userId) {
      if (await byUserId(userId)) return true;
      if (email && (await byEmail(email))) return true;
      return false;
    }
    if (email) {
      return byEmail(email);
    }
    return false;
  } catch (error) {
    console.error('Error in hasLiveTicket:', error);
    return false;
  }
}

/**
 * Check if a user has an active REPLAY ticket (on-demand viewing)
 */
export async function hasReplayTicket(
  eventId: string,
  userId?: string | null,
  email?: string | null
): Promise<boolean> {
  try {
    const replayBase = () =>
      supabase
        .from('tickets')
        .select('id')
        .eq('event_id', eventId)
        .eq('status', 'active')
        .eq('ticket_type', 'replay');

    const byUserId = async (uid: string) => {
      const { data, error } = await replayBase().eq('user_id', uid).limit(1).maybeSingle();
      if (error) return false;
      return !!data;
    };

    const byEmail = async (em: string) => {
      const normalizedEmail = em.toLowerCase().trim();
      const { data, error } = await replayBase().ilike('email', normalizedEmail).limit(1).maybeSingle();
      if (error) return false;
      return !!data;
    };

    if (userId) {
      if (await byUserId(userId)) return true;
      if (email && (await byEmail(email))) return true;
      return false;
    }
    if (email) {
      return byEmail(email);
    }
    return false;
  } catch (error) {
    console.error('Error in hasReplayTicket:', error);
    return false;
  }
}

/** Free replay window in hours after event end (for live ticket holders) */
const FREE_REPLAY_HOURS = 3;

/**
 * Check if the user can watch the replay: free (within 3h with live ticket) or has replay ticket
 * @param eventId - Event ID
 * @param startTime - Event start time ISO string
 * @param durationMinutes - Event duration in minutes
 */
export async function getReplayAccess(
  eventId: string,
  userId: string | null,
  email: string | null,
  startTime: string,
  durationMinutes: number
): Promise<{ canWatch: boolean; reason: 'free' | 'replay_ticket' | null }> {
  const live = await hasLiveTicket(eventId, userId, email);
  const replay = await hasReplayTicket(eventId, userId, email);
  if (replay) return { canWatch: true, reason: 'replay_ticket' };
  const endMs = new Date(startTime).getTime() + durationMinutes * 60 * 1000;
  const freeReplayEndsAt = endMs + FREE_REPLAY_HOURS * 60 * 60 * 1000;
  if (live && Date.now() < freeReplayEndsAt) return { canWatch: true, reason: 'free' };
  return { canWatch: false, reason: null };
}

/**
 * Check if a user has active tickets for multiple events
 * @param eventIds - Array of event IDs to check
 * @param userId - The user ID (optional, for logged-in users)
 * @param email - The email address (optional, for guest users)
 * @returns Promise<string[]> - Array of event IDs that the user already has tickets for
 */
export async function getEventsWithTickets(
  eventIds: string[],
  userId?: string | null,
  email?: string | null
): Promise<string[]> {
  try {
    if (eventIds.length === 0) return [];

    if (userId) {
      const ids = new Set<string>();

      const { data: byUser, error: errUser } = await supabase
        .from('tickets')
        .select('event_id')
        .in('event_id', eventIds)
        .eq('user_id', userId)
        .eq('status', 'active');

      if (errUser) {
        console.error('Error checking tickets by user ID:', errUser);
      } else {
        byUser?.forEach((t) => ids.add(t.event_id));
      }

      if (email) {
        const normalizedEmail = email.toLowerCase().trim();
        const { data: byEmail, error: errEmail } = await supabase
          .from('tickets')
          .select('event_id')
          .in('event_id', eventIds)
          .ilike('email', normalizedEmail)
          .eq('status', 'active');

        if (errEmail) {
          console.error('Error checking tickets by email:', errEmail);
        } else {
          byEmail?.forEach((t) => ids.add(t.event_id));
        }
      }

      return [...ids];
    } else if (email) {
      // Check by email for guest users
      const normalizedEmail = email.toLowerCase().trim();
      const { data, error } = await supabase
        .from('tickets')
        .select('event_id')
        .in('event_id', eventIds)
        .ilike('email', normalizedEmail)
        .eq('status', 'active');

      if (error) {
        console.error('Error checking tickets by email:', error);
        return [];
      }

      return data?.map(t => t.event_id) || [];
    }

    return [];
  } catch (error) {
    console.error('Error in getEventsWithTickets:', error);
    return [];
  }
}

