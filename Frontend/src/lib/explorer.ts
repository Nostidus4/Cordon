// Build explorer links for tx hashes. Simulated tx (mock / CHAIN_MODE=sim) have no explorer page.
import { env } from "../config/env";

export function txUrl(hash: string | null | undefined, simulated = false): string | null {
  if (!hash || simulated) return null;
  return `${env.explorerUrl.replace(/\/$/, "")}/tx/${hash}`;
}
