// Test fixture: a backend-shaped Attempt (AttemptOut) with sensible defaults.
import type { Attempt } from "../types";

export const attemptFixture = (p: Partial<Attempt> = {}): Attempt => ({
  id: 1, scenarioRunId: "run-1", step: 1, ts: 1_794_000_000, displayTime: "14:01", signer: "key_minh", signerLabel: "x", principalId: "minh", action: "pay", outcome: "ok",
  reasonCode: null, reasonTextVi: null, reasonTextEn: null, txHash: "0x1", simulated: true, errorRaw: null, block: 1, token: null, to: null, toLabel: null, amount: null,
  keySpentAfter: null, principalSpentAfter: null, source: "server", badge: "tx", ...p,
});
