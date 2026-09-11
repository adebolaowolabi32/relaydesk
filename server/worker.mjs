import { parentPort, workerData } from "node:worker_threads";
import { createHash } from "node:crypto";
const { url, digest, size, timeout } = workerData;
try {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeout),
    redirect: "error",
  });
  if (!response.ok) throw new Error(`http_${response.status}`);
  const reader = response.body.getReader();
  let length = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > size) {
      await reader.cancel();
      throw new Error("size_mismatch");
    }
    chunks.push(Buffer.from(value));
  }
  const bytes = Buffer.concat(chunks);
  if (bytes.length !== size) throw new Error("size_mismatch");
  if (createHash("sha256").update(bytes).digest("hex") !== digest)
    throw new Error("checksum_mismatch");
  parentPort.postMessage({ ok: true, bytes });
} catch (error) {
  const code = /^(http_\d+|size_mismatch|checksum_mismatch)$/.test(
    error.message,
  )
    ? error.message
    : error.name === "TimeoutError"
      ? "timeout"
      : "network_error";
  parentPort.postMessage({ ok: false, error: code });
}
