export const regions = [
  {
    id: "us",
    name: "Virginia",
    zone: "US EAST",
    x: 245,
    y: 205,
    color: "#84c7ff",
    clients: "North America",
  },
  {
    id: "eu",
    name: "Frankfurt",
    zone: "EU CENTRAL",
    x: 510,
    y: 158,
    color: "#b9acf7",
    clients: "Europe & Africa",
  },
  {
    id: "ap",
    name: "Singapore",
    zone: "ASIA PACIFIC",
    x: 745,
    y: 310,
    color: "#8bd6b0",
    clients: "Asia Pacific",
  },
] as const;
export type RegionId = (typeof regions)[number]["id"];
export type Node = {
  id: RegionId;
  online: boolean;
  workers: number;
  replicas: number;
  corrupt: boolean;
  served: number;
  rejected: number;
};
export type Job = {
  id: number;
  home: RegionId;
  status: "queued" | "active" | "retry" | "done" | "failed";
  ready: number;
  created: number;
  attempts: number;
  node: RegionId | null;
  lastNode: RegionId | null;
  start: number;
  end: number;
  duration: number;
  cross: boolean;
};
export type Event = {
  id: number;
  time: number;
  kind: "info" | "good" | "warning";
  text: string;
};
export type State = {
  time: number;
  seed: number;
  nodes: Node[];
  jobs: Job[];
  failover: boolean;
  events: Event[];
  serial: number;
  retries: number;
  rejected: number;
  crossings: number;
  workerSeconds: number;
  hadOutage: boolean;
  history: { time: number; done: number; queue: number }[];
  nextSample: number;
};
export type Action =
  | { type: "tick"; dt: number }
  | { type: "outage"; id: RegionId }
  | { type: "workers"; id: RegionId; delta: number }
  | { type: "replica"; id: RegionId }
  | { type: "corrupt"; id: RegionId }
  | { type: "failover" }
  | { type: "surge" }
  | { type: "reset" };
function rng(s: State) {
  s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0;
  return s.seed / 4294967296;
}
function log(s: State, text: string, kind: Event["kind"] = "info") {
  s.events.unshift({ id: ++s.serial, time: s.time, kind, text });
  s.events = s.events.slice(0, 35);
}
function addJobs(s: State, count: number) {
  const first = s.jobs.length;
  for (let i = 0; i < count; i++) {
    const home = regions[Math.floor(rng(s) * 3)].id;
    s.jobs.push({
      id: first + i + 1,
      home,
      status: "queued",
      ready: s.time + Math.floor(i / 25),
      created: s.time + Math.floor(i / 25),
      attempts: 0,
      node: null,
      lastNode: null,
      start: 0,
      end: 0,
      duration: 0,
      cross: false,
    });
  }
}
export function initialState(): State {
  const s: State = {
    time: 0,
    seed: 42,
    nodes: regions.map((r) => ({
      id: r.id,
      online: true,
      workers: 4,
      replicas: 1,
      corrupt: false,
      served: 0,
      rejected: 0,
    })),
    jobs: [],
    failover: true,
    events: [],
    serial: 0,
    retries: 0,
    rejected: 0,
    crossings: 0,
    workerSeconds: 0,
    hadOutage: false,
    history: [],
    nextSample: 0,
  };
  addJobs(s, 1000);
  log(s, "Release v2.8.0 queued for 1,000 clients.", "good");
  return s;
}
export const count = (s: State, status: Job["status"]) =>
  s.jobs.filter((j) => j.status === status).length;
export const queue = (s: State) =>
  s.jobs.filter(
    (j) => (j.status === "queued" || j.status === "retry") && j.ready <= s.time,
  ).length;
export const activeFor = (s: State, id: RegionId) =>
  s.jobs.filter((j) => j.status === "active" && j.node === id).length;
export function p95(s: State) {
  const a = s.jobs
    .filter((j) => j.status === "done")
    .map((j) => j.duration)
    .sort((a, b) => a - b);
  return a.length ? a[Math.ceil(a.length * 0.95) - 1] : 0;
}
export const credits = (s: State) =>
  s.workerSeconds * 0.01 +
  s.crossings * 0.05 +
  s.jobs.reduce((n, j) => n + j.attempts, 0) * 0.002;
