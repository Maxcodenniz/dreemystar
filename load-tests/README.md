# Dreemystar Load Tests

Load test suite using [k6](https://k6.io/) to validate platform scalability.

## Prerequisites

```bash
brew install k6
```

## Configuration

Before running, set your environment variables:

```bash
export K6_SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
export K6_SUPABASE_ANON_KEY="eyJ..."
export K6_TEST_EVENT_ID="uuid-of-a-real-event"
export K6_TEST_USER_JWT="eyJ..."   # optional, from browser dev tools
```

Or edit `config.js` directly.

## Test Descriptions

| Test | File | What it tests |
|------|------|---------------|
| **Agora Token** | `test-agora-token.js` | Edge Function throughput under burst (up to 500 VUs) |
| **Database Queries** | `test-database-queries.js` | PostgREST read performance (events, tickets, profiles) |
| **Realtime Presence** | `test-realtime-presence.js` | WebSocket connection capacity for sharded Presence |
| **Webhooks** | `test-webhooks.js` | Webhook endpoint resilience and signature rejection |
| **Full Suite** | `test-full-suite.js` | End-to-end viewer journey (browse → detail → ticket → token) |

## Running

### Individual tests

```bash
k6 run load-tests/test-agora-token.js
k6 run load-tests/test-database-queries.js
k6 run load-tests/test-realtime-presence.js
k6 run load-tests/test-webhooks.js
```

### Full viewer journey (recommended first test)

```bash
k6 run load-tests/test-full-suite.js
```

### Quick smoke test (10 VUs, 30s)

```bash
k6 run --vus 10 --duration 30s load-tests/test-database-queries.js
```

### Custom load levels

```bash
k6 run --stage 30s:100,2m:500,1m:1000,30s:0 load-tests/test-agora-token.js
```

## Understanding Results

Key metrics to watch:

- **http_req_duration (p95)** — 95th percentile latency. Under 2s is good, under 500ms is excellent.
- **errors rate** — Should stay under 5%. Any higher indicates capacity issues.
- **ws_connections_established** — For Realtime tests, how many WebSockets opened successfully.
- **vus_max** — Peak number of concurrent virtual users reached.

## Scaling Beyond Local Machine

A single machine can typically simulate ~1,000–2,000 concurrent VUs. For 500K:

1. **k6 Cloud** — `k6 cloud run load-tests/test-full-suite.js` (requires Grafana Cloud account)
2. **Distributed k6** — Run k6 on multiple VMs / Kubernetes pods pointing at the same target
3. **AWS/GCP spot instances** — Spin up 50+ machines each running 10K VUs

The local tests validate correctness and measure per-request overhead. The extrapolation to 500K is done from these measurements.
