import { describe, expect, it } from "vitest";
import type { Finding, ProposedChange } from "../../types";
import { executorOf, isScene5, linkedScene5, pickProposalId, proposalForFinding, suggestionsFrom, timelockView } from "./proposals.logic";

const ch = (cap: number): ProposedChange => ({ kind: "set_district_cap", principalId: "minh", cap: { raw: String(cap), display: String(cap) } });
const f = (id: string, proposal: ProposedChange | null) => ({ id, proposal }) as unknown as Finding;

describe("pickProposalId", () => {
  const list = [{ id: 3, status: "executed" as const }, { id: 5, status: "open" as const }, { id: 4, status: "open" as const }];
  it("honours ?id, else oldest open, else newest", () => {
    expect(pickProposalId(list, 3)).toBe(3);
    expect(pickProposalId(list, 99)).toBe(4);
    expect(pickProposalId([{ id: 1, status: "executed" }, { id: 2, status: "cancelled" }], null)).toBe(2);
    expect(pickProposalId([], 4)).toBeNull();
  });
});

describe("suggestions", () => {
  it("hides fixes that an open proposal already carries", () => {
    const open = [{ status: "open" as const, change: ch(1), id: 7 }, { status: "executed" as const, change: ch(2), id: 8 }];
    const fs = [f("a", ch(1)), f("b", ch(2)), f("c", null)];
    expect(suggestionsFrom(fs, open).map((x) => x.id)).toEqual(["b"]);
    expect(proposalForFinding(fs[0], open)?.id).toBe(7);
    expect(proposalForFinding(fs[1], open)).toBeUndefined();
  });
});

describe("scene 5 + timelock", () => {
  it("links #12 and #13", () => {
    const all = [{ id: 12 }, { id: 13 }] as never[];
    expect(isScene5({ id: 12 })).toBe(true);
    expect(isScene5({ id: 4 })).toBe(false);
    expect(linkedScene5({ id: 12 }, all)?.id).toBe(13);
    expect(linkedScene5({ id: 4 }, all)).toBeUndefined();
  });
  it("counts down to eta and becomes ready", () => {
    const p = { status: "open" as const, queued: true, eta: 100 };
    expect(timelockView(p, 90)).toEqual({ left: 10, ready: false });
    expect(timelockView(p, 100)).toEqual({ left: 0, ready: true });
    expect(timelockView({ ...p, queued: false }, 90)).toBeNull();
    expect(timelockView({ ...p, status: "executed" }, 90)).toBeNull();
    expect(timelockView({ ...p, eta: null }, 90)).toBeNull();
  });
  it("executor prefers an approver", () => {
    expect(executorOf({ approvals: ["lan", "trang"] }, [{ id: "trang" }])).toBe("lan");
    expect(executorOf({ approvals: [] }, [{ id: "trang" }])).toBe("trang");
  });
});