function step(s: State, dt: number) {
  s.time += dt;
  const unfinished = s.jobs.some(
    (j) => j.status !== "done" && j.status !== "failed",
  );
  if (unfinished)
    s.workerSeconds +=
      s.nodes
        .filter((n) => n.online)
        .reduce((n, node) => n + node.workers * node.replicas, 0) * dt;
  for (const j of s.jobs) {
    if (j.status !== "active") continue;
    const n = s.nodes.find((n) => n.id === j.node)!;
    if (n.online && s.time < j.end) continue;
    const corrupt = n.online && n.corrupt && j.id % 3 === 0;
    if (!n.online || corrupt) {
      if (corrupt) {
        s.rejected++;
        n.rejected++;
        if (s.rejected <= 3 || s.rejected % 10 === 0)
          log(
            s,
            `Checksum rejected at ${regions.find((r) => r.id === n.id)!.name}. Package quarantined.`,
            "warning",
          );
      }
      j.lastNode = n.id;
      j.node = null;
      if (j.attempts >= 4) {
        j.status = "failed";
      } else {
        j.status = "retry";
        j.ready = s.time + 2 ** (j.attempts - 1);
        s.retries++;
      }
    } else {
      j.status = "done";
      j.duration = s.time - j.created;
      n.served++;
    }
  }
  const loads = Object.fromEntries(
    s.nodes.map((n) => [n.id, activeFor(s, n.id)]),
  );
  for (const j of s.jobs) {
    if ((j.status !== "queued" && j.status !== "retry") || j.ready > s.time)
      continue;
    let choices = s.nodes.filter((n) => loads[n.id] < n.workers * n.replicas);
    if (s.failover)
      choices = choices
        .filter((n) => n.online)
        .sort((a, b) => {
          const score = (n: Node) =>
            (n.id === j.home ? 0 : 2) +
            (n.id === j.lastNode ? 4 : 0) +
            loads[n.id] / (n.workers * n.replicas);
          return score(a) - score(b);
        });
    else choices = choices.filter((n) => n.id === j.home);
    const n = choices[0];
    if (!n) continue;
    j.node = n.id;
    j.status = "active";
    j.start = s.time;
    j.end =
      s.time +
      (n.online ? 1.4 + (j.id % 7) * 0.08 + (n.id !== j.home ? 0.7 : 0) : 0.4);
    j.attempts++;
    j.cross = n.id !== j.home;
    if (j.cross) s.crossings++;
    loads[n.id]++;
  }
  if (s.time >= s.nextSample) {
    s.history.push({ time: s.time, done: count(s, "done"), queue: queue(s) });
    s.history = s.history.slice(-80);
    s.nextSample = s.time + 2;
  }
}
export function reduce(state: State, action: Action): State {
  if (action.type === "reset") return initialState();
  const s = structuredClone(state);
  switch (action.type) {
    case "tick": {
      let left = Number.isFinite(action.dt)
        ? Math.max(0, Math.min(10, action.dt))
        : 0;
      while (left > 1e-8) {
        const dt = Math.min(0.2, left);
        step(s, dt);
        left -= dt;
      }
      break;
    }
    case "outage": {
      const n = s.nodes.find((n) => n.id === action.id)!;
      n.online = !n.online;
      s.hadOutage ||= !n.online && count(s, "done") < 1000;
      log(
        s,
        `${regions.find((r) => r.id === n.id)!.name} ${n.online ? "is back online." : "is offline. In-flight requests will retry."}`,
        n.online ? "good" : "warning",
      );
      break;
    }
    case "workers": {
      const n = s.nodes.find((n) => n.id === action.id)!;
      n.workers = Math.max(2, Math.min(12, n.workers + action.delta));
      log(
        s,
        `${regions.find((r) => r.id === n.id)!.name} scaled to ${n.workers} workers per replica.`,
      );
      break;
    }
    case "replica": {
      const n = s.nodes.find((n) => n.id === action.id)!;
      n.replicas = n.replicas === 1 ? 2 : 1;
      log(
        s,
        `${regions.find((r) => r.id === n.id)!.name}: ${n.replicas} cache replica${n.replicas === 1 ? "" : "s"}.`,
      );
      break;
    }
    case "corrupt": {
      const n = s.nodes.find((n) => n.id === action.id)!;
      n.corrupt = !n.corrupt;
      log(
        s,
        `${regions.find((r) => r.id === n.id)!.name}: ${n.corrupt ? "corruption injected into every third package." : "clean package restored."}`,
        n.corrupt ? "warning" : "good",
      );
      break;
    }
    case "failover":
      s.failover = !s.failover;
      log(
        s,
        s.failover
          ? "Automatic cross-region failover enabled."
          : "Requests pinned to their home region.",
      );
      break;
    case "surge": {
      const n = Math.min(500, 2000 - s.jobs.length);
      if (n) {
        addJobs(s, n);
        log(s, `${n} more clients joined the release.`, "warning");
      }
      break;
    }
  }
  return s;
}
export function comparison() {
  return [false, true].map((failover) => {
    let s = initialState();
    s.failover = failover;
    for (let t = 0; t < 240; t++) {
      if (t === 15) s = reduce(s, { type: "outage", id: "eu" });
      s = reduce(s, { type: "tick", dt: 1 });
    }
    return {
      failover,
      delivered: count(s, "done"),
      failed: count(s, "failed"),
      pending: s.jobs.length - count(s, "done") - count(s, "failed"),
      p95: p95(s),
      credits: credits(s),
      retries: s.retries,
    };
  });
}
export const elapsed = (n: number) =>
  `${Math.floor(n / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(n % 60)
    .toString()
    .padStart(2, "0")}`;
