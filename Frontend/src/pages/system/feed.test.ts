import { describe, expect, it } from "vitest";
import { COLOR, routeFor, useFeed } from "./feed";
import type { Attempt, StreamMessage } from "../../types";

const attempt = (p: Partial<Attempt> & { action: Attempt["action"] }): StreamMessage => ({
  type: "attempt", data: { id: "a", runId: "r", step: 1, ts: "", scenarioTime: "", signer: "key_minh", signerLabel: "x", principalId: "minh", outcome: "ok", reasonCode: null, txHash: "0x1", simulated: true, errorRaw: null, keySpentAfter: null, principalSpentAfter: null, ...p },
});

describe("routeFor", () => {
  it("attacker pay: attacker -> chain -> vault, then indexer -> API -> SSE", () => {
    const r = routeFor(attempt({ action: { kind: "pay", label: "" } }));
    expect(r).toHaveLength(1);
    expect(r[0].hops.map((h) => h.e)).toEqual(["attacker-chain", "chain-vault", "api-chain", "web-api"]);
    expect(r[0].color).toBe(COLOR.ok);
  });
  it("agent swap goes to vault and dex, red when reverted, amber when blocked at the gate", () => {
    const r = routeFor(attempt({ signer: "key_agent_rebalance", step: 0, action: { kind: "swap", label: "" } }));
    expect(r.map((x) => x.hops[0].e)).toEqual(["agent-chain", "agent-chain"]);
    expect(r.map((x) => x.hops[1].e)).toEqual(["chain-vault", "chain-dex"]);
    expect(routeFor(attempt({ outcome: "reverted", reasonCode: "CARD_DAILY_CAP", action: { kind: "pay", label: "" } }))[0].color).toBe(COLOR.bad);
    const b = routeFor(attempt({ outcome: "blocked_at_protocol", reasonCode: "BLOCKED_AT_PROTOCOL", action: { kind: "approve", label: "" } }));
    expect(b[0].hops[1].e).toBe("chain-allow");
    expect(b[0].color).toBe(COLOR.amber);
  });
  it("council lock starts at the web", () => {
    expect(routeFor(attempt({ signer: "lan", action: { kind: "lock", label: "" } }))[0].hops.map((h) => h.e).slice(0, 3)).toEqual(["web-api", "api-chain", "chain-council"]);
  });
  it("reset has no packets", () => { expect(routeFor({ type: "reset", data: { at: "" } })).toEqual([]); });
});

describe("feed store", () => {
  it("counts per edge, always counts SSE, and reset clears", () => {
    useFeed.getState().clear();
    useFeed.getState().ingest(attempt({ action: { kind: "pay", label: "" } }));
    useFeed.getState().ingest({ type: "city_updated", data: {} as never });
    const s = useFeed.getState();
    expect(s.edges["chain-vault"]).toBe(1);
    expect(s.edges["web-api"]).toBe(2);
    expect(s.sse).toBe(2);
    expect(s.byType.attempt).toBe(1);
    useFeed.getState().ingest({ type: "reset", data: { at: "" } });
    expect(useFeed.getState().total).toBe(0);
    expect(useFeed.getState().edges).toEqual({});
  });
});
