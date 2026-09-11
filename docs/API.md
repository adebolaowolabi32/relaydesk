# Local lab API

Base URL: `http://127.0.0.1:3012`. Start with `npm run engine`.

| Method | Path          | Behavior                                                                  |
| ------ | ------------- | ------------------------------------------------------------------------- |
| GET    | `/api/state`  | Job summaries, capped recent jobs/events, manifest and fixture settings   |
| POST   | `/api/demo`   | Submit or reuse 24 fixed client deliveries for `relay-agent-v2.8.0`       |
| POST   | `/api/faults` | Set `outage` (EU unavailable) and `corruption` (US serves modified bytes) |

POST requests require `Content-Type: application/json`. Fault settings must contain both booleans. Demo accepts `{}`. Responses include updated engine state. The interface refreshes explicitly; it does not auto-poll or tie the local workload to the map animation.

```sh
curl http://127.0.0.1:3012/api/state
curl -X POST http://127.0.0.1:3012/api/faults \
  -H 'Content-Type: application/json' \
  -d '{"outage":true,"corruption":true}'
curl -X POST http://127.0.0.1:3012/api/demo \
  -H 'Content-Type: application/json' -d '{}'
```

Expected attempt sequence under those faults: EU returns `http_503`, US fails `checksum_mismatch`, AP completes as `verified`. Faults affect transfers that have not finished; changing fixtures does not change completed artifacts. Duplicate submissions do not retry terminal failed jobs or repeat completed jobs. Use a fresh data directory for another release experiment.

SQLite `jobs` and `attempts` tables retain the complete local record. The state endpoint returns up to 1,000 jobs and 30 recent events; it is a fixed local demonstration, not a general paginated operations API. Cache fixtures are available to workers on port 3013 under `/cache/{eu|us|ap}/artifact`.
