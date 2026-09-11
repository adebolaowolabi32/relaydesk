import { DatabaseSync } from "node:sqlite";
import { Worker } from "node:worker_threads";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, rename, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { manifest, regions } from "./manifest.mjs";

export class Engine {
  static async create(options) {
    const dir = resolve(options.dir);
    await mkdir(join(dir, "artifacts"), { recursive: true });
    return new Engine({ ...options, dir });
  }
  constructor({
    dir,
    cacheBase,
    concurrency = 4,
    timeout = 1500,
    leaseMs = 5000,
    backoffMs = 150,
    maxAttempts = 4,
  }) {
    if (
      !Number.isInteger(concurrency) ||
      concurrency < 1 ||
      concurrency > 16 ||
      leaseMs <= timeout + 500
    )
      throw new Error("Invalid worker or lease configuration");
    this.dir = dir;
    this.cacheBase = cacheBase;
    this.concurrency = concurrency;
    this.timeout = timeout;
    this.leaseMs = leaseMs;
    this.backoffMs = backoffMs;
    this.maxAttempts = maxAttempts;
    this.stopped = false;
    this.tasks = new Map();
    this.fatal = null;
    this.db = new DatabaseSync(join(dir, "queue.sqlite"));
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=3000;
   CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,client TEXT NOT NULL,release TEXT NOT NULL,digest TEXT NOT NULL,size INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'queued',attempts INTEGER NOT NULL DEFAULT 0,ready INTEGER NOT NULL,lease_until INTEGER,token TEXT,region TEXT,error TEXT,created INTEGER NOT NULL,finished INTEGER,UNIQUE(client,release));
   CREATE TABLE IF NOT EXISTS attempts(token TEXT PRIMARY KEY,job_id TEXT NOT NULL,number INTEGER NOT NULL,region TEXT NOT NULL,started INTEGER NOT NULL,finished INTEGER,outcome TEXT NOT NULL,UNIQUE(job_id,number));
   CREATE INDEX IF NOT EXISTS jobs_ready ON jobs(status,ready);
   CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,time TEXT NOT NULL,text TEXT NOT NULL);
   PRAGMA user_version=1;`);
  }
  event(text) {
    this.db
      .prepare("INSERT INTO events(time,text) VALUES(?,?)")
      .run(new Date().toISOString(), text);
  }
  submit(client) {
    if (!/^[A-Za-z0-9-]{1,64}$/.test(client)) throw new Error("invalid_client");
    const id = createHash("sha256")
      .update(`${manifest.release}:${client}`)
      .digest("hex");
    const now = Date.now();
    const inserted = this.db
      .prepare(
        "INSERT OR IGNORE INTO jobs(id,client,release,digest,size,ready,created) VALUES(?,?,?,?,?,?,?)",
      )
      .run(
        id,
        client,
        manifest.release,
        manifest.digest,
        manifest.size,
        now,
        now,
      );
    if (inserted.changes)
      this.event(`Queued ${client} for ${manifest.release}.`);
    return this.db.prepare("SELECT * FROM jobs WHERE id=?").get(id);
  }
  claim() {
    const now = Date.now();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const expired = this.db
        .prepare(
          "SELECT id,token,attempts FROM jobs WHERE status='active' AND lease_until<=?",
        )
        .all(now);
      for (const job of expired) {
        this.db
          .prepare(
            "UPDATE attempts SET outcome='lease_expired',finished=? WHERE token=? AND outcome='active'",
          )
          .run(now, job.token);
        this.db
          .prepare(
            "UPDATE jobs SET status=?,token=NULL,lease_until=NULL,error='lease_expired',ready=? WHERE id=?",
          )
          .run(
            job.attempts >= this.maxAttempts ? "failed" : "queued",
            now,
            job.id,
          );
        this.event(`Recovered interrupted delivery ${job.id.slice(0, 8)}.`);
      }
      const job = this.db
        .prepare(
          "SELECT * FROM jobs WHERE status='queued' AND ready<=? AND attempts<? ORDER BY ready,created,id LIMIT 1",
        )
        .get(now, this.maxAttempts);
      if (!job) {
        this.db.exec("COMMIT");
        return null;
      }
      const token = randomUUID(),
        region = regions[job.attempts % regions.length],
        attempts = job.attempts + 1;
      this.db
        .prepare(
          "UPDATE jobs SET status='active',attempts=?,token=?,lease_until=?,region=?,error=NULL WHERE id=?",
        )
        .run(attempts, token, now + this.leaseMs, region, job.id);
      this.db
        .prepare(
          "INSERT INTO attempts(token,job_id,number,region,started,outcome) VALUES(?,?,?,?,?,'active')",
        )
        .run(token, job.id, attempts, region, now);
      this.db.exec("COMMIT");
      return { ...job, token, region, attempts };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  finish(job, result) {
    const now = Date.now();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.db
        .prepare(
          "SELECT * FROM jobs WHERE id=? AND token=? AND status='active' AND lease_until>?",
        )
        .get(job.id, job.token, now);
      if (!current) {
        this.db.exec("COMMIT");
        return false;
      }
      const status = result.ok
        ? "done"
        : job.attempts >= this.maxAttempts
          ? "failed"
          : "queued";
      this.db
        .prepare(
          "UPDATE jobs SET status=?,ready=?,token=NULL,lease_until=NULL,error=?,finished=? WHERE id=? AND token=?",
        )
        .run(
          status,
          now + this.backoffMs * 2 ** (job.attempts - 1),
          result.ok ? null : result.error,
          status === "done" || status === "failed" ? now : null,
          job.id,
          job.token,
        );
      this.db
        .prepare("UPDATE attempts SET outcome=?,finished=? WHERE token=?")
        .run(result.ok ? "verified" : result.error, now, job.token);
      this.event(
        result.ok
          ? `Verified ${job.client} via ${job.region.toUpperCase()}.`
          : `${job.client}: ${result.error} at ${job.region.toUpperCase()}; ${status === "failed" ? "retry limit reached" : "retry scheduled"}.`,
      );
      this.db.exec("COMMIT");
      return true;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  async writeVerified(job, bytes) {
    const buffer = Buffer.from(bytes);
    if (
      buffer.length !== job.size ||
      createHash("sha256").update(buffer).digest("hex") !== job.digest
    )
      throw new Error("checksum_mismatch");
    const temp = join(this.dir, "artifacts", `${job.digest}.${job.token}.tmp`),
      target = join(this.dir, "artifacts", job.digest);
    const handle = await open(temp, "wx");
    try {
      await handle.writeFile(buffer);
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await rename(temp, target);
      const directory = await open(join(this.dir, "artifacts"), "r");
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    } finally {
      await unlink(temp).catch(() => {});
    }
  }
  process(job) {
    const workerEnv = { ...process.env };
    delete workerEnv.FORCE_COLOR;
    const worker = new Worker(new URL("./worker.mjs", import.meta.url), {
      env: workerEnv,
      workerData: {
        url: `${this.cacheBase}/cache/${job.region}/artifact`,
        digest: job.digest,
        size: job.size,
        timeout: this.timeout,
      },
    });
    let resolveTask;
    const promise = new Promise((resolve) => {
      resolveTask = resolve;
    });
    const entry = { worker, promise };
    this.tasks.set(job.token, entry);
    let settled = false;
    const settle = async (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        if (!this.stopped) {
          if (result.ok) {
            try {
              await this.writeVerified(job, result.bytes);
            } catch (error) {
              result = {
                ok: false,
                error:
                  error.message === "checksum_mismatch"
                    ? "checksum_mismatch"
                    : "storage_error",
              };
            }
          }
          if (!this.stopped) this.finish(job, result);
        }
      } catch (error) {
        this.fatal = error.message;
        this.stopped = true;
        clearInterval(this.timer);
      } finally {
        await worker.terminate();
        this.tasks.delete(job.token);
        resolveTask();
      }
    };
    const timer = setTimeout(
      () => void settle({ ok: false, error: "worker_timeout" }),
      this.timeout + 500,
    );
    worker.once("message", (result) => void settle(result));
    worker.once(
      "error",
      () => void settle({ ok: false, error: "worker_error" }),
    );
    worker.once("exit", () => {
      if (!settled) void settle({ ok: false, error: "worker_exit" });
    });
  }
  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (this.stopped) return;
      try {
        while (this.tasks.size < this.concurrency) {
          const job = this.claim();
          if (!job) break;
          this.process(job);
        }
      } catch (error) {
        this.fatal = error.message;
        this.stopped = true;
        clearInterval(this.timer);
      }
    }, 25);
  }
  state() {
    const jobs = this.db
      .prepare(
        "SELECT id,client,status,attempts,region,error FROM jobs ORDER BY created,id LIMIT 1000",
      )
      .all();
    const counts = this.db
      .prepare("SELECT status,COUNT(*) AS total FROM jobs GROUP BY status")
      .all();
    const summary = { done: 0, failed: 0, queued: 0, active: 0 };
    for (const row of counts) summary[row.status] = row.total;
    return {
      jobs,
      summary,
      events: this.db
        .prepare("SELECT text,time FROM events ORDER BY id DESC LIMIT 30")
        .all()
        .reverse(),
      manifest,
      healthy: !this.fatal,
    };
  }
  attempts(id) {
    return this.db
      .prepare("SELECT * FROM attempts WHERE job_id=? ORDER BY number")
      .all(id);
  }
  async stop() {
    this.stopped = true;
    clearInterval(this.timer);
    await Promise.all(
      [...this.tasks.values()].map(async (entry) => {
        await entry.worker.terminate();
        await entry.promise;
      }),
    );
    this.db.close();
  }
}
