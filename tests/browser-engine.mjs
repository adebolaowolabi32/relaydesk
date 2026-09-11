import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
// Isolated from user data; retained in the OS temp directory for failure investigation.
process.env.RELAY_DATA_DIR = await mkdtemp(
  join(tmpdir(), "relaydesk-browser-"),
);
await import("../server/index.mjs");
