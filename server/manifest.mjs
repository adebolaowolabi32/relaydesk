import { createHash } from "node:crypto";
export const artifact = Buffer.from(
  "RelayDesk synthetic agent release v2.8.0\n".repeat(256),
);
export const digest = createHash("sha256").update(artifact).digest("hex");
export const manifest = {
  release: "relay-agent-v2.8.0",
  digest,
  size: artifact.length,
};
export const regions = ["eu", "us", "ap"];
