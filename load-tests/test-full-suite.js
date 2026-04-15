import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { SUPABASE_URL, EDGE_FUNCTION_URL, headers, authHeaders, TEST_EVENT_ID, TEST_USER_JWT } from './config.js';

const errorRate = new Rate('errors');
const tokenLatency = new Trend('token_gen_latency', true);
const eventsLatency = new Trend('events_query_latency', true);
const ticketLatency = new Trend('ticket_query_latency', true);

const REST_URL = `${SUPABASE_URL}/rest/v1`;

/**
 * Full Integration Load Test
 *
 * Simulates a realistic viewer journey:
 *   1. Browse events (home page)
 *   2. View event details
 *   3. Check ticket ownership
 *   4. Request Agora audience token
 *
 * This is the combined flow that every viewer goes through when
 * joining a live stream. It tests the full critical path.
 *
 * Ramps from 0 → 100 → 300 → 100 → 0 VUs.
 * Each VU represents one viewer going through the full flow.
 */
export const options = {
  scenarios: {
    viewer_journey: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 },
        { duration: '1m',  target: 100 },
        { duration: '2m',  target: 300 },
        { duration: '1m',  target: 100 },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<4000', 'p(99)<8000'],
    errors: ['rate<0.05'],
    token_gen_latency: ['p(95)<3000'],
    events_query_latency: ['p(95)<1500'],
    ticket_query_latency: ['p(95)<1000'],
  },
};

export default function () {
  // Step 1: Browse events (home page load)
  group('1_browse_events', () => {
    const res = http.get(
      `${REST_URL}/events?select=id,title,start_time,status,image_url,price&order=start_time.asc&limit=20`,
      { headers, timeout: '8s' },
    );
    eventsLatency.add(res.timings.duration);
    const ok = check(res, { 'events loaded': (r) => r.status === 200 });
    errorRate.add(!ok);
  });

  sleep(Math.random() * 2 + 1);

  // Step 2: View event detail
  group('2_event_detail', () => {
    const res = http.get(
      `${REST_URL}/events?select=*&id=eq.${TEST_EVENT_ID}`,
      { headers, timeout: '8s' },
    );
    const ok = check(res, { 'event detail loaded': (r) => r.status === 200 });
    errorRate.add(!ok);
  });

  sleep(Math.random() * 1 + 0.5);

  // Step 3: Check ticket ownership
  group('3_ticket_check', () => {
    const fakeUserId = '00000000-0000-0000-0000-000000000000';
    const res = http.get(
      `${REST_URL}/tickets?select=id,status&event_id=eq.${TEST_EVENT_ID}&user_id=eq.${fakeUserId}&status=eq.active&limit=1`,
      { headers, timeout: '8s' },
    );
    ticketLatency.add(res.timings.duration);
    const ok = check(res, { 'ticket check ok': (r) => r.status === 200 });
    errorRate.add(!ok);
  });

  sleep(Math.random() * 0.5);

  // Step 4: Request Agora token
  group('4_agora_token', () => {
    const payload = JSON.stringify({
      channelName: `event_${TEST_EVENT_ID}`,
      role: 'audience',
      expireTime: 3600,
      uid: Math.floor(Math.random() * 100000),
    });
    const hdrs = TEST_USER_JWT ? authHeaders(TEST_USER_JWT) : authHeaders();
    const res = http.post(`${EDGE_FUNCTION_URL}/generate-agora-token`, payload, {
      headers: hdrs,
      timeout: '10s',
    });
    tokenLatency.add(res.timings.duration);
    // 200 = success, 403 = no ticket (expected for fake user)
    const ok = check(res, {
      'token endpoint responsive': (r) => r.status === 200 || r.status === 403,
    });
    errorRate.add(!ok);
  });

  sleep(Math.random() * 3 + 1);
}

export function handleSummary(data) {
  const p95 = (m) => m?.values?.['p(95)'] ? `${m.values['p(95)'].toFixed(0)}ms` : 'N/A';
  const rate = (m) => m?.values?.rate !== undefined ? `${(m.values.rate * 100).toFixed(1)}%` : 'N/A';

  const summary = `
╔══════════════════════════════════════════════════════════════╗
║                  DREEMYSTAR LOAD TEST RESULTS               ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  Events query (p95):     ${p95(data.metrics.events_query_latency).padEnd(10)}                       ║
║  Ticket lookup (p95):    ${p95(data.metrics.ticket_query_latency).padEnd(10)}                       ║
║  Token generation (p95): ${p95(data.metrics.token_gen_latency).padEnd(10)}                       ║
║  Overall HTTP (p95):     ${p95(data.metrics.http_req_duration).padEnd(10)}                       ║
║                                                              ║
║  Error rate:             ${rate(data.metrics.errors).padEnd(10)}                       ║
║  Total requests:         ${String(data.metrics.http_reqs?.values?.count || 0).padEnd(10)}                       ║
║  Total VUs (peak):       ${String(data.metrics.vus_max?.values?.value || 0).padEnd(10)}                       ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`;

  return {
    stdout: summary,
    'load-tests/results/full-suite-summary.json': JSON.stringify(data, null, 2),
  };
}
