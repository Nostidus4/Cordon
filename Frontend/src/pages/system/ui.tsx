// Small primitives of the technical dashboard (toy palette: cream cards, coloured accents, chunky corners).
import { useState, type CSSProperties, type ReactNode } from "react";
import { shortHash } from "../../lib/format";

export type Tone = "ok" | "bad" | "warn" | "info" | "violet" | "grey" | "teal";

export const ACCENT = { plaza: "#18a8ff", council: "#8e5cf6", vault: "#0a84d8", spend: "#ff8c42", safety: "#00c7c7", growth: "#8a4eff", resp: "#22c55e", edu: "#1565e8" } as const;

export function Section({ id, accent, title, sub, right, children, className = "" }: {
  id: string; accent: string; /** deprecated, ignored (no ribbon labels any more) */ ribbon?: ReactNode; title: ReactNode; sub?: ReactNode; right?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-t`} className={`sx-card ${className}`} style={{ "--ac": accent } as CSSProperties}>
      <header className="sx-head">
        <div style={{ minWidth: 0, flex: "1 1 320px" }}>
          <h2 id={`${id}-t`} className="sx-title">{title}</h2>
          {sub ? <p className="sx-sub">{sub}</p> : null}
        </div>
        {right ? <div className="flex flex-wrap items-center gap-2">{right}</div> : null}
      </header>
      {children}
    </section>
  );
}

export const Chip = ({ t, mono, children, title }: { t?: Tone; mono?: boolean; children: ReactNode; title?: string }) => (
  <span className={`sx-chip${mono ? " mono" : ""}`} data-t={t} title={title}>{children}</span>
);

export const Tile = ({ k, v, s, tone, sm, style }: { k: ReactNode; v: ReactNode; s?: ReactNode; tone?: "ok" | "bad" | "warn" | "info" | "violet"; sm?: boolean; style?: CSSProperties }) => (
  <div className="sx-tile" data-tone={tone} style={style}><span className="k">{k}</span><span className={`v${sm ? " sm" : ""}`}>{v}</span>{s ? <span className="s">{s}</span> : null}</div>
);

/** Spec reference chip: no longer rendered (kept so existing imports keep working). */
export const Ref = (_: { children?: ReactNode }) => null;

/** A calm stat: small label, large number. */
export const Stat = ({ k, v, tone }: { k: ReactNode; v: ReactNode; tone?: "ok" | "bad" | "warn" | "violet" }) => (
  <div className="sx-stat" data-tone={tone}><span className="k">{k}</span><span className="v">{v}</span></div>
);

export const Empty = ({ children }: { children: ReactNode }) => <div className="sx-empty">{children}</div>;

/** Monospace hash with a copy-on-click and the "mô phỏng" badge (simulated chain, spec §12). */
export function Hash({ value, simulated, head = 8, tail = 6 }: { value: string; simulated?: boolean; head?: number; tail?: number }) {
  const [copied, setCopied] = useState(false);
  const copy = (e: React.MouseEvent) => {
    e.stopPropagation();
    try { void navigator.clipboard?.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch { /* clipboard unavailable */ }
  };
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <button type="button" className="mono rounded-md px-1 hover:bg-[#f1e4cc]" style={{ border: 0, background: "transparent", cursor: "copy", color: "inherit" }} onClick={copy} title={`${value} · bấm để chép`}>
        {copied ? "đã chép ✓" : shortHash(value, head, tail)}
      </button>
      {simulated ? <Chip t="grey">mô phỏng</Chip> : null}
    </span>
  );
}

export function CapBar({ spent, cap, color }: { spent: bigint; cap: bigint | null; color?: string }) {
  if (!cap || cap <= 0n) return <span className="sx-chip" data-t="warn" title="principalDailyCap = 0: không có cổng chung">không đặt</span>;
  const pct = Math.min(100, Number((spent * 1000n) / cap) / 10);
  const c = color ?? (pct >= 100 ? "#ff2d3d" : pct >= 80 ? "#ffb300" : "#22c55e");
  return <div className="sx-bar" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%`, background: c }} /></div>;
}

// ---------- JSON viewer ----------
const TOKEN = /("(?:\\.|[^"\\])*"(?:\s*:)?|\btrue\b|\bfalse\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
export function JsonView({ value, maxHeight, style }: { value: unknown; maxHeight?: number; style?: CSSProperties }) {
  const text = JSON.stringify(value, null, 2) ?? "undefined";
  const parts = text.split(TOKEN);
  return (
    <pre className="sx-json sx-scroll" style={{ maxHeight, ...style }}>
      {parts.map((p, i) => {
        if (i % 2 === 0) return p;
        const cls = p.endsWith(":") ? "k" : p.startsWith('"') ? "s" : p === "null" ? "z" : p === "true" || p === "false" ? "b" : "n";
        return <span key={i} className={cls}>{p}</span>;
      })}
    </pre>
  );
}

export const CheckGlyph = ({ s }: { s: "pass" | "fail" | "skip" | "gate" | "gatefail" }) => <>{s === "pass" || s === "gate" ? "✓" : s === "fail" || s === "gatefail" ? "✕" : "·"}</>;

/** Whole base-unit string -> bigint (tolerates null). */
export const big = (raw: string | undefined | null): bigint => { try { return raw ? BigInt(raw) : 0n; } catch { return 0n; } };

export const fmtClock = (iso: string) => { try { return new Date(iso).toLocaleTimeString("vi-VN", { hour12: false }); } catch { return iso; } };
