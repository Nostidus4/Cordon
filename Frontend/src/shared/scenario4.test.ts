import { expect, it } from "vitest";
import { SCENE4_STEPS } from "./scenario4";

it("matches spec §4.3 table", () => {
  expect(SCENE4_STEPS).toHaveLength(8);
  expect(SCENE4_STEPS.map((s) => s.reason ?? "ok")).toEqual([
    "ok", "RECIPIENT_NOT_ALLOWED", "PROTOCOL_NOT_ALLOWED", "ok", "ok", "DISTRICT_DAILY_CAP", "ok", "BLOCKED_AT_PROTOCOL",
  ]);
  expect(SCENE4_STEPS.map((s) => s.sharedAfter)).toEqual([5000, 5000, 5000, 15000, 25000, 25000, null, null]);
});
