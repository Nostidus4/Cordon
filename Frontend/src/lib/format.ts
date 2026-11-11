// Money display `30.000`, `/ngày`, percent `6,5%` - bigint only.
export const USDC_DECIMALS = 6;

const group = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** Base units -> "30.000"; non-zero fraction -> comma decimals ("1,5"). */
export function fmtDisplay(base: bigint, decimals = USDC_DECIMALS): string {
  const neg = base < 0n;
  const abs = neg ? -base : base;
  const unit = 10n ** BigInt(decimals);
  const whole = abs / unit;
  const frac = abs % unit;
  let out = group(whole.toString());
  if (frac) out += "," + frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return (neg ? "-" : "") + out;
}

/** Whole display units -> base units. */
export const toBase = (n: number | bigint, decimals = USDC_DECIMALS): bigint => BigInt(n) * 10n ** BigInt(decimals);

export const money = (base: bigint, decimals = USDC_DECIMALS): { raw: string; display: string } => ({
  raw: base.toString(),
  display: fmtDisplay(base, decimals),
});

export const rawToBig = (m: { raw: string } | string): bigint => BigInt(typeof m === "string" ? m : m.raw);

/** "30.000" or "30.000/ngày" */
export const fmtDaily = (display: string) => `${display}/ngày`;

/** 6.5 -> "6,5%" ; 5 -> "5%" ; 1.5 -> "1,5%" */
export function fmtPercent(p: number, maxDecimals = 1): string {
  const s = Number(p.toFixed(maxDecimals)).toString().replace(".", ",");
  return `${s}%`;
}

/** Percent of `part` over `whole` as number with 1 decimal using bigint maths (no float on money). */
export function percentOf(part: bigint, whole: bigint): number {
  if (whole === 0n) return 0;
  return Number((part * 1000n) / whole) / 10;
}

export const shortHash = (h: string, head = 6, tail = 4) => (h.length > head + tail + 1 ? `${h.slice(0, head)}…${h.slice(-tail)}` : h);

/** "09:00" from ISO or scenario clock */
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
