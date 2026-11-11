// Section 2: architecture diagram (spec §5.1) with packets that travel along the edges when stream messages arrive.
import { useEffect, useRef, type ReactNode } from "react";
import { animate } from "framer-motion";
import { Bot, Cpu, Globe, Landmark, ListChecks, MessagesSquare, Network, Scale, Shuffle, Swords, Vault, Coins } from "lucide-react";
import { useHealth } from "../../../hooks/useHealth";
import { useReduced } from "../../../stage/ui";
import { useAssistantLogs, useChanged } from "../data";
import { COLOR, useFeed, type EdgeId, type Packet } from "../feed";
import { ACCENT } from "../ui";

interface NodeDef { id: string; x: number; y: number; w: number; h: number; title: string; sub: string; color: string; edge?: EdgeId; icon: ReactNode; mono?: boolean }
const I = (C: typeof Globe) => <C size={17} strokeWidth={2.4} />;
const NODES: NodeDef[] = [
  { id: "web", x: 90, y: 235, w: 150, h: 88, title: "Web", sub: "React · SSE client", color: ACCENT.plaza, icon: I(Globe) },
  { id: "api", x: 350, y: 235, w: 160, h: 98, title: "API + indexer", sub: "REST + SSE · đồ thị · giả lập", color: ACCENT.edu, icon: I(Network) },
  { id: "chain", x: 610, y: 235, w: 170, h: 112, title: "Chain layer", sub: "ChainPort · 1 ranh giới", color: ACCENT.vault, edge: "api-chain", icon: I(Cpu) },
  { id: "attacker", x: 610, y: 62, w: 170, h: 52, title: "attacker CLI", sub: "cầm 5 khoá anh Minh", color: "#d62839", edge: "attacker-chain", icon: I(Swords) },
  { id: "agent", x: 610, y: 410, w: 170, h: 54, title: "agent-rebalance", sub: "rule engine · LLM chỉ viết lý do", color: ACCENT.resp, edge: "agent-chain", icon: I(Bot) },
  { id: "assistant", x: 350, y: 410, w: 160, h: 54, title: "Trợ lý GuardianAI", sub: "tool chỉ đọc · 0 quyền", color: ACCENT.edu, edge: "assistant-api", icon: I(MessagesSquare) },
  { id: "allow", x: 885, y: 40, w: 170, h: 50, title: "TxAllowList", sub: "precompile · chặn ở node", color: "#f0a000", edge: "chain-allow", icon: I(ListChecks) },
  { id: "registry", x: 885, y: 112, w: 170, h: 50, title: "PrincipalRegistry", sub: "khoá ↔ khu", color: ACCENT.safety, edge: "chain-registry", icon: I(Landmark) },
  { id: "vault", x: 885, y: 184, w: 170, h: 50, title: "PolicyVault", sub: "pay · swap · 8 kiểm tra", color: ACCENT.spend, edge: "chain-vault", icon: I(Vault) },
  { id: "council", x: 885, y: 256, w: 170, h: 50, title: "GuardianCouncil", sub: "siết 1 · nới 2/3", color: ACCENT.council, edge: "chain-council", icon: I(Scale) },
  { id: "dex", x: 885, y: 328, w: 170, h: 50, title: "MockDEX · EvilDEX", sub: "swapExactIn", color: ACCENT.growth, edge: "chain-dex", icon: I(Shuffle) },
  { id: "tokens", x: 885, y: 400, w: 170, h: 50, title: "tUSDC · tTKB · tSCAM", sub: "token thử nghiệm", color: "#b8860b", edge: "chain-tokens", icon: I(Coins) },
];
const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));
const curve = (a: NodeDef, b: NodeDef) => `M${a.x + a.w / 2} ${a.y} C ${a.x + a.w / 2 + 55} ${a.y}, ${b.x - b.w / 2 - 55} ${b.y}, ${b.x - b.w / 2} ${b.y}`;
const EDGES: Record<EdgeId, string> = {
  "web-api": "M165 235 L270 235",
  "api-chain": "M430 235 L525 235",
  "attacker-chain": "M610 88 L610 179",
  "agent-chain": "M610 383 L610 291",
  "assistant-api": "M350 383 L350 284",
  "chain-allow": curve(byId.chain, byId.allow),
  "chain-registry": curve(byId.chain, byId.registry),
  "chain-vault": curve(byId.chain, byId.vault),
  "chain-council": curve(byId.chain, byId.council),
  "chain-dex": curve(byId.chain, byId.dex),
  "chain-tokens": curve(byId.chain, byId.tokens),
};
const ASSISTANT_ROUTE = { hops: [{ e: "web-api" as const }, { e: "assistant-api" as const }, { e: "assistant-api" as const, rev: true }, { e: "web-api" as const, rev: true }], color: COLOR.ask };

