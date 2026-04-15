import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { EDGE_FUNCTION_URL, SUPABASE_ANON_KEY } from './config.js';

const errorRate = new Rate('errors');
const webhookLatency = new Trend('webhook_latency', true);

/**
 * Webhook Endpoint Resilience Test
 *
 * Simulates rapid webhook/callback deliveries to test idempotency and throughput.
 * In production, Stripe (and other providers) may replay webhooks during
 * outages, causing burst traffic to these endpoints.
 *
 * This test sends requests WITHOUT valid auth, so all should
 * return 400/401 (verification failure). The goal is to
 * verify the endpoint stays responsive and doesn't crash under load.
 *
 * To test with valid payloads, you'd need the webhook secret and
 * proper signature generation — that's better done via Stripe CLI.
 */
export const options = {
  stages: [
    { duration: '15s', target: 20 },
    { duration: '1m',  target: 100 },
    { duration: '30s', target: 200 },
    { duration: '15s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<5000'],
    errors: ['rate<0.1'],
  },
};

export default function () {
  const res = http.post(
    `${EDGE_FUNCTION_URL}/pawapay-deposit-callback?token=invalid-load-test-token`,
    JSON.stringify({ depositId: 'loadtest', status: 'COMPLETED' }),
    {
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
      timeout: '10s',
    },
  );

  webhookLatency.add(res.timings.duration);

  const ok = check(res, {
    'callback responds (not 500)': (r) => r.status !== 500 && r.status !== 502 && r.status !== 503,
    'rejects invalid token': (r) => r.status === 401 || r.status === 400 || r.status === 403,
    'latency under 5s': (r) => r.timings.duration < 5000,
  });

  errorRate.add(!ok);
  sleep(Math.random() * 1 + 0.2);
}
