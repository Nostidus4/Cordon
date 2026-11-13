// Parity with Backend tables, dumped by `make shared-tables` (pytest keeps the JSON fresh).
import { expect, it } from "vitest";
import tables from "./backendTables.json";
import { REASONS } from "./reasonCodes";
import { DISTRICT_CAP_V2, SCENE4_STEPS } from "./scenario4";
import { STREAM_TYPES } from "../types/stream";

it("reason codes: same codes, error names, VI and EN texts", () => {
  expect(REASONS).toEqual(tables.reasons);
});

it("SSE event types: same set", () => {
  expect([...STREAM_TYPES].sort()).toEqual(tables.sseEventTypes);
});

const U = 1_000_000;
const DEX: Record<string, string> = { MockDEX: "mock_dex", EvilDEX: "evil_dex" }; // TS shows names, Python seed ids
// Python-only fields, allowed to be missing in TS: step note, swap min_out, lock principal_id, raw_call calldata.
const PY_ONLY_PARAMS = ["min_out", "principal_id", "data"];
// TS-only fields (UI): who, label. Everything else must be mapped below, else the key check fails.
const TS_KEYS = ["step", "time", "signer", "who", "kind", "token", "tokenOut", "to", "dex", "amount", "label", "expect", "reason", "sharedAfter"];

function toPython(s: (typeof SCENE4_STEPS)[number]) {
  expect(Object.keys(s).filter((k) => !TS_KEYS.includes(k))).toEqual([]); // new TS field => map it here
  const action = s.kind === "approve" ? "raw_call" : s.kind; // TS names the raw call by its effect
  const p: Record<string, unknown> =
    action === "pay" ? { token: s.token, to: s.to, amount: Number(s.amount) }
    : action === "swap" ? { dex: DEX[s.dex!], token_in: s.token, token_out: s.tokenOut, amount_in: Number(s.amount) }
    : action === "raw_call" ? { target: s.token }
    : {};
  return {
    step: s.step,
    display_time: s.time,
    signer: s.signer === "lan" ? "council_lan" : s.signer, // TS uses the bare council name
    action,
    params: p,
    expected_outcome: s.expect,
    expected_reason: s.reason ?? null, // undefined -> null
    expected_district_spent_after: s.sharedAfter === null ? null : s.sharedAfter * U, // display units -> base units
  };
}

it("scene 4: 8 steps equal on every shared field", () => {
  const py = tables.scenario4.steps;
  expect(SCENE4_STEPS).toHaveLength(py.length);
  const pyShared = py.map((s) => {
    const params: Record<string, unknown> = { ...s.params };
    PY_ONLY_PARAMS.forEach((k) => delete params[k]);
    const { note: _note, ...rest } = s; // Python-only
    return { ...rest, params };
  });
  expect(SCENE4_STEPS.map(toPython)).toEqual(pyShared);
  expect(DISTRICT_CAP_V2 * U).toBe(tables.scenario4.dailyCap);
});
