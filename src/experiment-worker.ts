/// <reference lib="webworker" />
import { comparison } from "./simulation";
self.onmessage = () => {
  self.postMessage(comparison());
};
