import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { SUPABASE_URL, headers, TEST_EVENT_ID } from './config.js';

const errorRate = new Rate('errors');
const eventsListLatency = new Trend('events_list_latency', true);
const eventDetailLatency = new Trend('event_detail_latency', true);
const ticketLookupLatency = new Trend('ticket_lookup_latency', true);
const profileLatency = new Trend('profile_lookup_latency', true);

/**
 * Database Query Load Test
 *
 * Simulates the read-heavy workload from viewers browsing the platform:
 *   - Fetching the events list (home page, schedule)
 *   - Fetching a single event detail (watch page)
 *   - Ticket ownership lookups (before joining stream)
 *   - Profile lookups (artist pages)
 *
 * These queries hit Supabase PostgREST which connects to your PostgreSQL instance.
 * This test reveals connection pool saturation and slow query patterns.
 */
export const options = {
  stages: [
    { duration: '20s',  target: 50 },
    { duration: '2m',   target: 300 },
    { duration: '1m',   target: 500 },
    { duration: '30s',  target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    errors: ['rate<0.05'],
  },
};

const REST_URL = `${SUPABASE_URL}/rest/v1`;

export default function () {
  group('events_list', () => {
    const res = http.get(
      `${REST_URL}/events?select=id,title,start_time,status,image_url,artist_id,price&status=eq.upcoming&order=start_time.asc&limit=20`,
      { headers, timeout: '8s' },
    );
    eventsListLatency.add(res.timings.duration);
    const ok = check(res, {
      'events list 200': (r) => r.status === 200,
      'returns array': (r) => {
        try { return Array.isArray(JSON.parse(r.body)); } catch { return false; }
      },
    });
    errorRate.add(!ok);
  });

  group('event_detail', () => {
    const res = http.get(
      `${REST_URL}/events?select=*,profiles(id,full_name,avatar_url,bio)&id=eq.${TEST_EVENT_ID}`,
      { headers, timeout: '8s' },
    );
    eventDetailLatency.add(res.timings.duration);
    const ok = check(res, {
      'event detail 200': (r) => r.status === 200,
    });
    errorRate.add(!ok);
  });

  group('ticket_lookup', () => {
    const fakeUserId = '00000000-0000-0000-0000-000000000000';
    const res = http.get(
      `${REST_URL}/tickets?select=id,status&event_id=eq.${TEST_EVENT_ID}&user_id=eq.${fakeUserId}&status=eq.active&limit=1`,
      { headers, timeout: '8s' },
    );
    ticketLookupLatency.add(res.timings.duration);
    const ok = check(res, {
      'ticket lookup 200': (r) => r.status === 200,
    });
    errorRate.add(!ok);
  });

  group('profile_lookup', () => {
    const res = http.get(
      `${REST_URL}/profiles?select=id,full_name,avatar_url,bio,user_type&user_type=eq.artist&limit=20`,
      { headers, timeout: '8s' },
    );
    profileLatency.add(res.timings.duration);
    const ok = check(res, {
      'profiles 200': (r) => r.status === 200,
    });
    errorRate.add(!ok);
  });

  sleep(Math.random() * 1.5 + 0.3);
}
