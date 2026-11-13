import { describe, expect, it } from "vitest";
import { COLOR, routeFor, useFeed } from "./feed";
import type { Attempt, StreamMessage } from "../../types";
import { attemptFixture } from "../../lib/attemptFixture";

const attempt = (p: Partial<Attempt>): StreamMessage => ({ type: "attempt", data: attemptFixture(p) });

describe("routeFor", () => {
  it("attacker pay: attacker -> chain -> vault, then indexer -> API -> SSE", () => {
    const r = routeFor(attempt({ action: "pay" }));
    expect(r).toHaveLength(1);
    expect(r[0].hops.map((h) => h.e)).toEqual(["attacker-chain", "chain-vault", "api-chain", "web-api"]);
    expect(r[0].color).toBe(COLOR.ok);
  });
  it("agent swap goes to vault and dex, red when reverted, amber when blocked at the gate", () => {
    const r = routeFor(attempt({ signer: "key_agent_rebalance", source: "agent", step: null, action: "swap" }));
    expect(r.map((x) => x.hops[0].e)).toEqual(["agent-chain", "agent-chain"]);
    expect(r.map((x) => x.hops[1].e)).toEqual(["chain-vault", "chain-dex"]);
    expect(routeFor(attempt({ outcome: "reverted", reasonCode: "CARD_DAILY_CAP", action: "pay" }))[0].color).toBe(COLOR.bad);
    const b = routeFor(attempt({ outcome: "blocked_at_protocol", reasonCode: "BLOCKED_AT_PROTOCOL", action: "approve" }));
    expect(b[0].hops[1].e).toBe("chain-allow");
    expect(b[0].color).toBe(COLOR.amber);
  });
  it("council lock starts at the web", () => {
    expect(routeFor(attempt({ signer: "lan", action: "lock" }))[0].hops.map((h) => h.e).slice(0, 3)).toEqual(["web-api", "api-chain", "chain-council"]);
  });
  it("reset has no packets", () => { expect(routeFor({ type: "reset", data: { at: "" } })).toEqual([]); });
});

describe("feed store", () => {
  it("counts per edge, always counts SSE, and reset clears", () => {
    useFeed.getState().clear();
    useFeed.getState().ingest(attempt({ action: "pay" }));
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
