import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Box,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Code2,
  Copy,
  Download,
  FlaskConical,
  Gauge,
  GitBranch,
  Globe2,
  HelpCircle,
  Layers,
  Minus,
  Pause,
  Play,
  Plus,
  Radio,
  RotateCcw,
  Server,
  ShieldCheck,
  Terminal,
  TriangleAlert,
  Unplug,
  Users,
  X,
  Zap,
} from "lucide-react";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/manrope";
import {
  initialState,
  reduce,
  regions,
  count,
  queue,
  activeFor,
  p95,
  credits,
  comparison,
  elapsed,
  type Action,
  type RegionId,
  type State,
} from "./simulation";
import { Topology } from "./Topology";
import { LocalLab } from "./LocalLab";
import "./styles.css";
const format = (n: number) => n.toLocaleString("en-US");
function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="panel-heading">
        <span className="eyebrow">RELAYDESK FIELD NOTES</span>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <h2>{title}</h2>
      {children}
    </dialog>
  );
}
function App() {
  const [state, setState] = useState(initialState),
    [paused, setPaused] = useState(
      () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
    [speed, setSpeed] = useState(1),
    [selected, setSelected] = useState<RegionId>("eu"),
    [tab, setTab] = useState<"network" | "compare" | "lab">("network"),
    [guide, setGuide] = useState(false),
    [reset, setReset] = useState(false),
    [notice, setNotice] = useState("");
  useEffect(() => {
    if (paused || tab !== "network") return;
    const id = setInterval(() => {
      if (!document.hidden)
        setState((s) => reduce(s, { type: "tick", dt: 0.2 * speed }));
    }, 200);
    return () => clearInterval(id);
  }, [paused, speed, tab]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(id);
  }, [notice]);
  const act = (a: Action) => setState((s) => reduce(s, a));
  const node = state.nodes.find((n) => n.id === selected)!,
    region = regions.find((r) => r.id === selected)!,
    done = count(state, "done"),
    failed = count(state, "failed"),
    active = count(state, "active"),
    finished = done + failed === state.jobs.length;
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to workspace
      </a>
      <header className="app-header">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setTab("network");
          }}
        >
          <span className="brand-icon">
            <GitBranch size={22} />
          </span>
          relay<span>desk</span>
          <i>LAB</i>
        </a>
        <nav aria-label="Workspace">
          <button
            className={tab === "network" ? "active" : ""}
            onClick={() => setTab("network")}
          >
            <Globe2 size={15} /> Network
          </button>
          <button
            className={tab === "compare" ? "active" : ""}
            onClick={() => setTab("compare")}
          >
            <FlaskConical size={15} /> Experiments
          </button>
          <button
            className={tab === "lab" ? "active" : ""}
            onClick={() => setTab("lab")}
          >
            <Terminal size={15} /> Local engine
          </button>
        </nav>
        <div className="header-right">
          <span className="sandbox-badge">
            <i /> BROWSER SANDBOX
          </span>
          <button
            className="icon-button"
            aria-label="How RelayDesk works"
            onClick={() => setGuide(true)}
          >
            <HelpCircle size={19} />
          </button>
          <a
            className="icon-button"
            href="https://github.com/adebolaowolabi32/relaydesk"
            aria-label="RelayDesk source code"
          >
            <Code2 size={20} />
          </a>
        </div>
      </header>
      <main id="main">
        <section className="page-heading">
          <div>
            <div className="eyebrow">
              <span className="tiny-line" /> THE DISTRIBUTED SYSTEMS PLAYGROUND
            </div>
            <h1>
              Delivery, under pressure<span>.</span>
            </h1>
            <p>Ship a release. Break a region. Keep the packets moving.</p>
          </div>
          <div className="heading-aside">
            <span className="release-tag">
              <Box size={15} /> relay-agent <strong>v2.8.0</strong>
            </span>
            <span className="small-note">
              1 artifact · 3 regions · a thousand destinations
            </span>
          </div>
        </section>
        {tab === "lab" ? (
          <LocalLab />
        ) : tab === "compare" ? (
          <Experiments />
        ) : (
          <>
            <section className="stats" aria-label="Delivery statistics">
              <Stat
                icon={<ShieldCheck size={19} />}
                label="Verified deliveries"
                value={format(done)}
                detail={`of ${format(state.jobs.length)} clients`}
                color="mint"
                progress={done / state.jobs.length}
              />
              <Stat
                icon={<Layers size={19} />}
                label="In the queue"
                value={format(queue(state))}
                detail={`${active} transferring now`}
                color="blue"
              />
              <Stat
                icon={<Clock3 size={19} />}
                label="p95 delivery time"
                value={p95(state).toFixed(1)}
                suffix="s"
                detail="Includes time waiting"
                color="violet"
              />
              <Stat
                icon={<TriangleAlert size={19} />}
                label="Integrity rejections"
                value={format(state.rejected)}
                detail={`${failed} exhausted retries`}
                color="amber"
              />
            </section>
            <div className="workspace">
              <section className="network-panel">
                <div className="network-toolbar">
                  <div>
                    <span className="status-dot" />
                    <strong>
                      {finished
                        ? "Release settled"
                        : paused
                          ? "Simulation paused"
                          : "Release in motion"}
                    </strong>
                    <span className="toolbar-sep">/</span>
                    <span>seed 42</span>
                  </div>
                  <div className="playback">
                    <span className="sim-time" data-testid="sim-time">
                      {elapsed(state.time)}
                    </span>
                    <button
                      className="play-button"
                      aria-label={
                        paused ? "Resume simulation" : "Pause simulation"
                      }
                      onClick={() => setPaused((p) => !p)}
                    >
                      {paused ? <Play size={14} /> : <Pause size={14} />}
                    </button>
                    <div className="speed-controls">
                      {[1, 4, 12].map((n) => (
                        <button
                          key={n}
                          aria-label={`${n} times speed`}
                          aria-pressed={speed === n}
                          className={speed === n ? "active" : ""}
                          onClick={() => setSpeed(n)}
                        >
                          {n}×
                        </button>
                      ))}
                    </div>
                    <button
                      className="reset-button"
                      aria-label="Reset simulation"
                      onClick={() => setReset(true)}
                    >
                      <RotateCcw size={14} />
                    </button>
                  </div>
                </div>
                <Topology
                  state={state}
                  selected={selected}
                  onSelect={setSelected}
                />
                <div className="network-bottom">
                  <span>
                    <ShieldCheck size={14} /> Every delivery must pass integrity
                    verification
                  </span>
                  <span>
                    {state.nodes.filter((n) => n.online).length}/3 regions
                    online <i>·</i> {state.retries} retries
                  </span>
                </div>
                <div className="region-strip">
                  {regions.map((r) => {
                    const n = state.nodes.find((n) => n.id === r.id)!;
                    return (
                      <button
                        className={selected === r.id ? "selected" : ""}
                        key={r.id}
                        onClick={() => setSelected(r.id)}
                        style={{ "--region": r.color } as React.CSSProperties}
                      >
                        <span
                          className={
                            "region-light " + (!n.online ? "offline" : "")
                          }
                        />
                        <div>
                          <strong>{r.name}</strong>
                          <small>{r.zone}</small>
                        </div>
                        <span className="region-load">
                          {n.served}
                          <small>delivered</small>
                        </span>
                        <ChevronRight size={14} />
                      </button>
                    );
                  })}
                </div>
              </section>
              <aside className="inspector">
                <div className="panel-heading">
                  <span className="eyebrow">REGION INSPECTOR</span>
                  <span className={"badge " + (node.online ? "green" : "red")}>
                    {node.online ? "ONLINE" : "OFFLINE"}
                  </span>
                </div>
                <div className="inspector-heading">
                  <span
                    className="server-icon"
                    style={{ "--region": region.color } as React.CSSProperties}
                  >
                    <Server size={27} />
                  </span>
                  <div>
                    <h2>{region.name}</h2>
                    <p>
                      {region.zone} <span>·</span> REGIONAL CACHE
                    </p>
                  </div>
                </div>
                <div className="inspector-numbers">
                  <div>
                    <span>Verified</span>
                    <strong>{node.served}</strong>
                  </div>
                  <div>
                    <span>Transferring</span>
                    <strong>{activeFor(state, node.id)}</strong>
                  </div>
                  <div>
                    <span>Rejected</span>
                    <strong>{node.rejected}</strong>
                  </div>
                </div>
                <div className="worker-heading">
                  <span>Workers per replica</span>
                  <div>
                    <button
                      aria-label="Remove two workers"
                      disabled={node.workers <= 2}
                      onClick={() =>
                        act({ type: "workers", id: selected, delta: -2 })
                      }
                    >
                      <Minus size={13} />
                    </button>
                    <strong data-testid="workers">{node.workers}</strong>
                    <button
                      aria-label="Add two workers"
                      disabled={node.workers >= 12}
                      onClick={() =>
                        act({ type: "workers", id: selected, delta: 2 })
                      }
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                </div>
                <div className="worker-slots">
                  {Array.from({ length: 12 }, (_, i) => (
                    <span
                      key={i}
                      className={
                        i < node.workers
                          ? i < activeFor(state, node.id)
                            ? "busy"
                            : "enabled"
                          : ""
                      }
                    />
                  ))}
                </div>
                <button
                  className="setting-row"
                  aria-pressed={node.replicas === 2}
                  onClick={() => act({ type: "replica", id: selected })}
                >
                  <span className="setting-icon">
                    <Copy size={16} />
                  </span>
                  <span>
                    <strong>Extra cache replica</strong>
                    <small>Double this region's transfer slots</small>
                  </span>
                  <Toggle on={node.replicas === 2} />
                </button>
                <div className="fault-heading">
                  <span className="eyebrow">INTRODUCE A LITTLE CHAOS</span>
                  <Zap size={13} />
                </div>
                <button
                  className={
                    "fault-button " + (!node.online ? "fault-active" : "")
                  }
                  aria-pressed={!node.online}
                  onClick={() => act({ type: "outage", id: selected })}
                >
                  <Unplug size={16} />
                  <span>
                    {node.online ? "Take region offline" : "Restore region"}
                  </span>
                  <ArrowUpRight size={14} />
                </button>
                <button
                  className={
                    "fault-button " + (node.corrupt ? "fault-active" : "")
                  }
                  aria-pressed={node.corrupt}
                  onClick={() => act({ type: "corrupt", id: selected })}
                >
                  <ShieldCheck size={16} />
                  <span>
                    {node.corrupt
                      ? "Restore clean package"
                      : "Inject corrupt package"}
                  </span>
                  <ArrowUpRight size={14} />
                </button>
                <p className="inspector-note">
                  {!node.online
                    ? "In-flight transfers retry. With failover enabled, healthy regions can pick them up."
                    : node.corrupt
                      ? "Every third package from this cache fails verification. Affected clients retry another cache."
                      : "Break things here. Watch the rest of the network respond."}
                </p>
                <div className="inspector-footer">
                  <span>Simulated transfer capacity</span>
                  <strong>{node.workers * node.replicas} concurrent</strong>
                </div>
              </aside>
            </div>
            <section className="operations-row">
              <div className="policy-panel">
                <div className="panel-heading">
                  <h3>Shape the response</h3>
                  <GitBranch size={16} />
                </div>
                <button
                  className="setting-row"
                  aria-pressed={state.failover}
                  onClick={() => act({ type: "failover" })}
                >
                  <span className="setting-icon">
                    <Globe2 size={18} />
                  </span>
                  <span>
                    <strong>Automatic failover</strong>
                    <small>Route around unavailable regions</small>
                  </span>
                  <Toggle on={state.failover} />
                </button>
                <button
                  className="surge-button"
                  disabled={state.jobs.length >= 2000}
                  onClick={() => {
                    act({ type: "surge" });
                    setNotice("500 new clients are joining the rollout.");
                  }}
                >
                  <Users size={16} /> Add 500 clients <Plus size={14} />
                </button>
                <div className="policy-cost">
                  <span>
                    Estimated compute cost <HelpCircle size={12} />
                  </span>
                  <strong>
                    {credits(state).toFixed(1)} <small>credits</small>
                  </strong>
                  <p>
                    Fictional units for comparing strategies. No cloud billing.
                  </p>
                </div>
              </div>
              <div className="challenge-panel">
                <div className="challenge-symbol">
                  {done >= 1000 && state.hadOutage ? (
                    <CheckCircle2 size={27} />
                  ) : (
                    <Box size={27} />
                  )}
                </div>
                <span className="eyebrow">
                  MISSION 01 / THE RELEASE MUST GO ON
                </span>
                <h3>
                  {done >= 1000 && state.hadOutage
                    ? "You kept the release moving."
                    : "One thousand clients. One region down."}
                </h3>
                <p>
                  Take Frankfurt offline and deliver the release to at least
                  1,000 clients. Scale healthy regions and let failover do its
                  work.
                </p>
                <div className="challenge-progress">
                  <div>
                    <i style={{ width: `${Math.min(100, done / 10)}%` }} />
                  </div>
                  <span>{Math.min(done, 1000)} / 1,000</span>
                </div>
                <button
                  className="text-button"
                  onClick={() => {
                    setSelected("eu");
                    if (finished) {
                      act({ type: "reset" });
                      act({ type: "outage", id: "eu" });
                    } else if (state.nodes.find((n) => n.id === "eu")!.online)
                      act({ type: "outage", id: "eu" });
                    setSpeed(4);
                    setPaused(false);
                  }}
                >
                  Start regional outage <ArrowRight size={15} />
                </button>
              </div>
              <div className="event-panel">
                <div className="panel-heading">
                  <h3>On the wire</h3>
                  <span className="event-live">
                    <i /> EVENT LOG
                  </span>
                </div>
                <div className="event-list">
                  {state.events.slice(0, 4).map((e) => (
                    <div className={"event " + e.kind} key={e.id}>
                      <span>{elapsed(e.time)}</span>
                      <i />
                      <p>{e.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </>
        )}
        <footer>
          <span>
            <i className="status-dot" /> Original scenarios. Observable
            consequences.
          </span>
          <span>
            Built by{" "}
            <a href="https://github.com/adebolaowolabi32">Cynthia Owolabi</a>
            <i>·</i>
            <button onClick={() => setGuide(true)}>
              How it works <ArrowUpRight size={12} />
            </button>
          </span>
        </footer>
      </main>
      {notice && (
        <div role="status" className="toast">
          <Check size={16} />
          {notice}
        </div>
      )}
      {guide && (
        <Dialog
          title="Make resilience visible."
          onClose={() => setGuide(false)}
        >
          <p>
            RelayDesk is a playground for software delivery under failure. Every
            moving packet represents a simulated client transfer.
          </p>
          <ol className="guide-list">
            <li>
              <strong>Ship it.</strong> A thousand clients request the release
              across three regions.
            </li>
            <li>
              <strong>Break it.</strong> Select a cache, cause an outage or
              corrupt its packages.
            </li>
            <li>
              <strong>Recover.</strong> Add workers, replicate caches and enable
              failover.
            </li>
            <li>
              <strong>Compare.</strong> Experiments replay the same requests
              with different routing policies.
            </li>
          </ol>
          <div className="guide-note">
            The map is a deterministic model, with illustrative geography and
            synthetic cost credits. Local engine mode separately performs real
            HTTP transfers and SHA-256 verification on your machine.
          </div>
          <p>
            Simulation time pauses on other app tabs and when this browser tab
            is hidden. Refreshing starts a fresh release. Reduced motion starts
            paused.
          </p>
          <button className="primary" onClick={() => setGuide(false)}>
            Let's ship something <ArrowRight size={15} />
          </button>
        </Dialog>
      )}
      {reset && (
        <Dialog title="Start a fresh release?" onClose={() => setReset(false)}>
          <p>
            This replaces the current simulation, incidents and delivery history
            with the original 1,000-client rollout.
          </p>
          <div className="dialog-actions">
            <button className="secondary" onClick={() => setReset(false)}>
              Keep this release
            </button>
            <button
              className="primary"
              onClick={() => {
                act({ type: "reset" });
                setSpeed(1);
                setPaused(true);
                setSelected("eu");
                setReset(false);
              }}
            >
              Reset release
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
function Toggle({ on }: { on: boolean }) {
  return (
    <span className={"toggle " + (on ? "on" : "")} aria-hidden="true">
      <i />
    </span>
  );
}
function Stat({
  icon,
  label,
  value,
  detail,
  color,
  suffix,
  progress,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  color: string;
  suffix?: string;
  progress?: number;
}) {
  return (
    <div className="stat">
      <span className={"stat-icon " + color}>{icon}</span>
      <div>
        <span className="stat-label">{label}</span>
        <strong>
          {value}
          <small>{suffix}</small>
        </strong>
        <span className="stat-detail">{detail}</span>
      </div>
      {progress !== undefined && (
        <div className="stat-progress">
          <i style={{ width: `${progress * 100}%` }} />
        </div>
      )}
    </div>
  );
}
function Experiments() {
  const [result, setResult] = useState<ReturnType<typeof comparison> | null>(
      null,
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const workerRef = useRef<Worker | null>(null);
  useEffect(() => () => workerRef.current?.terminate(), []);
  function run() {
    setBusy(true);
    setError("");
    workerRef.current?.terminate();
    const worker = new Worker(
      new URL("./experiment-worker.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = worker;
    worker.onmessage = (e) => {
      setResult(e.data);
      setBusy(false);
      worker.terminate();
    };
    worker.onerror = () => {
      setError("The experiment could not finish. Try running it again.");
      setBusy(false);
      worker.terminate();
    };
    worker.postMessage("run");
  }
  return (
    <section className="experiment-page">
      <div className="experiment-heading">
        <span className="lab-icon">
          <FlaskConical size={28} />
        </span>
        <div>
          <span className="eyebrow">SAME REQUESTS. DIFFERENT DECISIONS.</span>
          <h2>Replay the failure.</h2>
          <p>
            One release, 1,000 clients, Frankfurt offline at 15 seconds. Compare
            routing policies over 240 simulation seconds.
          </p>
        </div>
        <button className="primary" disabled={busy} onClick={run}>
          {busy
            ? "Running both strategies…"
            : result
              ? "Run again"
              : "Run experiment"}
          <Play size={14} />
        </button>
      </div>
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      <div className="experiment-cards">
        {[false, true].map((on, i) => (
          <article key={i}>
            <div className="panel-heading">
              <span className="eyebrow">STRATEGY 0{i + 1}</span>
              <span className={"badge " + (on ? "green" : "neutral")}>
                {on ? "ADAPTIVE" : "PINNED"}
              </span>
            </div>
            <h3>{on ? "Find another way." : "Stay close to home."}</h3>
            <p>
              {on
                ? "Healthy caches can serve clients from any region. Failed transfers retry elsewhere."
                : "Clients only use their home cache, even when it goes offline. Four attempts, then failure."}
            </p>
            <div className="strategy-diagram">
              <span>Clients</span>
              <ArrowRight size={20} />
              <Server size={30} />
              {on ? (
                <>
                  <GitBranch size={22} />
                  <Server size={30} />
                </>
              ) : (
                <Unplug size={26} />
              )}
            </div>
            {result ? (
              <>
                <strong className="result-number">
                  {result[i].delivered}
                  <small>/ 1,000 delivered</small>
                </strong>
                <div className="result-bar">
                  <i style={{ width: `${result[i].delivered / 10}%` }} />
                </div>
                <dl>
                  <div>
                    <dt>Failed / pending</dt>
                    <dd>
                      {result[i].failed} / {result[i].pending}
                    </dd>
                  </div>
                  <div>
                    <dt>p95, successful deliveries</dt>
                    <dd>{result[i].p95.toFixed(1)}s</dd>
                  </div>
                  <div>
                    <dt>Retry attempts scheduled</dt>
                    <dd>{result[i].retries}</dd>
                  </div>
                  <div>
                    <dt>Synthetic compute credits</dt>
                    <dd>{result[i].credits.toFixed(1)}</dd>
                  </div>
                </dl>
              </>
            ) : (
              <div className="experiment-placeholder">
                Run the experiment to reveal the outcome.
              </div>
            )}
          </article>
        ))}
      </div>
      <div className="experiment-note">
        <ShieldCheck size={19} />
        <p>
          Both strategies use seed 42, the same 1,000 arrivals and identical
          worker capacity. Latency includes queueing and only completed
          requests; compare it alongside failures. Credits are illustrative
          model units, not cloud prices. This experiment does not alter your
          network.
        </p>
      </div>
    </section>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
