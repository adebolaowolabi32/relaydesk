import { useState } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";
import { regions, activeFor, type RegionId, type State } from "./simulation";
const ends = {
  us: { x: 150, y: 405 },
  eu: { x: 466, y: 409 },
  ap: { x: 808, y: 490 },
};
const d = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  `M${a.x} ${a.y} Q${(a.x + b.x) / 2} ${Math.min(a.y, b.y) - 35} ${b.x} ${b.y}`;
function dot(
  a: { x: number; y: number },
  b: { x: number; y: number },
  t: number,
) {
  const q = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - 35 };
  return {
    x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * q.x + t * t * b.x,
    y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * q.y + t * t * b.y,
  };
}
export function Topology({
  state,
  selected,
  onSelect,
}: {
  state: State;
  selected: RegionId;
  onSelect: (id: RegionId) => void;
}) {
  const [zoom, setZoom] = useState(1);
  return (
    <div className="topology">
      <div className="topology-label">
        <span className="status-dot" /> GLOBAL DELIVERY NETWORK{" "}
        <span>ILLUSTRATIVE GEOGRAPHY</span>
      </div>
      <svg
        viewBox={`${480 - 480 / zoom} ${290 - 290 / zoom} ${960 / zoom} ${580 / zoom}`}
        className="network-svg"
        aria-label="Interactive network. Select a regional cache to inspect and change it."
      >
        <defs>
          <pattern
            id="grid"
            width="24"
            height="24"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1" cy="1" r=".7" fill="#4a6478" opacity=".35" />
          </pattern>
          <linearGradient id="land" x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#253a4a" />
            <stop offset="1" stopColor="#172a39" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>
        <rect width="960" height="580" fill="#101f2d" />
        <rect width="960" height="580" fill="url(#grid)" />
        <g fill="url(#land)" stroke="#344b5a" strokeWidth="1" opacity=".75">
          <path d="M71 129l40-40 83-18 83 36 26 41-23 45-45 14-20 43-22 9-19-27-42-13-25-39-44-13zM209 271l35 10 32 47-8 72-31 54-14-31-2-46-24-30-7-40zM363 56l42-10 13 30-29 29-26-21zM445 149l18-36 63-14 44 12 30-33 124 12 110 61 42 56-47 36-73-9-37 41-23-31-34-20-22-33-57-8-35 29-20-9-26-39-38 11zM455 212l54-11 48 42 7 47-26 20-18 68-35-23-12-49-29-41zM648 224l33 12 23 43-16 30-24-23zM735 291l15 14 10 37 24 8 31 23-25 8-34-26-19-34zM769 395l65-20 35 40-10 30-67 5-29-25zM897 435l8 31-16 20-8-5z" />
        </g>
        <text x="91" y="217" className="continent">
          NORTH AMERICA
        </text>
        <text x="446" y="126" className="continent">
          EUROPE
        </text>
        <text x="708" y="180" className="continent">
          ASIA
        </text>
        <text x="464" y="298" className="continent">
          AFRICA
        </text>
        <text x="316" y="315" className="ocean">
          Atlantic
        </text>
        <text x="607" y="411" className="ocean">
          Indian Ocean
        </text>
        {regions.map((r) => (
          <g key={r.id}>
            <path d={d({ x: 480, y: 58 }, r)} className="origin-link" />
            <path
              d={d(r, ends[r.id])}
              stroke={r.color}
              className="delivery-link"
            />
            {state.failover &&
              regions
                .filter((other) => other.id !== r.id)
                .map((other) => (
                  <path
                    key={other.id}
                    d={d(r, ends[other.id])}
                    className="backup-link"
                  />
                ))}
          </g>
        ))}
        <g transform="translate(480 58)" className="origin-node">
          <rect x="-67" y="-18" width="134" height="36" rx="8" />
          <path
            d="M-46-7l8 4v9l-8 4-8-4v-9zM-54-3l8 4 8-4M-46 1v9"
            fill="none"
            stroke="#bad0e1"
            strokeWidth="1.4"
          />
          <text x="-23" y="4">
            RELEASE ORIGIN
          </text>
          <text y="35" textAnchor="middle" className="origin-sub">
            relay-agent · v2.8.0
          </text>
        </g>
        {state.jobs
          .filter((j) => j.status === "active")
          .slice(0, 72)
          .map((j) => {
            const r = regions.find((r) => r.id === j.node)!;
            const t = Math.max(
              0,
              Math.min(1, (state.time - j.start) / (j.end - j.start)),
            );
            const p = dot(r, ends[j.home], t);
            return (
              <g key={j.id} aria-hidden="true">
                <circle
                  cx={p.x}
                  cy={p.y}
                  r="6"
                  fill={r.color}
                  opacity=".2"
                  filter="url(#glow)"
                />
                <rect
                  x={p.x - 2.5}
                  y={p.y - 2.5}
                  width="5"
                  height="5"
                  rx="1"
                  fill={r.color}
                  transform={`rotate(45 ${p.x} ${p.y})`}
                />
              </g>
            );
          })}
        {regions.map((r) => {
          const n = state.nodes.find((n) => n.id === r.id)!,
            load = activeFor(state, r.id),
            selectedNode = selected === r.id;
          return (
            <g
              key={r.id}
              role="button"
              tabIndex={0}
              aria-label={`${r.name} cache, ${n.online ? "online" : "offline"}`}
              onClick={() => onSelect(r.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(r.id);
                }
              }}
              className="cache-node"
              transform={`translate(${r.x} ${r.y})`}
            >
              <circle
                r="48"
                fill={n.online ? r.color : "#ef8b81"}
                opacity={selectedNode ? 0.1 : 0.03}
              />
              <circle
                r="36"
                fill="#152836"
                stroke={n.online ? r.color : "#ef8b81"}
                strokeWidth={selectedNode ? 2 : 1}
                strokeDasharray={!n.online ? "4 4" : undefined}
              />
              <rect
                x="-15"
                y="-18"
                width="30"
                height="15"
                rx="3"
                fill="#203d4b"
                stroke={r.color}
              />
              <rect
                x="-15"
                y="3"
                width="30"
                height="15"
                rx="3"
                fill="#203d4b"
                stroke={r.color}
              />
              <path d="M-8-10h10M-8 11h10" stroke={r.color} strokeWidth="1.5" />
              <circle
                cx="9"
                cy="-10"
                r="2"
                fill={n.online ? r.color : "#ef8b81"}
              />
              <circle
                cx="9"
                cy="11"
                r="2"
                fill={n.online ? r.color : "#ef8b81"}
              />
              <circle
                cx="27"
                cy="-26"
                r="7"
                fill={n.online ? "#8dd4af" : "#e8857c"}
                stroke="#101f2d"
                strokeWidth="3"
              />
              <text y="61" textAnchor="middle" className="node-name">
                {r.name}
              </text>
              <text y="78" textAnchor="middle" className="node-meta">
                {n.online
                  ? `${load}/${n.workers * n.replicas} workers active`
                  : "REGION OFFLINE"}
              </text>
              {n.replicas === 2 && (
                <g transform="translate(34 18)">
                  <rect
                    x="-10"
                    y="-8"
                    width="25"
                    height="16"
                    rx="4"
                    fill="#2b4553"
                    stroke={r.color}
                  />
                  <text
                    x="2"
                    y="3"
                    fontSize="9"
                    textAnchor="middle"
                    fill={r.color}
                  >
                    ×2
                  </text>
                </g>
              )}
              {n.corrupt && (
                <text x="-47" y="-27" fill="#efb876" fontSize="18">
                  ⚠
                </text>
              )}
            </g>
          );
        })}
        {regions.map((r) => {
          const e = ends[r.id];
          const done = state.jobs.filter(
              (j) => j.home === r.id && j.status === "done",
            ).length,
            total = state.jobs.filter((j) => j.home === r.id).length;
          return (
            <g key={r.id} transform={`translate(${e.x} ${e.y})`}>
              <rect
                x="-42"
                y="-17"
                width="84"
                height="32"
                rx="7"
                fill="#152736"
                stroke="#3a5262"
              />
              {[-20, 0, 20].map((x) => (
                <g key={x} transform={`translate(${x} 0)`}>
                  <rect
                    x="-6"
                    y="-7"
                    width="12"
                    height="9"
                    rx="1.5"
                    stroke="#8da6b7"
                    fill="none"
                  />
                  <path d="M-8 5h16" stroke="#8da6b7" />
                </g>
              ))}
              <text y="34" textAnchor="middle" className="client-name">
                {r.clients}
              </text>
              <text y="50" textAnchor="middle" className="node-meta">
                {done} / {total} verified
              </text>
            </g>
          );
        })}
      </svg>
      <div className="map-controls">
        <button
          aria-label="Zoom in"
          disabled={zoom >= 1.5}
          onClick={() => setZoom((v) => v + 0.25)}
        >
          <Plus size={15} />
        </button>
        <button
          aria-label="Zoom out"
          disabled={zoom <= 1}
          onClick={() => setZoom((v) => v - 0.25)}
        >
          <Minus size={15} />
        </button>
        <button aria-label="Reset network view" onClick={() => setZoom(1)}>
          <Maximize2 size={14} />
        </button>
      </div>
      <div className="network-legend">
        <span>
          <i className="legend-packet" /> Package in transit
        </span>
        <span>
          <i className="legend-line" /> Delivery route
        </span>
        <span>
          <i className="legend-backup" /> Failover path
        </span>
      </div>
      <span className="map-hint">Select a cache to shape the network</span>
    </div>
  );
}
