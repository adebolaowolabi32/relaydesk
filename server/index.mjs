import { resolve } from "node:path";
import { Engine } from "./engine.mjs";
import { createApi, createFixture } from "./http.mjs";
const fixture = await createFixture();
let engine, api;
try {
  engine = await Engine.create({
    dir: resolve(process.env.RELAY_DATA_DIR || "data/local-engine"),
    cacheBase: fixture.url,
  });
  engine.start();
  api = await createApi(engine, fixture);
} catch (error) {
  await fixture.close();
  if (engine) await engine.stop();
  throw error;
}
console.log(
  "RelayDesk local engine: http://127.0.0.1:3012/api/state\nLocal HTTP cache fixtures: http://127.0.0.1:3013\nOpen Local engine in the app to submit deliveries.",
);
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await api.close();
  await engine.stop();
  await fixture.close();
}
process.on("SIGINT", () => void close());
process.on("SIGTERM", () => void close());
