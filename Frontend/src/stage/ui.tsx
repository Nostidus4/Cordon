// Toy UI kit of the stage: card, pill button, counter, speech bubble, confetti, stamp and a few hand-drawn inline icons.
import { animate, motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from "react";
import type { MemberId } from "../types";

export const useReduced = () => !!useReducedMotion();

// ---------- card ----------
export function ToyCard({ children, className = "", style, tone, delay = 0, label, ...rest }: {
  children: ReactNode; className?: string; style?: CSSProperties; tone?: "red" | "sky"; delay?: number; label?: string;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "className" | "children">) {
  const reduced = useReduced();
  return (
    <motion.section
      aria-label={label}
      data-tone={tone}
      className={`toy-card pointer-events-auto ${className}`}
      style={style}
      initial={reduced ? false : { opacity: 0, y: 46, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 240, damping: 20, delay }}
      {...(rest as object)}
    >
      {children}
    </motion.section>
  );
}

// ---------- scene ribbon: a little tab stuck on top of a card, in the scene's colour (same colours as the stepper) ----------
export const SCENE_COLOR = { look: "#7a47e6", try: "#1565e8", fix: "#d9691f", incident: "#d62839", request: "#0e968c" } as const;
export function Ribbon({ scene, children }: { scene: keyof typeof SCENE_COLOR; children: ReactNode }) {
  return (
    <span className="absolute -top-4 left-6 z-10 rounded-full px-4 pb-1 pt-1.5 font-toy text-[15px] font-bold leading-none text-white"
      style={{ background: SCENE_COLOR[scene], boxShadow: "0 3px 0 rgba(0,0,0,.28)", transform: "rotate(-2.5deg)" }}>{children}</span>
  );
}

// ---------- button ----------
export type ToyColor = "violet" | "orange" | "teal" | "red" | "green" | "blue" | "cream";
export function ToyButton({ color = "violet", size, pulse, done, icon, children, className = "", ...rest }: {
  color?: ToyColor; size?: "lg" | "sm" | "xs"; pulse?: boolean; /** already done: stays in colour, just not pressable */ done?: boolean; icon?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" data-c={color} data-size={size} data-pulse={pulse ? "true" : undefined} data-done={done ? "true" : undefined} className={`toy-btn ${className}`} {...rest}>
      {icon}{children}
    </button>
  );
}

// ---------- counter ----------
/** Eases a number toward `value` (display units, plain number); `format` renders it. */
export function useEasedNumber(value: number, duration = 0.5): number {
  const reduced = useReduced();
  const [shown, setShown] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    if (reduced) { setShown(value); prev.current = value; return; }
    const c = animate(prev.current, value, { duration, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => { prev.current = v; setShown(v); } });
    return () => c.stop();
  }, [value, duration, reduced]);
  return shown;
}
const group = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
export function Counter({ value, className = "num", style, duration }: { value: number; className?: string; style?: CSSProperties; duration?: number }) {
  const v = useEasedNumber(value, duration);
  return <span className={className} style={style} aria-label={group(value)}>{group(v)}</span>;
}

// ---------- confetti (subtle) ----------
export function Confetti({ burst }: { burst: number }) {
  const reduced = useReduced();
  const pieces = useMemo(() => Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2 + (i % 3) * 0.2;
    const r = 70 + (i % 4) * 22;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r - 24, rot: (i * 47) % 360, c: ["#7a47e6", "#22d3c5", "#ff9a55", "#ffc43d", "#3dd672"][i % 5], w: 7 + (i % 3) * 3 };
  }), []);
  if (!burst || reduced) return null;
  return (
    <div key={burst} aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-0 w-0">
      {pieces.map((p, i) => (
        <motion.span key={i} className="absolute block rounded-[3px]" style={{ width: p.w, height: p.w * 0.6, background: p.c, left: 0, top: 0 }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.4 }}
          animate={{ x: p.x, y: [0, p.y, p.y + 46], opacity: [1, 1, 0], rotate: p.rot, scale: 1 }}
          transition={{ duration: 1.1, ease: "easeOut" }} />
      ))}
    </div>
  );
}

// ---------- stamp ----------
export function Stamp({ children, sub }: { children: ReactNode; sub?: string }) {
  const reduced = useReduced();
  return (
    <motion.div className="toy-stamp" initial={reduced ? false : { scale: 2.2, opacity: 0, rotate: -20 }} animate={{ scale: 1, opacity: 1, rotate: -6 }}
      transition={{ type: "spring", stiffness: 420, damping: 15 }}>
      <span style={{ fontSize: 19, lineHeight: 1.05 }}>{children}</span>
      {sub ? <span style={{ fontSize: 15, lineHeight: 1.1 }}>{sub}</span> : null}
    </motion.div>
  );
}

