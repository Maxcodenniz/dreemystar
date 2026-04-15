import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface UseViewerPresenceOptions {
  eventId: string | undefined;
  userId: string | null;
  deviceId: string | null;
  enabled?: boolean;
}

interface PresenceState {
  viewerCount: number;
  likeCount: number;
  isKicked: boolean;
}

/**
 * Number of Presence shards per event.
 * Each shard handles ~5K–10K viewers on Supabase Pro.
 * 64 shards → up to ~500K viewers without hitting per-channel limits.
 */
const NUM_SHARDS = 64;
const SYNC_TO_DB_INTERVAL = 30_000;
const SHARD_REPORT_INTERVAL = 5_000;

/** Normalizes Realtime broadcast envelope shapes across @supabase/realtime-js versions. */
function parseShardCountPayload(raw: unknown): { shard: number; count: number } | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const p = r.payload;
  const layer1 = p && typeof p === 'object' ? (p as Record<string, unknown>) : r;
  const layer2 =
    layer1.payload && typeof layer1.payload === 'object'
      ? (layer1.payload as Record<string, unknown>)
      : layer1;
  const s = layer2.shard;
  const c = layer2.count;
  if (typeof s === 'number' && typeof c === 'number') return { shard: s, count: c };
  return null;
}

function shardIndex(deviceId: string): number {
  let hash = 0;
  for (let i = 0; i < deviceId.length; i++) {
    hash = ((hash << 5) - hash + deviceId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % NUM_SHARDS;
}

/**
 * Scalable viewer tracking using sharded Supabase Realtime Presence.
 *
 * Architecture:
 *   viewers:{eventId}:shard_0  … shard_63   ← viewers join one shard
 *   viewers:{eventId}:meta                   ← aggregation channel
 *
 * Each viewer joins exactly one shard (deterministic by deviceId).
 * Every SHARD_REPORT_INTERVAL ms, the local client counts its shard's
 * presence state and broadcasts { shard, count } to the meta channel.
 *
 * Every client also subscribes to the meta channel to receive all shard
 * reports and aggregates them into the total viewer count.
 *
 * Likes are broadcast on the meta channel (one message reaches everyone).
 */
export function useViewerPresence({
  eventId,
  userId,
  deviceId,
  enabled = true,
}: UseViewerPresenceOptions): PresenceState {
  const [viewerCount, setViewerCount] = useState(0);
  const [likeCount, setLikeCount] = useState(0);
  const [isKicked, setIsKicked] = useState(false);

  const shardChannelRef = useRef<RealtimeChannel | null>(null);
  const metaChannelRef = useRef<RealtimeChannel | null>(null);
  const shardCountsRef = useRef<Map<number, number>>(new Map());
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reportIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const myShardRef = useRef<number>(0);

  const aggregateCounts = useCallback(() => {
    let total = 0;
    shardCountsRef.current.forEach((c) => { total += c; });
    setViewerCount(total);
    return total;
  }, []);

  useEffect(() => {
    if (!eventId || !enabled) return;

    const effectiveDeviceId = deviceId || `anon-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const shard = shardIndex(effectiveDeviceId);
    myShardRef.current = shard;

    const shardName = `viewers:${eventId}:shard_${shard}`;
    const metaName = `viewers:${eventId}:meta`;

    // ── 1. Join the viewer's shard channel ──────────────────────────
    const shardChannel = supabase.channel(shardName, {
      config: { presence: { key: effectiveDeviceId } },
    });
    shardChannelRef.current = shardChannel;

    const countShard = () => {
      const state = shardChannel.presenceState();
      let count = 0;
      for (const key in state) count += state[key].length;
      shardCountsRef.current.set(shard, count);
      aggregateCounts();
      return count;
    };

    shardChannel
      .on('presence', { event: 'sync' }, countShard)
      .on('presence', { event: 'join' }, countShard)
      .on('presence', { event: 'leave' }, countShard)
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') return;
        // RLS requires authenticated JWT rows to have user_id = auth.uid().
        // React's user can be null briefly while Supabase session already exists — that caused 403 upserts.
        const { data: { session } } = await supabase.auth.getSession();
        const resolvedUserId = userId ?? session?.user?.id ?? null;
        await shardChannel.track({
          userId: resolvedUserId,
          deviceId: effectiveDeviceId,
          joinedAt: new Date().toISOString(),
        });

        if (deviceId) {
          registerDeviceSession(eventId, deviceId, resolvedUserId);
        }
      });

    // ── 2. Join the meta (aggregation) channel ──────────────────────
    const metaChannel = supabase.channel(metaName);
    metaChannelRef.current = metaChannel;

    const reportShardToMeta = () => {
      const count = countShard();
      void metaChannel.send({
        type: 'broadcast',
        event: 'shard_count',
        payload: { shard, count },
      });
    };

    metaChannel
      .on('broadcast', { event: 'shard_count' }, (payload) => {
        const parsed = parseShardCountPayload(payload);
        if (parsed) {
          shardCountsRef.current.set(parsed.shard, parsed.count);
          aggregateCounts();
        }
      })
      .on('broadcast', { event: 'like' }, (payload) => {
        const raw = payload as Record<string, unknown> | undefined;
        const inner = raw?.payload;
        const likeCountVal =
          inner && typeof inner === 'object' && inner !== null && 'likeCount' in inner
            ? (inner as { likeCount?: number }).likeCount
            : (raw as { likeCount?: number } | undefined)?.likeCount;
        if (likeCountVal != null) setLikeCount(likeCountVal);
      })
      .on('broadcast', { event: 'kick' }, (payload) => {
        const raw = payload as Record<string, unknown> | undefined;
        const inner = raw?.payload;
        const target =
          inner && typeof inner === 'object' && inner !== null && 'targetDeviceId' in inner
            ? (inner as { targetDeviceId?: string }).targetDeviceId
            : (raw as { targetDeviceId?: string } | undefined)?.targetDeviceId;
        if (target && target === deviceId) setIsKicked(true);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          reportShardToMeta();
          window.setTimeout(reportShardToMeta, 400);
          window.setTimeout(reportShardToMeta, 2000);
        }
      });

    // ── 3. Periodically report this shard's count to meta ───────────
    reportIntervalRef.current = setInterval(reportShardToMeta, SHARD_REPORT_INTERVAL);

    // ── 4. Periodically sync aggregated count to DB ─────────────────
    syncIntervalRef.current = setInterval(() => {
      const total = aggregateCounts();
      syncCountToDb(eventId, total);
    }, SYNC_TO_DB_INTERVAL);

    // ── 5. Fetch initial like count ─────────────────────────────────
    supabase
      .from('events')
      .select('like_count')
      .eq('id', eventId)
      .single()
      .then(({ data }) => {
        if (data?.like_count != null) setLikeCount(data.like_count);
      });

    // ── Cleanup ─────────────────────────────────────────────────────
    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }
      if (reportIntervalRef.current) {
        clearInterval(reportIntervalRef.current);
        reportIntervalRef.current = null;
      }
      shardChannel.untrack().then(() => supabase.removeChannel(shardChannel));
      supabase.removeChannel(metaChannel);
      shardChannelRef.current = null;
      metaChannelRef.current = null;
      shardCountsRef.current.clear();

      if (deviceId) {
        supabase
          .from('viewer_sessions')
          .update({ is_active: false, left_at: new Date().toISOString() })
          .eq('event_id', eventId)
          .eq('device_id', deviceId)
          .then(() => {});
      }
    };
  }, [eventId, userId, deviceId, enabled, aggregateCounts]);

  return { viewerCount, likeCount, isKicked };
}

/**
 * Broadcast a like to all viewers via the meta channel,
 * then persist via DB RPC.
 */
export async function broadcastLike(
  eventId: string,
  newLikeCount: number,
): Promise<void> {
  const metaName = `viewers:${eventId}:meta`;
  const channels = supabase.getChannels();
  const meta = channels.find((c) => c.topic === `realtime:${metaName}`);
  if (meta) {
    meta.send({
      type: 'broadcast',
      event: 'like',
      payload: { likeCount: newLikeCount },
    });
  }
  await supabase.rpc('increment_event_like_count', { event_id: eventId });
}

/**
 * For the broadcaster studio: subscribe to the meta channel only
 * to get aggregated viewer counts and likes without joining a shard.
 * Returns a cleanup function.
 */
export function subscribeBroadcasterToMeta(
  eventId: string,
  onViewerCount: (count: number) => void,
  onLikeCount: (count: number) => void,
): () => void {
  const metaName = `viewers:${eventId}:meta`;
  const shardCounts = new Map<number, number>();

  const aggregate = () => {
    let total = 0;
    shardCounts.forEach((c) => { total += c; });
    onViewerCount(total);
  };

  const metaChannel = supabase.channel(metaName);

  metaChannel
    .on('broadcast', { event: 'shard_count' }, (payload) => {
      const parsed = parseShardCountPayload(payload);
      if (parsed) {
        shardCounts.set(parsed.shard, parsed.count);
        aggregate();
      }
    })
    .on('broadcast', { event: 'like' }, (payload) => {
      const raw = payload as Record<string, unknown> | undefined;
      const inner = raw?.payload;
      const likeCountVal =
        inner && typeof inner === 'object' && inner !== null && 'likeCount' in inner
          ? (inner as { likeCount?: number }).likeCount
          : (raw as { likeCount?: number } | undefined)?.likeCount;
      if (likeCountVal != null) onLikeCount(likeCountVal);
    })
    .subscribe();

  return () => {
    supabase.removeChannel(metaChannel);
    shardCounts.clear();
  };
}

// ── Internal helpers ────────────────────────────────────────────────

async function registerDeviceSession(
  eventId: string,
  deviceId: string,
  userId: string | null,
): Promise<void> {
  try {
    await supabase.from('viewer_sessions').upsert(
      {
        event_id: eventId,
        device_id: deviceId,
        user_id: userId ?? null,
        last_seen: new Date().toISOString(),
        is_active: true,
      },
      { onConflict: 'event_id,device_id' },
    );
  } catch (err) {
    console.warn('[useViewerPresence] Session upsert failed:', err);
  }
}

async function syncCountToDb(eventId: string, count: number): Promise<void> {
  try {
    const { error } = await supabase.rpc('sync_viewer_count', {
      p_event_id: eventId,
      p_count: count,
    });
    if (error) {
      await supabase.from('events').update({ viewer_count: count }).eq('id', eventId);
    }
  } catch {
    try {
      await supabase.from('events').update({ viewer_count: count }).eq('id', eventId);
    } catch {
      /* Non-critical; presence + meta broadcast are source of truth for live */
    }
  }
}
