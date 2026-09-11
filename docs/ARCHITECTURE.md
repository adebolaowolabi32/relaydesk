# Architecture and limits

RelayDesk has two independently testable execution paths: a deterministic browser model and an actual local artifact-delivery lab. Their visual and engineering evidence is deliberately labeled separately.

## Browser model

`src/simulation.ts` owns the seeded request stream and state transitions. The interface and SVG topology project that state. The initial release creates 1,000 requests with seed 42, distributed across three home regions and arriving in groups of 25 over 40 simulation seconds. Surges add 500 more, capped at 2,000.

Each request transitions through queued → active → done, or active → retry → active, with failure after four attempts. Service slots are workers × replicas. A base transfer takes 1.4 seconds plus a deterministic client-dependent variation; cross-region service adds 0.7 seconds. Outages invalidate in-flight transfers. Corruption affects every third package ID served by that cache. Failed transfers wait 1, 2 or 4 simulation seconds before trying again.

Adaptive routing favors a healthy home cache, then a healthy cache with free capacity, penalizing the last failed cache. Pinned routing only uses the request's home region. This is a simple policy, not an implementation of a commercial CDN or global traffic director. Replicas increase modeled concurrency without a warm-up delay. There is no actual DNS, congestion model, inter-region replication protocol, network partition consensus or cloud cost integration.

Counts are exact for modeled clients. The map renders at most 72 active packet figures to limit visual clutter. Geography is illustrative. Queue metrics count arrived, ready requests; future scheduled arrivals and delayed retries have not yet entered the ready queue. p95 includes waiting time for successful requests only. Read it alongside failures and pending work.

Cost credits = online worker-seconds × 0.01 + cross-region attempts × 0.05 + total attempts × 0.002. Worker time accrues while requests remain unfinished. These coefficients are invented scenario units.

The main simulation uses steps no longer than 0.2 seconds. Hidden tabs and other app workspaces pause it, with no wall-clock catch-up. Experiments run in a separate Web Worker and use isolated state copies, so they do not block or change the live network. Refresh intentionally resets the model.

## Local engine

`server/engine.mjs` coordinates work. `server/worker.mjs` performs actual HTTP fetches and SHA-256 verification in separate worker threads. `server/http.mjs` provides a loopback API and a separate HTTP fixture server with EU, US and AP cache paths. The release manifest and bytes are original, fixed synthetic fixtures in `server/manifest.mjs`.

The engine uses Node's built-in [SQLite API](https://nodejs.org/download/release/v22.13.0/docs/api/sqlite.html) and [worker threads](https://nodejs.org/download/release/latest-v22.x/docs/api/worker_threads.html). SQLite WAL, FULL synchronization, and short `BEGIN IMMEDIATE` transactions protect claims and terminal transitions across coordinators sharing the same local database. The public CLI runs one coordinator with four concurrent jobs. The integration suite exercises two independent database connections and coordinators sharing sixteen jobs; this is local concurrency evidence, not a multi-host benchmark.

### Delivery lifecycle

1. Submit a fixed release for a validated client ID. A unique `(client, release)` constraint and deterministic ID make repeated submissions idempotent.
2. Atomically claim a ready job, increment its attempt count, create an attempt record, and assign a random ownership token with a five-second lease.
3. A worker downloads from its assigned cache with a 1.5-second timeout and a strict byte limit. Attempts rotate EU → US → AP → EU. Redirects are rejected. HTTP errors, timeouts, length mismatches and SHA-256 failures return bounded error codes.
4. The coordinator verifies length and digest again, writes a unique temporary file, synchronizes it, and atomically renames it to the content-addressed destination. The directory is synchronized before acknowledging delivery.
5. A fenced transaction marks the job done only if the original token still owns an unexpired active lease. Failed attempts become queued with exponential backoff or failed after four attempts.
6. On lease expiry, the next claimant records the interrupted attempt and requeues remaining work. Expired owners cannot commit completion. Process shutdown stops active workers; their leases recover after restart.

Worker termination and timeout handling do not mark bytes delivered. All successful jobs reference verified bytes; the same content hash can be shared by many client records. If a stale owner finishes writing before losing its completion race, it can only write the same digest-verified content. A crash between file publication and database completion can cause another fetch, but cannot acknowledge unverified content. This is at-least-once fetching with fenced state transitions, not a claim of exactly-once network delivery.

A worker result has an outer deadline 500ms beyond the HTTP timeout; configurable leases must exceed that deadline. No heartbeats are necessary for these bounded, small fixture transfers. Larger artifacts or slower storage would require renewed leases and streaming storage. Failed filesystem operations never produce a done record, but may leave a temporary file for operator inspection.

### Boundaries

The lab is single-machine software. It uses local SQLite and three paths on a local fixture HTTP server, not three deployed regions. It has no multi-host consensus, distributed object storage, real customer endpoints, authentication service or remote administration. It only exposes a fixed demo, not arbitrary upload/download URLs. Backend faults and workloads are independent of the browser map.

The local API binds to loopback, rejects unexpected Host and browser Origin headers, and requires JSON for mutations. The browser permits local engine connections only from localhost. Hosted portfolio builds make no engine requests. The UI has no credentials and the engine needs none.

SQLite schema version 1 is initialized on first run. Future incompatible schema changes would require a versioned migration; this release does not claim a migration framework. Keep a data directory on a local filesystem. For new experiments, use a new directory rather than removing prior records.
