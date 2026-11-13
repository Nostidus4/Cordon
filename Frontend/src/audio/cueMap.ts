// Which cue an attempt makes, from the same fields the stage already uses (outcome / reasonCode / action.kind).
import type { Attempt } from "../types";

export type AttemptCue = "coin" | "coinRich" | "lock" | "bonk" | "clang" | "fizzle";

export function attemptCue(a: Pick<Attempt, "outcome" | "reasonCode" | "action" | "signer">): AttemptCue {
  if (a.outcome === "blocked_at_protocol") return "fizzle";
  if (a.outcome === "reverted") return a.reasonCode === "DISTRICT_DAILY_CAP" ? "clang" : "bonk";
  if (a.action === "lock") return "lock";
  // the assistant's morning swap gets the richer coin
  return a.action === "swap" && a.signer.startsWith("key_agent") ? "coinRich" : "coin";
}
