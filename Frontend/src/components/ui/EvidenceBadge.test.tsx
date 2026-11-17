import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const envMock = vi.hoisted(() => ({ explorerUrl: "" }));
vi.mock("../../config/env", () => ({ env: envMock }));
// Tooltip portals into document.body (no DOM in this test env): render children plus content inline.
vi.mock("./Tooltip", () => ({ Tooltip: ({ children, content }: { children: React.ReactNode; content: React.ReactNode }) => <>{children}<i hidden>{content}</i></> }));

import { EvidenceBadge } from "./EvidenceBadge";
import { txUrl } from "../../lib/explorer";

const H = "0x" + "ab".repeat(32);
const html = (p: Parameters<typeof EvidenceBadge>[0]) => renderToStaticMarkup(<EvidenceBadge {...p} />);

describe("EvidenceBadge", () => {
  beforeEach(() => { envMock.explorerUrl = ""; });

  it("ok real tx -> giao dịch thật", () => {
    const h = html({ txHash: H, outcome: "ok" });
    expect(h).toContain("giao dịch thật");
    expect(h).not.toContain("revert");
  });
  it("reverted real tx -> chain refusal badge, still shows the hash, not 'giao dịch thật'", () => {
    const h = html({ txHash: H, outcome: "reverted", reasonCode: "DISTRICT_LOCKED" });
    expect(h).toContain("bị chain từ chối (revert)");
    expect(h).toContain("0xabab");
    expect(h).toContain("PrincipalIsLocked");
    expect(h).not.toContain("giao dịch thật");
  });
  it("simulated -> mô phỏng (even when reverted)", () => {
    expect(html({ txHash: H, simulated: true, outcome: "ok" })).toContain("mô phỏng");
    expect(html({ txHash: H, simulated: true, outcome: "reverted" })).toContain("mô phỏng");
  });
  it("protocol-blocked (no hash) keeps its own card", () => {
    const h = html({ outcome: "blocked_at_protocol", errorRaw: "rpc error -32000: not on the TxAllowList" });
    expect(h).toContain("bị chain từ chối");
    expect(h).not.toContain("(revert)");
  });
  it("no explorer: no link, copy affordance + verification hint", () => {
    for (const outcome of ["ok", "reverted"] as const) {
      const h = html({ txHash: H, outcome });
      expect(h).not.toContain("<a ");
      expect(h).toContain("<button");
      expect(h).toContain("chép");
      expect(h).toContain("cast receipt · trang Bằng chứng");
    }
    expect(txUrl(H)).toBeNull();
  });
  it("explorer set: links to /tx/<hash>", () => {
    envMock.explorerUrl = "https://scan.example/";
    expect(html({ txHash: H, outcome: "ok" })).toContain(`href="https://scan.example/tx/${H}"`);
    expect(html({ txHash: H, outcome: "reverted" })).toContain(`href="https://scan.example/tx/${H}"`);
  });
});
