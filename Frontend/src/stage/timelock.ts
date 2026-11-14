// Timelock (#77) display logic: a queued Council proposal shows "Còn 0:45 nữa mới thực thi" until its eta.
import type { Proposal } from "../types";

/** Seconds -> "m:ss" (never negative). */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Seconds left until `eta` at `nowSec` (unix seconds); 0 once it has passed. */
export const secondsLeft = (eta: number, nowSec: number): number => Math.max(0, eta - nowSec);

export function countdownText(eta: number, nowSec: number): string {
  const left = secondsLeft(eta, nowSec);
  return left > 0 ? `Còn ${formatCountdown(left)} nữa mới thực thi` : "Đã tới giờ, đang chờ thực thi";
}

/** Proposals that have 2/3 and wait for their eta (the backend sets `queued`). */
export const queuedProposals = (ps: Proposal[] | undefined): Proposal[] => (ps ?? []).filter((p) => p.queued && p.eta != null);
