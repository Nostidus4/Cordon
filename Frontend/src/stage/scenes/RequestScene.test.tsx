import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../hooks/useAttempts", () => ({ useAttempts: () => ({ data: undefined }) }));

describe("scene 5 finale", () => {
  it("the 'Xem tóm tắt' button wrapper opts back into pointer events (overlay <main> is pointer-events-none)", async () => {
    const { SummaryCta } = await import("./RequestScene");
    const html = renderToStaticMarkup(<SummaryCta onClick={() => {}} />);
    expect(html).toContain("Xem tóm tắt");
    expect(html).toMatch(/class="[^"]*pointer-events-auto/);
  });
  it("the end card is a clickable dialog with the three exits", async () => {
    const { EndCard } = await import("../EndCard");
    const html = renderToStaticMarkup(<MemoryRouter><EndCard /></MemoryRouter>);
    expect(html).toContain('data-slot="end-card"');
    expect(html).toContain('role="dialog"');
    expect(html).toContain("pointer-events-auto");
    expect(html).toContain("Cùng một vụ chiếm máy, hai kết cục");
    expect(html).toContain("← Quay lại");
    expect(html).toContain("Xem lại từ đầu");
    expect(html).toContain('href="/he-thong"');
  });
});