// ---------- icons (hand-drawn, rounded, ink outline) ----------
const INK = "#2d2250";
interface IconProps { size?: number; color?: string; className?: string; title?: string }
const svgProps = (size: number, title?: string) => ({ width: size, height: size, viewBox: "0 0 48 48", role: title ? "img" : undefined, "aria-hidden": title ? undefined : true, "aria-label": title, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const });

export function PersonIcon({ size = 36, color = "#ff9a55", className, title }: IconProps) {
  return (
    <svg {...svgProps(size, title)} className={className}>
      <circle cx="24" cy="17" r="8.5" fill="#ffe0c2" stroke={INK} strokeWidth="2.6" />
      <path d="M9 42c0-8.6 6.7-14 15-14s15 5.4 15 14z" fill={color} stroke={INK} strokeWidth="2.6" />
      <circle cx="21" cy="17" r="1.3" fill={INK} /><circle cx="27" cy="17" r="1.3" fill={INK} />
      <path d="M21.2 20.6c1.7 1.5 3.9 1.5 5.6 0" stroke={INK} strokeWidth="2" />
    </svg>
  );
}
export function RobotIcon({ size = 36, color = "#8e5cf6", className, title }: IconProps) {
  return (
    <svg {...svgProps(size, title)} className={className}>
      <path d="M24 6v6" stroke={INK} strokeWidth="2.6" /><circle cx="24" cy="5.5" r="2.6" fill="#ffc43d" stroke={INK} strokeWidth="2.2" />
      <rect x="8" y="12" width="32" height="26" rx="10" fill={color} stroke={INK} strokeWidth="2.6" />
      <rect x="13" y="19" width="22" height="12" rx="6" fill="#fff" stroke={INK} strokeWidth="2.2" />
      <circle cx="19.5" cy="25" r="2.3" fill={INK} /><circle cx="28.5" cy="25" r="2.3" fill={INK} />
      <path d="M4 24v6M44 24v6" stroke={INK} strokeWidth="3.2" />
    </svg>
  );
}
export function ServerIcon({ size = 36, color = "#1565e8", className, title }: IconProps) {
  return (
    <svg {...svgProps(size, title)} className={className}>
      <rect x="7" y="7" width="34" height="15" rx="6" fill={color} stroke={INK} strokeWidth="2.6" />
      <rect x="7" y="26" width="34" height="15" rx="6" fill="#4d8cf5" stroke={INK} strokeWidth="2.6" />
      <circle cx="15" cy="14.5" r="2" fill="#3dd672" stroke={INK} strokeWidth="1.4" /><circle cx="15" cy="33.5" r="2" fill="#ffc43d" stroke={INK} strokeWidth="1.4" />
      <path d="M24 14.5h11M24 33.5h11" stroke="#fff" strokeWidth="2.6" />
    </svg>
  );
}
export function ShieldIcon({ size = 36, color = "#22d3c5", className, title }: IconProps) {
  return (
    <svg {...svgProps(size, title)} className={className}>
      <path d="M24 5l16 6v12c0 10-6.5 16.5-16 20C14.500 39.500 8 33 8 23V11z" fill={color} stroke={INK} strokeWidth="2.6" />
      <path d="M16.500 24.500l5 5 10-11" stroke="#fff" strokeWidth="4" />
    </svg>
  );
}
export function GateIcon({ size = 36, color = "#8e5cf6", className, title }: IconProps) {
  return (
    <svg {...svgProps(size, title)} className={className}>
      <rect x="6" y="14" width="9" height="28" rx="3" fill="#d9d3ee" stroke={INK} strokeWidth="2.6" />
      <rect x="33" y="14" width="9" height="28" rx="3" fill="#d9d3ee" stroke={INK} strokeWidth="2.6" />
      <path d="M12 22c0-11 24-11 24 0" fill="none" stroke={INK} strokeWidth="9" /><path d="M12 22c0-11 24-11 24 0" stroke={color} strokeWidth="5" />
      <circle cx="24" cy="12.5" r="3" fill="#ffc43d" stroke={INK} strokeWidth="2" />
    </svg>
  );
}
export function SunIcon({ size = 20 }: { size?: number }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden><circle cx="12" cy="12" r="5" fill="#ffc43d" stroke={INK} strokeWidth="2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" stroke={INK} strokeWidth="2" strokeLinecap="round" /></svg>);
}
export function MoonIcon({ size = 20 }: { size?: number }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden><path d="M19 14.500A8 8 0 019.500 5 8 8 0 1019 14.500z" fill="#b9a0f3" stroke={INK} strokeWidth="2" strokeLinejoin="round" /></svg>);
}
export function FlagIcon({ size = 20, color = "#ffc43d" }: { size?: number; color?: string }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden><path d="M6 21V4" stroke={INK} strokeWidth="2.4" strokeLinecap="round" /><path d="M6 5h12l-3 4 3 4H6z" fill={color} stroke={INK} strokeWidth="2" strokeLinejoin="round" /></svg>);
}
export function CheckIcon({ size = 16, color = "currentColor" }: { size?: number; color?: string }) {
  return (<svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden><path d="M3 8.500l3.200 3L13 4.500" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>);
}
export function CrossIcon({ size = 16, color = "currentColor" }: { size?: number; color?: string }) {
  return (<svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden><path d="M4 4l8 8M12 4l-8 8" stroke={color} strokeWidth="2.6" strokeLinecap="round" /></svg>);
}
export function WarnIcon({ size = 16, color = "currentColor" }: { size?: number; color?: string }) {
  return (<svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden><path d="M8 2l6.500 11.500h-13z" fill={color} stroke={color} strokeWidth="1.600" strokeLinejoin="round" /><path d="M8 6.500v3.200M8 11.600v.1" stroke="#fff" strokeWidth="1.800" strokeLinecap="round" /></svg>);
}

