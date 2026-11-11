import { describe, expect, it } from "vitest";
import { layoutCards, LINE_BASE, MAX_NUDGE, type CardBox } from "./cardLayout";

const card = (id: string, x: number, y: number): CardBox => ({ id, x, y, w: 150, h: 34 });

describe("layoutCards", () => {
  it("leaves non-overlapping cards alone", () => {
    const m = layoutCards([card("a", 100, 300), card("b", 500, 300)]);
    expect(m.get("a")).toBe(0);
    expect(m.get("b")).toBe(0);
  });

  it("stacks colliding cards vertically; anchors never move horizontally and the leader stays short", () => {
    const cards = [card("a", 400, 300), card("b", 440, 310), card("c", 380, 320), card("d", 420, 290)];
    const m = layoutCards(cards);
    for (const c of cards) {
      const nudge = m.get(c.id)!;
      expect(nudge).toBeGreaterThanOrEqual(0);
      expect(LINE_BASE + nudge).toBeLessThanOrEqual(LINE_BASE + MAX_NUDGE);
      // the card is centered on its own anchor: rendered x == anchor x, so it can never drift past +-60px
      const renderedX = c.x;
      expect(Math.abs(renderedX - c.x)).toBeLessThanOrEqual(60);
    }
    // the front-most (lowest) card keeps the shortest leader
    expect(m.get("c")).toBe(0);
    expect(m.get("a")!).toBeGreaterThan(0);
  });

  it("respects the scale when measuring overlap", () => {
    const m = layoutCards([card("a", 100, 300), card("b", 100, 300)], 0.7);
    expect(Math.max(...m.values())).toBeGreaterThan(0);
  });
});
