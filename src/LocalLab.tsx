import { useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Plug,
  RefreshCw,
  Terminal,
} from "lucide-react";
type LabState = {
  jobs: {
    id: string;
    status: string;
    attempts: number;
    error?: string;
    region?: string;
  }[];
  summary: { done: number; failed: number; queued: number; active: number };
  fixture: { outage: boolean; corruption: boolean };
  events: { text: string; time: string }[];
};
export function LocalLab() {
  const [data, setData] = useState<LabState | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function request(path = "/api/state", body?: object) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`http://127.0.0.1:3012${path}`, {
        method: body ? "POST" : "GET",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`Local engine returned ${res.status}.`);
      const result = await res.json();
      setData(result);
    } catch {
      setError(
        "Could not reach the local engine. Run npm run engine, then connect from the local app. On a remote VM, forward ports 5177 and 3012.",
      );
    } finally {
      setBusy(false);
    }
  }
  const available =
    location.hostname === "localhost" || location.hostname === "127.0.0.1";
  return (
    <section className="lab-page">
      <div className="lab-icon">
        <Terminal size={28} />
      </div>
      <span className="eyebrow">BEHIND THE SIMULATION</span>
      <h2>Real bytes. Real verification.</h2>
      <p className="lab-intro">
        The local lab runs concurrent Node.js workers against HTTP cache
        fixtures. Every delivered artifact passes a SHA-256 check before it
        reaches disk.
      </p>
      <div className="lab-layout">
        <div className="lab-setup">
          <h3>Bring up your delivery engine</h3>
          <code>npm run engine</code>
          <p>
            Then connect from the local RelayDesk app. The lab uses synthetic
            artifacts and local regional fixtures; it does not provision cloud
            infrastructure.
          </p>
          <button
            className="primary"
            disabled={!available || busy}
            onClick={() => request()}
          >
            <Plug size={16} />
            {busy
              ? "Connecting…"
              : data
                ? "Refresh engine"
                : "Connect local engine"}
          </button>
          {!available && (
            <p className="lab-warning">
              Available when you run this project locally. The hosted portfolio
              remains a browser simulation.
            </p>
          )}
          <div className="lab-capabilities">
            <span>
              <CheckCircle2 size={15} /> Durable queue with restart recovery
            </span>
            <span>
              <CheckCircle2 size={15} /> Bounded retries and cross-cache
              failover
            </span>
            <span>
              <CheckCircle2 size={15} /> Duplicate submission returns the same
              job
            </span>
            <span>
              <CheckCircle2 size={15} /> Atomic, checksum-verified file delivery
            </span>
          </div>
        </div>
        <div className="lab-results">
          {data ? (
            <>
              <div className="panel-heading">
                <h3>Worker activity</h3>
                <span className="badge green">LOCAL ENGINE</span>
              </div>
              <div className="lab-stats">
                {Object.entries(data.summary).map(([k, v]) => (
                  <div key={k}>
                    <strong>{v}</strong>
                    <span>{k}</span>
                  </div>
                ))}
              </div>
              <div className="lab-buttons">
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => request("/api/demo", {})}
                >
                  Submit 24 deliveries <ArrowRight size={15} />
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => request()}
                >
                  <RefreshCw size={15} />
                  Refresh
                </button>
              </div>
              <p className="small-note">
                Submitting again deduplicates the same release and client IDs.
                Refresh to observe progress.
              </p>
              <div className="lab-buttons">
                <button
                  className="secondary"
                  disabled={busy}
                  aria-pressed={data.fixture.outage}
                  onClick={() =>
                    request("/api/faults", {
                      outage: !data.fixture.outage,
                      corruption: data.fixture.corruption,
                    })
                  }
                >
                  {data.fixture.outage
                    ? "Restore EU cache"
                    : "Take EU cache offline"}
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  aria-pressed={data.fixture.corruption}
                  onClick={() =>
                    request("/api/faults", {
                      outage: data.fixture.outage,
                      corruption: !data.fixture.corruption,
                    })
                  }
                >
                  {data.fixture.corruption
                    ? "Restore US package"
                    : "Corrupt US package"}
                </button>
              </div>
              <div className="real-events">
                {data.events
                  .slice(-6)
                  .reverse()
                  .map((e, i) => (
                    <p key={i}>{e.text}</p>
                  ))}
              </div>
              <p className="small-note">
                Faults affect pending transfers. Completed artifacts remain
                verified. For a fresh experiment, stop the engine and use a new
                RELAY_DATA_DIR.
              </p>
            </>
          ) : (
            <div className="lab-empty">
              <div className="terminal-lines">
                <span>origin → regional cache → worker</span>
                <span>sha256(artifact) === manifest.digest</span>
                <span className="terminal-cursor">await delivery</span>
              </div>
              <h3>Your workers are one command away.</h3>
              <p>
                Connect to inspect actual file delivery. The animated map is a
                separate deterministic model.
              </p>
            </div>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
    </section>
  );
}
