import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  reduce,
  count,
  comparison,
  type State,
} from "../src/simulation";
function advance(s: State, seconds: number) {
  for (let i = 0; i < seconds; i++) s = reduce(s, { type: "tick", dt: 1 });
  return s;
}
function invariants(s: State) {
  assert.equal(new Set(s.jobs.map((j) => j.id)).size, s.jobs.length);
  assert.equal(
    ["queued", "active", "retry", "done", "failed"].reduce(
      (n, status) => n + count(s, status as Parameters<typeof count>[1]),
      0,
    ),
    s.jobs.length,
  );
  for (const j of s.jobs) {
    assert.ok(j.attempts >= 0 && j.attempts <= 4);
    if (j.status === "done") assert.ok(j.attempts > 0 && j.duration > 0);
  }
  for (const n of s.nodes) {
    assert.ok(n.workers >= 2 && n.workers <= 12);
  }
}
test("replay is deterministic and does not mutate the starting state", () => {
  const a = initialState(),
    copy = structuredClone(a);
  assert.deepEqual(advance(a, 20), advance(initialState(), 20));
  assert.deepEqual(a, copy);
});
test("normal rollout delivers all 1000 clients once", () => {
  const s = advance(initialState(), 240);
  assert.equal(count(s, "done"), 1000);
  assert.equal(count(s, "failed"), 0);
  assert.equal(s.rejected, 0);
  invariants(s);
});
test("outage reroutes transfers; a permanent region outage can still complete the mission", () => {
  let s = advance(initialState(), 15);
  s = reduce(s, { type: "outage", id: "eu" });
  s = advance(s, 345);
  assert.equal(count(s, "done"), 1000);
  assert.ok(s.retries > 0);
  assert.ok(s.crossings > 0);
  assert.equal(s.hadOutage, true);
  invariants(s);
});
test("corrupt packages are rejected and retried through healthy caches", () => {
  let s = reduce(initialState(), { type: "corrupt", id: "eu" });
  s = advance(s, 240);
  assert.ok(s.rejected > 0);
  assert.equal(count(s, "done"), 1000);
  assert.equal(count(s, "failed"), 0);
  invariants(s);
});
test("without failover, affected clients exhaust bounded retries", () => {
  let s = reduce(initialState(), { type: "failover" });
  s = reduce(s, { type: "outage", id: "eu" });
  s = advance(s, 240);
  const failed = s.jobs.filter((j) => j.status === "failed");
  assert.ok(failed.length > 0);
  assert.ok(failed.every((j) => j.home === "eu" && j.attempts === 4));
  invariants(s);
});
test("worker scaling and replicas improve throughput under the same demand", () => {
  const base = advance(initialState(), 60);
  let scaled = initialState();
  for (const id of ["us", "eu", "ap"] as const) {
    scaled = reduce(scaled, { type: "workers", id, delta: 4 });
    scaled = reduce(scaled, { type: "replica", id });
  }
  scaled = advance(scaled, 60);
  assert.ok(count(scaled, "done") > count(base, "done"));
  assert.equal(scaled.jobs.length, base.jobs.length);
});
test("surge is capped at 2000 and controls remain bounded", () => {
  let s = initialState();
  for (let i = 0; i < 20; i++) {
    s = reduce(s, { type: "surge" });
    s = reduce(s, { type: "workers", id: "eu", delta: 2 });
  }
  assert.equal(s.jobs.length, 2000);
  assert.equal(s.nodes.find((n) => n.id === "eu")!.workers, 12);
  invariants(advance(s, 10));
});
test("comparison uses the same workload and exposes the failure tradeoff", () => {
  const [pinned, adaptive] = comparison();
  assert.equal(pinned.delivered + pinned.failed + pinned.pending, 1000);
  assert.equal(adaptive.delivered + adaptive.failed + adaptive.pending, 1000);
  assert.ok(adaptive.delivered > pinned.delivered);
  assert.equal(adaptive.failed, 0);
  assert.ok(adaptive.pending > 0);
  assert.ok(pinned.failed > 0);
});
test("reset clears incidents and invalid time does not advance simulation", () => {
  let s = reduce(initialState(), { type: "outage", id: "eu" });
  s = advance(s, 5);
  assert.deepEqual(reduce(s, { type: "reset" }), initialState());
  assert.deepEqual(
    reduce(initialState(), { type: "tick", dt: NaN }),
    initialState(),
  );
});
