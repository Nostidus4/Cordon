import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Attempt } from "../types";
import type { DistrictKey } from "../types/district";
import { NodeRejectCard, findNodeReject } from "./NodeRejectCard";

const m = (n: number) => ({ raw: String(n), display: String(n) });
const att = (o: Partial<Attempt>): Attempt => ({
  id: 1, scenarioRunId: null, step: 7, ts: 0, displayTime: "14:05", signer: "key_minh", signerLabel: "Khoá của Minh", principalId: "minh", action: "approve",
  outcome: "blocked_at_protocol", reasonCode: "BLOCKED_AT_PROTOCOL", reasonTextVi: null, reasonTextEn: null, txHash: null, simulated: false,
  errorRaw: "cannot issue transaction from non-allow listed address: 0xabc", block: null, token: null, to: null, toLabel: null, amount: null,
  keySpentAfter: null, principalSpentAfter: null, source: "server", badge: null, ...o,
});
const key = (i: number, allowListed: boolean): DistrictKey => ({ address: `0x${i}`, seedId: `k${i}`, kind: "HUMAN", label: `K${i}`, active: allowListed, allowListed, dailyCap: m(1), spentToday: m(0), remaining: m(1) });

describe("NodeRejectCard", () => {
  it("renders the node message, no-tx line and blocked keys on BLOCKED_AT_PROTOCOL", () => {
    const html = renderToStaticMarkup(<NodeRejectCard attempt={att({})} keys={[1, 2, 3, 4, 5].map((i) => key(i, false))} />);
    expect(html).toContain("Node của Guardian L1 từ chối giao dịch");
    expect(html).toContain("cannot issue transaction from non-allow listed address: 0xabc");
    expect(html).toContain("Không có mã giao dịch, không vào block");
    expect(html.match(/bị chặn/g)).toHaveLength(5);
    expect(html).not.toContain("mô phỏng");
  });
  it("is hidden for other outcomes or no attempt", () => {
    expect(renderToStaticMarkup(<NodeRejectCard attempt={att({ outcome: "reverted", reasonCode: "DISTRICT_DAILY_CAP", errorRaw: null })} />)).toBe("");
    expect(renderToStaticMarkup(<NodeRejectCard attempt={null} />)).toBe("");
  });
  it("labels simulated data as mô phỏng and never invents a missing node message", () => {
    const html = renderToStaticMarkup(<NodeRejectCard attempt={att({ simulated: true, errorRaw: null })} keys={[key(1, true)]} />);
    expect(html).toContain("mô phỏng");
    expect(html).not.toContain("node-reject-raw");
    expect(html).toContain("còn phép");
  });
  it("findNodeReject picks the last blocked attempt", () => {
    expect(findNodeReject([att({ id: 1 }), att({ id: 2, outcome: "ok", reasonCode: null }), att({ id: 3 })])?.id).toBe(3);
    expect(findNodeReject([att({ id: 2, outcome: "ok", reasonCode: null })])).toBeNull();
  });
});
