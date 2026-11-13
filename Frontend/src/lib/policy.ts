/** The policy version people see. The vault's counter (`policyVersion`) also counts the proposals that seeded
 * the deployment, so a real chain starts above 1; the backend sends `policyLabel` (= raw - baseline + 1) and the mock
 * (no `policyLabel`) already counts from 1. Use this for every label and every "is policy v2 active" test. */
export const policyLabel = (x?: { policyVersion: number; policyLabel?: number } | null): number | undefined =>
  x ? (x.policyLabel ?? x.policyVersion) : undefined;
