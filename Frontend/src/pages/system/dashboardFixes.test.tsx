// Regression tests for the dashboard QA pass: unknown reason codes, tab redirects, tab error boundary, timelock total, error mapping, retry, "Đang chạy gì" hold state.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { reasonTextVi } from "../../lib/ops";
import { needsNav } from "../../tour/TourOverlay";
import { withRetry } from "./evidence/rpc";
import { holdState, incidentCellText } from "./agents.logic";
import { apiErrorVi, isBenignApiError, timelockTotal } from "./proposals.logic";
import { TabBoundary, tabRedirect } from "./SystemPage";
import { errorName, traceAttempt } from "./trace";
import type { GraphSnapshot, Proposal } from "../../types";

describe("unknown reason codes (the code is an open string on the wire)", () => {
  const unknown = "SOMETHING_NEW_FROM_BACKEND" as never;
  it("reasonTextVi / errorName / traceAttempt never throw", () => {
    expect(reasonTextVi(unknown)).toBe("Bị chặn");
    expect(errorName(unknown)).toBeNull();
    expect(() => traceAttempt({ action: "pay", outcome: "reverted", reasonCode: unknown })).not.toThrow();
    expect(traceAttempt({ action: "pay", outcome: "reverted", reasonCode: unknown }).summary).toContain("Bị chặn");
  });
});

describe("tab redirects keep the query", () => {
  it("tro-ly -> agent with ?pane", () => expect(tabRedirect("tro-ly", "?pane=hoi-dap")).toBe("/he-thong/agent?pane=hoi-dap"));
  it("unknown tab -> tong-quan with ?tour=1", () => expect(tabRedirect("nope", "?tour=1")).toBe("/he-thong/tong-quan?tour=1"));
  it("known tab stays", () => expect(tabRedirect("hoi-dong", "?id=12")).toBeNull());
});

describe("tour navigation guard", () => {
  it("navigates when only the query differs", () => {
    expect(needsNav("/he-thong/agent", "/he-thong/agent?pane=hoi-dap")).toBe(true);
    expect(needsNav("/he-thong/hoi-dong?id=12", "/he-thong/hoi-dong")).toBe(true);
  });
  it("stays when identical or no target", () => {
    expect(needsNav("/he-thong/agent", "/he-thong/agent")).toBe(false);
    expect(needsNav(undefined, "/x")).toBe(false);
  });
});

describe("TabBoundary", () => {
  it("renders children normally and a notice once failed", () => {
    expect(TabBoundary.getDerivedStateFromError()).toEqual({ failed: true });
    const b = new TabBoundary({ children: "ok" });
    expect(b.render()).toBe("ok");
    b.state = { failed: true };
    const html = renderToStaticMarkup(b.render() as never);
    expect(html).toContain("Mục này gặp lỗi khi hiển thị");
    expect(html).toContain("Thử lại");
  });
});

describe("timelockTotal", () => {
  const p = (eta: number | null, at: (number | null)[]) => ({ eta, members: at.map((approvedAt) => ({ approvedAt })) }) as unknown as Pick<Proposal, "eta" | "members">;
  it("is eta minus the approval that queued it, even when opened with 3 s left", () => {
    expect(timelockTotal(p(1015, [1000, 1000]), 3)).toBe(15);
    expect(timelockTotal(p(1030, [990, 1015, null]), 3)).toBe(15);
  });
  it("falls back to the largest seen countdown, at least 1", () => {
    expect(timelockTotal(p(1015, [null, null]), 9)).toBe(9);
    expect(timelockTotal(p(null, []), 0)).toBe(1);
  });
});

describe("apiErrorVi", () => {
  it("maps known codes to plain Vietnamese without the raw code", () => {
    for (const c of ["ALREADY_APPROVED", "CONFLICT_OF_INTEREST", "NOT_COUNCIL_MEMBER", "PROPOSAL_NOT_OPEN", "TIMELOCK_NOT_READY", "NEEDS_THRESHOLD"]) {
      const t = apiErrorVi(c);
      expect(t).not.toMatch(/[A-Z]{3,}_[A-Z]/);
      expect(t.length).toBeGreaterThan(10);
    }
    expect(apiErrorVi("ALREADY_APPROVED")).toBe("Thành viên này đã duyệt đề xuất rồi.");
  });
  it("unknown / missing code falls back to a generic message", () => {
    expect(apiErrorVi("WHATEVER")).toBe("Có lỗi xảy ra, thử lại sau ít giây.");
    expect(apiErrorVi(null)).toBe("Có lỗi xảy ra, thử lại sau ít giây.");
  });
  it("ALREADY_APPROVED is benign", () => { expect(isBenignApiError("ALREADY_APPROVED")).toBe(true); expect(isBenignApiError("PROPOSAL_NOT_OPEN")).toBe(false); });
});

describe("withRetry", () => {
  it("retries with backoff and returns the first success", async () => {
    let n = 0; const waits: number[] = [];
    const r = await withRetry(async () => { if (++n < 3) throw new Error("429"); return "ok"; }, 4, 100, async (ms) => { waits.push(ms); });
    expect(r).toBe("ok"); expect(n).toBe(3); expect(waits).toEqual([100, 200]);
  });
  it("throws the last error after the tries are used", async () => {
    await expect(withRetry(async () => { throw new Error("down"); }, 3, 1, async () => {})).rejects.toThrow("down");
  });
});

describe("Đang chạy gì: hold state", () => {
  const g = (paused: boolean, locked: boolean) => ({ nodes: [{ id: "vault", data: { paused } }], districts: [{ label: "Khu Minh", locked }, { label: "Khu Lan", locked: false }] }) as unknown as GraphSnapshot;
  it("calm when nothing is stopped", () => expect(incidentCellText({ openIncident: null }, holdState(g(false, false)))).toEqual({ text: "không có sự cố mở", tone: "calm" }));
  it("shows pause and lock", () => {
    expect(incidentCellText({ openIncident: null }, holdState(g(true, false))).text).toBe("kho đang dừng");
    expect(incidentCellText({ openIncident: null }, holdState(g(false, true))).text).toBe("đã khoá Khu Minh");
    expect(incidentCellText({ openIncident: null }, holdState(g(true, true))).text).toBe("kho đang dừng · đã khoá Khu Minh");
  });
  it("an open incident wins", () => expect(incidentCellText({ openIncident: { titleVi: "Sự cố X" } as never }, holdState(g(true, true)))).toEqual({ text: "Sự cố X", tone: "bad" }));
  it("no graph yet is calm", () => expect(holdState(undefined)).toEqual({ paused: false, lockedLabels: [] }));
});
