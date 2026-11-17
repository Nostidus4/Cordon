import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

async function render(apiMode: "mock" | "live") {
  vi.resetModules();
  vi.doMock("../config/env", () => ({ env: { apiMode } }));
  const { TopBar } = await import("./TopBar");
  const { Footer } = await import("../components/layout/Footer");
  const bar = renderToStaticMarkup(<MemoryRouter><TopBar scene="look" night={false} onGo={() => {}} onNight={() => {}} onReset={() => {}} resetting={false} /></MemoryRouter>);
  const foot = renderToStaticMarkup(<Footer />);
  return { bar, foot };
}

afterEach(() => vi.doUnmock("../config/env"));

describe("TopBar / Footer by API mode", () => {
  it("mock: no live wording or dot, shows the simulated-chain pill linking to /bang-chung", async () => {
    const { bar, foot } = await render("mock");
    expect(bar).not.toContain("Trực tiếp");
    expect(bar).not.toContain("toy-live");
    expect(bar).toContain("Chạy thử hay xem lại");
    expect(bar).toContain("Chain mô phỏng");
    expect(bar).toContain('href="/bang-chung"');
    expect(foot).toContain("chain mô phỏng trong trình duyệt");
    expect(foot).not.toContain("chạy trên Avalanche Fuji testnet");
  });
  it("live: unchanged Trực tiếp toggle, no pill, Fuji footer", async () => {
    const { bar, foot } = await render("live");
    expect(bar).toContain("Trực tiếp");
    expect(bar).toContain("Chạy thật hay xem lại");
    expect(bar).not.toContain("Chain mô phỏng");
    expect(foot).toContain("chạy trên Avalanche Fuji testnet");
  });
});
