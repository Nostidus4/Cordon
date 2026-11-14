import { describe, expect, it } from "vitest";
import type { Proposal } from "../types";
import { countdownText, formatCountdown, queuedProposals, secondsLeft } from "./timelock";

describe("timelock countdown", () => {
  it("formats m:ss and never goes negative", () => {
    expect(formatCountdown(45)).toBe("0:45");
    expect(formatCountdown(65)).toBe("1:05");
    expect(formatCountdown(600)).toBe("10:00");
    expect(formatCountdown(-3)).toBe("0:00");
    expect(formatCountdown(44.9)).toBe("0:44");
  });
  it("counts down to the eta then says it is ready", () => {
    expect(secondsLeft(1000, 955)).toBe(45);
    expect(secondsLeft(1000, 1000)).toBe(0);
    expect(secondsLeft(1000, 1200)).toBe(0);
    expect(countdownText(1000, 955)).toBe("Còn 0:45 nữa mới thực thi");
    expect(countdownText(1000, 1000)).toBe("Đã tới giờ, đang chờ thực thi");
  });
  it("keeps only queued proposals with an eta", () => {
    const p = (id: number, queued: boolean, eta: number | null) => ({ id, queued, eta }) as Proposal;
    expect(queuedProposals([p(1, false, null), p(2, true, 10), p(3, true, null)]).map((x) => x.id)).toEqual([2]);
    expect(queuedProposals(undefined)).toEqual([]);
  });
});
