import { createServer } from "node:http";
import { artifact } from "./manifest.mjs";
const listen = (server, port) =>
  new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server.address().port));
  });
export async function createFixture({ port = 3013, delay = 65 } = {}) {
  const faults = { outage: false, corruption: false, allOffline: false };
  const requests = [];
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, "http://localhost").pathname;
    const region = /^\/cache\/(eu|us|ap)\/artifact$/.exec(path)?.[1];
    if (!region || req.method !== "GET") {
      res.writeHead(404).end();
      return;
    }
    requests.push(region);
    await new Promise((r) => setTimeout(r, delay));
    if (faults.allOffline || (region === "eu" && faults.outage)) {
      res.writeHead(503).end("Fixture unavailable");
      return;
    }
    let bytes = artifact;
    if (region === "us" && faults.corruption) {
      bytes = Buffer.from(artifact);
      bytes[0] ^= 255;
    }
    res.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "Content-Length": bytes.length,
    });
    res.end(bytes);
  });
  const actual = await listen(server, port);
  return {
    faults,
    requests,
    url: `http://127.0.0.1:${actual}`,
    close: () =>
      new Promise((r) => {
        server.close(r);
        server.closeAllConnections();
      }),
  };
}
const allowedOrigins = new Set([
  "http://127.0.0.1:5177",
  "http://localhost:5177",
  "http://127.0.0.1:4177",
  "http://localhost:4177",
]);
async function body(req) {
  let text = "";
  for await (const chunk of req) {
    text += chunk;
    if (text.length > 4096) throw new Error("body_too_large");
  }
  return JSON.parse(text || "{}");
}
export async function createApi(engine, fixture, { port = 3012 } = {}) {
  const server = createServer(async (req, res) => {
    const origin = req.headers.origin;
    const json = (status, value) => {
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(JSON.stringify(value));
    };
    if (origin && !allowedOrigins.has(origin)) {
      json(403, { error: "origin_not_allowed" });
      return;
    }
    const host = req.headers.host || "";
    if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) {
      json(403, { error: "host_not_allowed" });
      return;
    }
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    }
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }
    const path = new URL(req.url, "http://localhost").pathname;
    try {
      if (req.method === "GET" && path === "/api/state") {
        json(200, {
          ...engine.state(),
          fixture: {
            outage: fixture.faults.outage,
            corruption: fixture.faults.corruption,
          },
        });
        return;
      }
      if (req.method === "POST") {
        if (req.headers["content-type"] !== "application/json") {
          json(415, { error: "json_required" });
          return;
        }
        const data = await body(req);
        if (path === "/api/demo") {
          for (let i = 1; i <= 24; i++)
            engine.submit(`client-${i.toString().padStart(3, "0")}`);
        } else if (path === "/api/faults") {
          if (
            typeof data.outage !== "boolean" ||
            typeof data.corruption !== "boolean"
          ) {
            json(400, { error: "boolean_faults_required" });
            return;
          }
          fixture.faults.outage = data.outage;
          fixture.faults.corruption = data.corruption;
          engine.event(
            `Fixture settings: EU ${data.outage ? "offline" : "online"}, US artifact ${data.corruption ? "corrupt" : "clean"}.`,
          );
        } else {
          json(404, { error: "not_found" });
          return;
        }
        json(200, {
          ...engine.state(),
          fixture: {
            outage: fixture.faults.outage,
            corruption: fixture.faults.corruption,
          },
        });
        return;
      }
      json(404, { error: "not_found" });
    } catch (error) {
      json(error instanceof SyntaxError ? 400 : 500, {
        error: error instanceof SyntaxError ? "invalid_json" : "engine_error",
      });
    }
  });
  const actual = await listen(server, port);
  return {
    url: `http://127.0.0.1:${actual}`,
    close: () =>
      new Promise((r) => {
        server.close(r);
        server.closeAllConnections();
      }),
  };
}
