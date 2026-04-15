/**
 * HTTP load test for the static SPA shell (Vercel serves index.html for all routes).
 *
 * Usage:
 *   LOAD_TEST_URL=https://your-app.vercel.app npm run load-test
 *   LOAD_TEST_CONNECTIONS=50 LOAD_TEST_DURATION=30 npm run load-test
 *
 * Defaults are conservative to avoid hammering production; raise only when intentional.
 */
import autocannon from 'autocannon';

const base = process.env.LOAD_TEST_URL?.trim();
const duration = Math.max(5, Number(process.env.LOAD_TEST_DURATION || 20));
const connections = Math.max(1, Number(process.env.LOAD_TEST_CONNECTIONS || 25));
const pipelining = Math.max(1, Number(process.env.LOAD_TEST_PIPELINING || 1));

if (!base?.startsWith('http')) {
  console.error('Set LOAD_TEST_URL to a full URL, e.g. https://your-project.vercel.app');
  process.exit(1);
}

const paths = ['/', '/live-events', '/news', '/login'].map((path) => ({
  method: 'GET',
  path,
  headers: {
    accept: 'text/html,application/xhtml+xml',
    'accept-encoding': 'gzip, deflate, br',
  },
}));

console.log(`Target: ${base}`);
console.log(`Duration: ${duration}s | Connections: ${connections} | Pipelining: ${pipelining}`);
console.log(`Paths: ${paths.map((p) => p.path).join(', ')}\n`);

const result = await autocannon({
  url: base,
  connections,
  duration,
  pipelining,
  requests: paths,
});

const r = result;
console.log('--- Results ---');
console.log(`Requests total: ${r.requests.total}`);
console.log(`Throughput avg: ${Math.round(r.throughput.mean / 1024)} KB/s`);
console.log(`Latency mean: ${Math.round(r.latency.mean)} ms (p99: ${Math.round(r.latency.p99)} ms)`);
console.log(`2xx: ${r['2xx'] ?? 0} | Non-2xx: ${r.non2xx ?? 0} | Errors: ${r.errors ?? 0}`);
if (r.timeouts) console.log(`Timeouts: ${r.timeouts}`);
console.log('\nRaw summary (autocannon):');
process.stdout.write(autocannon.printResult(result));
