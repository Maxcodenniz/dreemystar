import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Rate, Counter, Trend } from 'k6/metrics';
import { SUPABASE_URL, SUPABASE_ANON_KEY, TEST_EVENT_ID } from './config.js';

const wsErrors = new Rate('ws_errors');
const wsConnected = new Counter('ws_connections_established');
const wsLatency = new Trend('ws_connect_latency', true);

/**
 * Supabase Realtime WebSocket + Presence Load Test
 *
 * Simulates viewers connecting to the sharded Presence channels.
 * Each VU:
 *   1. Opens a WebSocket to Supabase Realtime
 *   2. Joins its assigned shard channel (viewers:{eventId}:shard_{n})
 *   3. Tracks presence (simulates a viewer being "online")
 *   4. Stays connected for 60s (simulating viewing duration)
 *   5. Disconnects
 *
 * This tests the maximum number of concurrent Realtime connections
 * your Supabase instance can sustain.
 *
 * NOTE: k6 WebSocket VUs are limited by your local machine's capacity.
 * For a full 500K test, you'd need a distributed k6 cloud run.
 * This local test validates the connection flow and measures per-connection overhead.
 */

const NUM_SHARDS = 64;

export const options = {
  stages: [
    { duration: '30s', target: 100 },
    { duration: '2m',  target: 500 },
    { duration: '1m',  target: 1000 },
    { duration: '2m',  target: 1000 },  // hold at peak
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    ws_errors: ['rate<0.1'],
  },
};

function shardIndex(deviceId) {
  let hash = 0;
  for (let i = 0; i < deviceId.length; i++) {
    hash = ((hash << 5) - hash + deviceId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % NUM_SHARDS;
}

export default function () {
  const deviceId = `loadtest-${__VU}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const shard = shardIndex(deviceId);
  const channelTopic = `realtime:viewers:${TEST_EVENT_ID}:shard_${shard}`;

  const wsUrl = SUPABASE_URL.replace('https://', 'wss://') +
    `/realtime/v1/websocket?apikey=${SUPABASE_ANON_KEY}&vsn=1.0.0`;

  const startTime = Date.now();

  const res = ws.connect(wsUrl, {}, function (socket) {
    let joined = false;
    let heartbeatInterval = null;

    socket.on('open', () => {
      wsLatency.add(Date.now() - startTime);
      wsConnected.add(1);

      // Send Phoenix join message
      socket.send(JSON.stringify({
        topic: channelTopic,
        event: 'phx_join',
        payload: {
          config: {
            presence: { key: deviceId },
          },
        },
        ref: '1',
      }));

      // Phoenix heartbeat every 30s to keep connection alive
      heartbeatInterval = setInterval(() => {
        socket.send(JSON.stringify({
          topic: 'phoenix',
          event: 'heartbeat',
          payload: {},
          ref: Date.now().toString(),
        }));
      }, 30000);
    });

    socket.on('message', (msg) => {
      try {
        const data = JSON.parse(msg);
        if (data.event === 'phx_reply' && data.payload?.status === 'ok' && !joined) {
          joined = true;
          // Track presence after joining
          socket.send(JSON.stringify({
            topic: channelTopic,
            event: 'presence_state',
            payload: {},
            ref: '2',
          }));
        }
      } catch {
        // ignore parse errors on binary frames
      }
    });

    socket.on('error', (e) => {
      wsErrors.add(1);
    });

    // Stay connected for 60–90 seconds (simulating a viewer watching)
    const viewDuration = 60 + Math.random() * 30;
    sleep(viewDuration);

    if (heartbeatInterval) clearInterval(heartbeatInterval);
    socket.close();
  });

  const ok = check(res, {
    'WebSocket connected': (r) => r && r.status === 101,
  });
  wsErrors.add(!ok);

  sleep(Math.random() * 2);
}
