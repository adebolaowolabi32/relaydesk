# Architecture and limits

RelayDesk has a browser simulation and a separate Node.js engine that transfers files over HTTP. They run different workloads: the browser models regional outages, while the local engine tests file verification and worker recovery.

## Browser model

`src/simulation.ts` owns the seeded request stream and state transitions. The interface and SVG topology project that state. The initial release creates 1,000 requests with seed 42, distributed across three home regions and arriving in groups of 25 over 40 simulation seconds. Surges add 500 more, capped at 2,000.

Each request transitions through queued → active → done, or active → retry → active, with failure after four attempts. Service slots are workers × replicas. A base transfer takes 1.4 seconds plus a deterministic client-dependent variation; cross-region service adds 0.7 seconds. Outages invalidate in-flight transfers. Corruption affects every third package ID served by that cache. Failed transfers wait 1, 2 or 4 simulation seconds before trying again.

Adaptive routing favors a healthy home cache, then a healthy cache with free capacity, penalizing the last failed cache. Pinned routing only uses the request's home region. The policy models cache selection and failover. Replicas increase modeled concurrency immediately. DNS, congestion, inter-region replication, network partition consensus and cloud billing are outside the model's scope.

Counts are exact for modeled clients. The map renders at most 72 active packet figures to limit visual clutter. Geography is illustrative. Queue metrics count arrived, ready requests; scheduled arrivals and delayed retries enter the ready queue when they become eligible. p95 includes waiting time for successful requests only. Read it alongside failures and pending work.

Cost credits = online worker-seconds × 0.01 + cross-region attempts × 0.05 + total attempts × 0.002. Worker time accrues while requests remain unfinished. These coefficients are invented scenario units.

The main simulation uses steps no longer than 0.2 seconds. Hidden tabs and other app workspaces pause it, resuming from the paused simulation time. Experiments run in a separate Web Worker and use isolated state copies, keeping experiment work separate from the live network. Refresh intentionally resets the model.

## Local engine

`server/engine.mjs` coordinates work. `server/worker.mjs` performs actual HTTP fetches and SHA-256 verification in separate worker threads. `server/http.mjs` provides a loopback API and a separate HTTP fixture server with EU, US and AP cache paths. The release manifest and bytes are original, fixed synthetic fixtures in `server/manifest.mjs`.

The engine uses Node's built-in [SQLite API](https://nodejs.org/download/release/v22.13.0/docs/api/sqlite.html) and [worker threads](https://nodejs.org/download/release/latest-v22.x/docs/api/worker_threads.html). SQLite WAL, FULL synchronization, and short `BEGIN IMMEDIATE` transactions protect claims and terminal transitions across coordinators sharing the same local database. The public CLI runs one coordinator with four concurrent jobs. The integration suite exercises two independent database connections and coordinators sharing sixteen jobs; these tests exercise concurrency on one machine.

### Delivery lifecycle

1. Submit a fixed release for a validated client ID. A unique `(client, release)` constraint and deterministic ID make repeated submissions idempotent.
2. Atomically claim a ready job, increment its attempt count, create an attempt record, and assign a random ownership token with a five-second lease.
3. A worker downloads from its assigned cache with a 1.5-second timeout and a strict byte limit. Attempts rotate EU → US → AP → EU. Redirects are rejected. HTTP errors, timeouts, length mismatches and SHA-256 failures return bounded error codes.
4. The coordinator verifies length and digest again, writes a unique temporary file, synchronizes it, and atomically renames it to the content-addressed destination. The directory is synchronized before acknowledging delivery.
5. A fenced transaction marks the job done only if the original token still owns an unexpired active lease. Failed attempts become queued with exponential backoff or failed after four attempts.
6. On lease expiry, the next claimant records the interrupted attempt and requeues remaining work. Completion requires a current lease owner. Process shutdown stops active workers; their leases recover after restart.

Delivery is recorded only after verification succeeds. All successful jobs reference verified bytes; the same content hash can be shared by many client records. If a stale owner finishes writing before losing its completion race, it can only write the same digest-verified content. A crash between file publication and database completion can cause another fetch, while completion still requires verified content. Fetching uses at-least-once delivery; ownership checks protect state transitions.

A worker result has an outer deadline 500ms beyond the HTTP timeout; configurable leases must exceed that deadline. Fixed leases cover these bounded, small fixture transfers. Larger artifacts or slower storage would require renewed leases and streaming storage. Failed filesystem operations never produce a done record, but may leave a temporary file for operator inspection.

### Boundaries

The lab is single-machine software. It uses local SQLite and three paths on a local fixture HTTP server. Multi-host deployment would require consensus, distributed storage, authentication and remote administration. Transfers use fixed demo URLs. Backend faults and workloads are independent of the browser map.

The local API binds to loopback, rejects unexpected Host and browser Origin headers, and requires JSON for mutations. The browser permits local engine connections only from localhost. Hosted portfolio builds run the browser simulation. The local engine uses an unauthenticated loopback API.

SQLite schema version 1 is initialized on first run. Future incompatible schema changes require implementing versioned migrations. Keep a data directory on a local filesystem. For new experiments, use a new directory and retain prior records.
