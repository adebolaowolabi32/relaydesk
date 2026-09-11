import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createHash } from "node:crypto";
import { Engine } from "../server/engine.mjs";
import { createFixture, createApi } from "../server/http.mjs";
import { digest } from "../server/manifest.mjs";
async function setup(t, options = {}) {
  const dir = await mkdtemp(join(tmpdir(), "relaydesk-test-"));
  const fixture = await createFixture({ port: 0, delay: 20 });
  const engine = await Engine.create({
    dir,
    cacheBase: fixture.url,
    backoffMs: 20,
    ...options,
  });
  t.after(async () => {
    await engine.stop();
    await fixture.close();
    await rm(dir, { recursive: true, force: true });
  });
  return { dir, fixture, engine };
}
async function until(fn, timeout = 10000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (fn()) return;
    await delay(30);
  }
  throw new Error("Timed out waiting for engine");
}
test("real HTTP worker transfers verify bytes and duplicate submissions share one job", async (t) => {
  const { engine, dir } = await setup(t);
  const job = engine.submit("client-a");
  assert.equal(engine.submit("client-a").id, job.id);
  engine.start();
  await until(() => engine.state().summary.done === 1);
  const file = await readFile(join(dir, "artifacts", digest));
  assert.equal(createHash("sha256").update(file).digest("hex"), digest);
  assert.equal(engine.state().jobs.length, 1);
  assert.deepEqual(
    engine.attempts(job.id).map((a) => a.outcome),
    ["verified"],
  );
});
test("EU outage then US corruption reroutes actual transfers to clean AP cache", async (t) => {
  const { engine, fixture } = await setup(t);
  fixture.faults.outage = true;
  fixture.faults.corruption = true;
  const job = engine.submit("resilient-client");
  engine.start();
  await until(() => engine.state().summary.done === 1);
  assert.deepEqual(
    engine.attempts(job.id).map((a) => [a.region, a.outcome]),
    [
      ["eu", "http_503"],
      ["us", "checksum_mismatch"],
      ["ap", "verified"],
    ],
  );
});
test("all unavailable caches exhaust exactly four attempts without publishing bytes", async (t) => {
  const { engine, fixture, dir } = await setup(t);
  fixture.faults.allOffline = true;
  const job = engine.submit("failed-client");
  engine.start();
  await until(() => engine.state().summary.failed === 1);
  assert.equal(engine.attempts(job.id).length, 4);
  assert.deepEqual(await readdir(join(dir, "artifacts")), []);
});
test("two coordinators safely share durable jobs and never commit duplicate attempts", async (t) => {
  const { engine, fixture, dir } = await setup(t, { concurrency: 2 });
  const second = await Engine.create({
    dir,
    cacheBase: fixture.url,
    concurrency: 2,
  });
  t.after(() => second.stop());
  for (let i = 0; i < 16; i++) engine.submit(`parallel-${i}`);
  engine.start();
  second.start();
  await until(() => engine.state().summary.done === 16);
  for (const job of engine.state().jobs) {
    assert.equal(engine.attempts(job.id).length, 1);
    assert.equal(engine.attempts(job.id)[0].outcome, "verified");
  }
  assert.equal(fixture.requests.length, 16);
});
test("expired ownership is fenced off and the next owner can recover the job", async (t) => {
  const { engine, fixture, dir } = await setup(t, {
    leaseMs: 950,
    timeout: 200,
  });
  const job = engine.submit("lease-client"),
    claim = engine.claim();
  const second = await Engine.create({
    dir,
    cacheBase: fixture.url,
    leaseMs: 950,
    timeout: 200,
  });
  t.after(() => second.stop());
  await delay(980);
  const next = second.claim();
  assert.equal(next.id, job.id);
  assert.notEqual(next.token, claim.token);
  assert.equal(engine.finish(claim, { ok: true }), false);
  assert.equal(engine.attempts(job.id)[0].outcome, "lease_expired");
  second.process(next);
  await until(() => second.state().summary.done === 1);
  assert.equal(second.attempts(job.id).at(-1).outcome, "verified");
});
test("stopped engine reopens persisted active work and recovers after lease expiry", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "relaydesk-restart-"));
  const fixture = await createFixture({ port: 0 });
  let engine = await Engine.create({
    dir,
    cacheBase: fixture.url,
    leaseMs: 950,
    timeout: 200,
  });
  t.after(async () => {
    await engine.stop();
    await fixture.close();
    await rm(dir, { recursive: true, force: true });
  });
  const job = engine.submit("restart-client");
  engine.claim();
  await engine.stop();
  engine = await Engine.create({
    dir,
    cacheBase: fixture.url,
    leaseMs: 950,
    timeout: 200,
  });
  engine.start();
  await until(() => engine.state().summary.done === 1);
  assert.equal(engine.attempts(job.id)[0].outcome, "lease_expired");
  assert.equal(engine.attempts(job.id)[1].outcome, "verified");
});
test("HTTP timeouts retry and remain bounded", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "relaydesk-timeout-"));
  const fixture = await createFixture({ port: 0, delay: 350 });
  const engine = await Engine.create({
    dir,
    cacheBase: fixture.url,
    timeout: 80,
    backoffMs: 10,
  });
  t.after(async () => {
    await engine.stop();
    await fixture.close();
    await rm(dir, { recursive: true, force: true });
  });
  const job = engine.submit("slow-client");
  engine.start();
  await until(() => engine.state().summary.failed === 1);
  assert.equal(engine.attempts(job.id).length, 4);
  assert.ok(engine.attempts(job.id).every((a) => a.outcome === "timeout"));
});
test("API validates browser origins, JSON and fault values; repeated demo deduplicates", async (t) => {
  const { engine, fixture } = await setup(t);
  const api = await createApi(engine, fixture, { port: 0 });
  t.after(() => api.close());
  const denied = await fetch(api.url + "/api/demo", {
    method: "POST",
    headers: {
      Origin: "https://example.com",
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(denied.status, 403);
  assert.equal(engine.state().jobs.length, 0);
  const invalid = await fetch(api.url + "/api/faults", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"outage":"true"}',
  });
  assert.equal(invalid.status, 400);
  for (let i = 0; i < 2; i++) {
    const res = await fetch(api.url + "/api/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(res.status, 200);
  }
  assert.equal(engine.state().jobs.length, 24);
  assert.throws(() => engine.submit("../secret"), /invalid_client/);
});
test("terminating an actual worker schedules a retry and completes under a new worker", async (t) => {
  const { engine } = await setup(t);
  const job = engine.submit("interrupted-worker");
  engine.start();
  await until(() => engine.tasks.size === 1);
  await [...engine.tasks.values()][0].worker.terminate();
  await until(() => engine.state().summary.done === 1);
  const attempts = engine.attempts(job.id);
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].outcome, "worker_exit");
  assert.equal(attempts[1].outcome, "verified");
});