function PacketDot({ p, paths }: { p: Packet; paths: React.RefObject<Record<string, SVGPathElement | null>> }) {
  const ref = useRef<SVGCircleElement>(null);
  const done = useFeed((s) => s.done);
  useEffect(() => {
    let dead = false;
    const stops: { stop: () => void }[] = [];
    void (async () => {
      for (const h of p.hops) {
        const path = paths.current?.[h.e];
        if (!path) continue;
        const len = path.getTotalLength();
        await new Promise<void>((res) => {
          stops.push(animate(0, 1, {
            duration: 0.55, ease: "easeInOut", onComplete: res,
            onUpdate: (t) => { const pt = path.getPointAtLength((h.rev ? 1 - t : t) * len); const c = ref.current; if (c) { c.setAttribute("cx", String(pt.x)); c.setAttribute("cy", String(pt.y)); c.setAttribute("opacity", "1"); } },
          }));
        });
        if (dead) return;
      }
      done(p.id);
    })();
    return () => { dead = true; stops.forEach((s) => s.stop()); };
  }, [p, paths, done]);
  return <circle ref={ref} r={7.5} fill={p.color} stroke="#fff" strokeWidth={2.5} opacity={0} style={{ filter: "drop-shadow(0 2px 2px rgba(45,34,80,.35))" }} />;
}