const FACE: Record<MemberId, { bg: string; hair: string }> = { trang: { bg: "#f4a3c9", hair: "#6b3a5b" }, lan: { bg: "#ffb36b", hair: "#7a3b12" }, huy: { bg: "#7fb2ff", hair: "#1d3a78" } };
/** A friendly round face for a council member. */
export function FaceAvatar({ member, size = 54, dim }: { member: MemberId; size?: number; dim?: boolean }) {
  const f = FACE[member];
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden style={{ opacity: dim ? 0.55 : 1 }}>
      <circle cx="24" cy="24" r="21" fill={f.bg} stroke={INK} strokeWidth="2.6" />
      <path d={member === "lan" ? "M4 22c2-12 12-17 20-17s18 5 20 17c-4-6-10-9-20-9S8 16 4 22z" : member === "trang" ? "M4 26C3 12 12 5 24 5s21 7 20 21c-3-8-8-11-20-11S7 18 4 26z" : "M6 20c1-10 9-15 18-15s17 5 18 15c-5-4-9-6-18-6S11 16 6 20z"} fill={f.hair} stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
      <circle cx="17.500" cy="26" r="2" fill={INK} /><circle cx="30.500" cy="26" r="2" fill={INK} />
      <path d="M18.500 32c3.200 3.200 7 3.200 10.200 0" stroke={INK} strokeWidth="2.400" strokeLinecap="round" />
      <circle cx="12.500" cy="31" r="2.600" fill="#ff7b8a" opacity=".55" /><circle cx="35.500" cy="31" r="2.600" fill="#ff7b8a" opacity=".55" />
    </svg>
  );
}

/** The assistant mascot (little cloud-robot) for speech bubbles. */
export function Mascot({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none" aria-hidden>
      <path d="M12 40c-6 0-9-4-9-8 0-5 4-8 9-8 1-7 7-11 14-11 8 0 13 5 14 11 6 0 10 3 10 8s-4 8-9 8z" fill="#fff" stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
      <circle cx="22" cy="31" r="2.6" fill={INK} /><circle cx="35" cy="31" r="2.6" fill={INK} />
      <path d="M24 36.500c2.600 2.400 6.400 2.400 9 0" stroke={INK} strokeWidth="2.400" strokeLinecap="round" />
      <circle cx="17" cy="35" r="2.600" fill="#ffb4c4" opacity=".7" /><circle cx="40" cy="35" r="2.600" fill="#ffb4c4" opacity=".7" />
      <path d="M28 13V8" stroke={INK} strokeWidth="2.600" strokeLinecap="round" /><circle cx="28" cy="7" r="2.600" fill="#22d3c5" stroke={INK} strokeWidth="2" />
    </svg>
  );
}

/** Icon for a key kind, as used in the district rows. */
export function KindIcon({ kind, size = 34 }: { kind: "person" | "robot" | "server" | "gate" | "other"; size?: number }) {
  if (kind === "person") return <PersonIcon size={size} />;
  if (kind === "robot") return <RobotIcon size={size} />;
  if (kind === "server") return <ServerIcon size={size} />;
  if (kind === "gate") return <GateIcon size={size} />;
  return <ShieldIcon size={size} color="#b9a0f3" />;
}

export function ArrowRightGlyph({ size = 22 }: { size?: number }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-label="thành" role="img" style={{ flexShrink: 0 }}><path d="M4 12h15M13 6l6 6-6 6" stroke="#5f5580" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>);
}
