import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { EDGE_FUNCTION_URL, authHeaders, TEST_EVENT_ID, TEST_USER_JWT } from './config.js';

const errorRate = new Rate('errors');
const tokenLatency = new Trend('token_generation_latency', true);

/**
 * Agora Token Generation Load Test
 *
 * Simulates a burst of viewers requesting audience tokens simultaneously,
 * which is exactly what happens when an event goes live and thousands of
 * ticket holders hit "Watch" at the same time.
 *
 * Stages:
 *   1. Warm-up:   ramp to 50 VUs over 30s
 *   2. Sustained: hold 200 VUs for 2 minutes (moderate load)
 *   3. Spike:     ramp to 500 VUs for 1 minute (simulates event start rush)
 *   4. Cool-down: ramp back to 0
 */
export const options = {
  stages: [
    { duration: '30s',  target: 50 },
    { duration: '2m',   target: 200 },
    { duration: '1m',   target: 500 },
    { duration: '30s',  target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'],  // 95th percentile under 3s
    errors: ['rate<0.05'],               // less than 5% error rate
  },
};

export default function () {
  const channelName = `event_${TEST_EVENT_ID}`;
  const payload = JSON.stringify({
    channelName,
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

  const success = check(res, {
    'status is 200 or 403': (r) => r.status === 200 || r.status === 403,
    'response has token or error': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.token !== undefined || body.error !== undefined;
      } catch {
        return false;
      }
    },
    'latency under 3s': (r) => r.timings.duration < 3000,
  });

  errorRate.add(!success);
  sleep(Math.random() * 2 + 0.5);
}