export function Architecture() {
  const reduced = useReduced();
  const { data: health } = useHealth();
  const { data: logs } = useAssistantLogs();
  const { edges, sse, rest, packets, ticks } = useFeed();
  const paths = useRef<Record<string, SVGPathElement | null>>({});
  const sim = health?.chainMode !== "live";
  const askN = logs?.length ?? 0;
  const prevAsk = useRef<number | null>(null);
  useEffect(() => {
    if (prevAsk.current !== null && askN > prevAsk.current) useFeed.getState().inject(ASSISTANT_ROUTE);
    prevAsk.current = askN;
  }, [askN]);
  const counts: Record<string, number> = { web: sse, api: sse + rest, chain: edges["api-chain"] ?? 0, attacker: edges["attacker-chain"] ?? 0, agent: edges["agent-chain"] ?? 0, assistant: askN };
  for (const n of NODES) if (n.edge && n.id !== "chain" && n.id !== "assistant" && n.id !== "attacker" && n.id !== "agent") counts[n.id] = edges[n.edge] ?? 0;
  const changed = useChanged(Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, String(v)])), 1400);

  return (
    <section id="kien-truc" aria-label="Sơ đồ kiến trúc" className="sx-card" style={{ ["--ac" as string]: ACCENT.edu, padding: 14 }}>
      <div className="sx-arch overflow-hidden rounded-[20px]" style={{ background: "#fbf2de", border: "2px solid var(--line)" }}>
        <svg viewBox="0 0 1000 482" width="100%" role="img" aria-label="Sơ đồ kiến trúc: Web, API, lớp chain, các contract" style={{ display: "block" }}>
          <defs>
            <pattern id="sx-dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.4" fill="#e6d4ac" /></pattern>
          </defs>
          <rect width="1000" height="482" fill="url(#sx-dots)" />
          {/* contracts frame */}
          <rect x="790" y="8" width="200" height="448" rx="26" fill="rgba(255,255,255,.55)" stroke="#d9c49b" strokeWidth="3" strokeDasharray="9 7" />
          <text x="890" y="474" textAnchor="middle" className="s" style={{ fontWeight: 700 }}>{sim ? "chain/sim · luật §6 trong bộ nhớ" : "Guardian L1 · Subnet-EVM · Fuji"}</text>
          {/* edges */}
          {(Object.keys(EDGES) as EdgeId[]).map((e) => (
            <g key={e}>
              <path ref={(el) => { paths.current[e] = el; }} d={EDGES[e]} fill="none" stroke="#dccaa4" strokeWidth={7} strokeLinecap="round" />
              <path d={EDGES[e]} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeDasharray="1 9" />
            </g>
          ))}
          {/* edge labels */}
          <EdgeTag x={217} y={217} text={`REST ${rest}`} color={COLOR.rest} />
          <EdgeTag x={217} y={253} text={`SSE ${sse}`} color={ACCENT.plaza} />
          <EdgeTag x={478} y={217} text={`index ${edges["api-chain"] ?? 0}`} color={ACCENT.vault} />
          <EdgeTag x={610} y={134} text={`ký ${edges["attacker-chain"] ?? 0}`} color="#d62839" />
          <EdgeTag x={610} y={337} text={`ký ${edges["agent-chain"] ?? 0}`} color={ACCENT.resp} />
          <EdgeTag x={350} y={334} text={`hỏi ${askN}`} color={ACCENT.edu} />
          <text x={217} y={296} textAnchor="middle" className="s">/api</text>
          <text x={478} y={198} textAnchor="middle" className="s">viem</text>
          {/* nodes */}
          {NODES.map((n) => {
            const x = n.x - n.w / 2, y = n.y - n.h / 2;
            return (
              <g key={n.id}>
                <rect x={x} y={y + 4} width={n.w} height={n.h} rx={18} fill={n.color} opacity={0.38} />
                <rect x={x} y={y} width={n.w} height={n.h} rx={18} fill="#fffdf8" stroke={n.color} strokeWidth={3} />
                {changed.has(n.id) && !reduced ? <rect key={counts[n.id]} className="sx-ping" x={x} y={y} width={n.w} height={n.h} rx={18} fill="none" stroke={n.color} /> : null}
                <g transform={`translate(${x + 9} ${y + 8})`} style={{ color: n.color }}>{n.icon}</g>
                <text x={x + 32} y={y + 21} className="t" style={{ fontSize: n.h < 60 ? 13.5 : 15 }}>{n.title}</text>
                <text x={x + 10} y={y + n.h - 10} className="s">{n.sub}</text>
                <g transform={`translate(${x + n.w - 6} ${y - 7})`}>
                  <rect x={-Math.max(22, 10 + String(counts[n.id] ?? 0).length * 8)} y={0} width={Math.max(22, 10 + String(counts[n.id] ?? 0).length * 8)} height={19} rx={9.5} fill={n.color} />
                  <text className="ct" x={-Math.max(22, 10 + String(counts[n.id] ?? 0).length * 8) / 2} y={14} textAnchor="middle">{counts[n.id] ?? 0}</text>
                </g>
              </g>
            );
          })}
          {/* packets above everything */}
          {reduced ? null : packets.map((p) => <PacketDot key={p.id} p={p} paths={paths} />)}
        </svg>
      </div>
      {ticks.length > 0 ? (
        <ul style={{ listStyle: "none", margin: "10px 4px 0", padding: 0, display: "flex", flexWrap: "wrap", gap: 6 }} aria-label="Tin gần nhất">
          {ticks.slice(0, 5).map((t) => (
            <li key={t.id} className="mono" style={{ fontSize: 11.5, display: "inline-flex", alignItems: "center", gap: 6, color: "var(--ink-2)" }}>
              <span className="sx-dot" style={{ background: t.color }} />{t.type} {t.text}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function EdgeTag({ x, y, text, color }: { x: number; y: number; text: string; color: string }) {
  const w = text.length * 6.6 + 14;
  return (
    <g>
      <rect x={x - w / 2} y={y - 10} width={w} height={20} rx={10} fill="#fff" stroke={color} strokeWidth={2} />
      <text x={x} y={y + 4} textAnchor="middle" className="m">{text}</text>
    </g>
  );
}
