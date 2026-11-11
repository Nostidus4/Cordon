// Section 4: chain event log (spec §8.2 events): compact virtualized table, filters by contract / event name / search, pause, JSON expand.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { motion } from "framer-motion";
import { ChevronRight, Pause, Play, Search } from "lucide-react";
import { useEvents } from "../../../hooks/useEvents";
import { useReduced } from "../../../stage/ui";
import type { ChainEvent } from "../../../types";
import { CONTRACTS, contractMeta, contractOf, countBy, filterEvents, lastBlock, summarize, type ContractId } from "../eventLog";
import { Chip, Empty, Hash, JsonView, fmtClock } from "../ui";
import { Info } from "lucide-react";

const ROW = 42;
const VIEW = 560;
const COLS = "62px 70px 120px 30px 176px minmax(0,1fr) 26px";
const EMPTY_C: ReadonlySet<ContractId> = new Set();
const EMPTY_N: ReadonlySet<string> = new Set();

const toggle = <T,>(set: ReadonlySet<T>, v: T): Set<T> => { const n = new Set(set); if (n.has(v)) n.delete(v); else n.add(v); return n; };
const jsonHeight = (e: ChainEvent) => Math.min(240, JSON.stringify(e.payload, null, 2).split("\n").length * 18 + 34) + 22;

export function EventLog() {
  const { data: events } = useEvents();
  const live = useMemo(() => events ?? [], [events]);
  const reduced = useReduced();
  const [paused, setPaused] = useState(false);
  const [snap, setSnap] = useState<ChainEvent[]>([]);
  const [contracts, setContracts] = useState<ReadonlySet<ContractId>>(EMPTY_C);
  const [names, setNames] = useState<ReadonlySet<string>>(EMPTY_N);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<ReadonlySet<string>>(EMPTY_N);
  const [top, setTop] = useState(0);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(EMPTY_N);
  const known = useRef<Set<string> | null>(null);

  // Rows that arrived after the first load slide in (and get a teal wash) for ~1.6 s.
  useEffect(() => {
    const prev = known.current;
    known.current = new Set(live.map((e) => e.id));
    if (!prev) return;
    const added = live.filter((e) => !prev.has(e.id)).map((e) => e.id);
    if (!added.length) return;
    setFresh((f) => new Set([...f, ...added]));
    const t = setTimeout(() => setFresh((f) => { const n = new Set(f); for (const id of added) n.delete(id); return n; }), 1600);
    return () => clearTimeout(t);
  }, [live]);

  const base = paused ? snap : live;
  const byContract = useMemo(() => countBy(base, (e) => contractOf(e.name)), [base]);
  const byName = useMemo(() => countBy(contracts.size ? base.filter((e) => contracts.has(contractOf(e.name))) : base, (e) => e.name), [base, contracts]);
  const rows = useMemo(() => filterEvents(base, { contracts, names, q }), [base, contracts, names, q]);

  const heights = rows.map((e) => ROW + (open.has(e.id) ? jsonHeight(e) : 0));
  const offsets: number[] = []; let acc = 0;
  for (const h of heights) { offsets.push(acc); acc += h; }
  let first = 0; while (first < rows.length - 1 && offsets[first] + heights[first] < top) first++;
  let last = first; while (last < rows.length && offsets[last] < top + VIEW) last++;
  const pending = paused ? Math.max(0, live.length - snap.length) : 0;
  const block = lastBlock(base);
  const filtered = contracts.size > 0 || names.size > 0 || q.trim() !== "";

  return (
    <section id="su-kien" aria-labelledby="su-kien-t" className="sx-card" style={{ ["--ac" as string]: "#0a84d8", padding: "22px 26px 18px" }}>
      <header className="sx-head" style={{ marginBottom: 16 }}>
        <div style={{ minWidth: 0 }}>
          <h2 id="su-kien-t" className="sx-title">Sự kiện on-chain</h2>
          <p className="sx-sub">Mỗi dòng là một log do contract phát ra. Lệnh bị revert hoặc bị node chặn không sinh event.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="tnum" style={{ fontFamily: "var(--font-toy)", fontWeight: 800, fontSize: 28, lineHeight: 1 }}>{live.length}<span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-2)", marginLeft: 6 }}>sự kiện{block !== null ? <> · block <span className="mono tnum">#{block}</span></> : null}</span></span>
          <button type="button" className="sx-tog" style={{ ["--ac" as string]: "#ff8c42" }} aria-pressed={paused} onClick={() => { if (!paused) setSnap(live); setPaused(!paused); }}>
            {paused ? <Play size={13} aria-hidden /> : <Pause size={13} aria-hidden />}{paused ? `Tiếp tục${pending ? ` (+${pending} mới)` : ""}` : "Tạm dừng"}
          </button>
        </div>
      </header>
      <div className="mb-2.5 flex flex-wrap items-center gap-2" role="group" aria-label="Lọc theo contract">
        {CONTRACTS.filter((c) => byContract.some(([id]) => id === c.id)).map((c) => (
          <button key={c.id} type="button" className="sx-tog" style={{ ["--ac" as string]: c.color }} aria-pressed={contracts.has(c.id)} onClick={() => { setContracts(toggle(contracts, c.id)); setNames(EMPTY_N); }}>
            <span aria-hidden style={{ width: 9, height: 9, borderRadius: 99, background: c.color, display: "inline-block" }} />{c.label} <span className="c">{byContract.find(([id]) => id === c.id)?.[1]}</span>
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1.5" style={{ border: "2px solid var(--line)", background: "#fff", borderRadius: 999, padding: "2px 10px", boxShadow: "0 2px 0 var(--line)" }}>
          <Search size={13} aria-hidden style={{ color: "var(--ink-2)" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm tx hash hoặc khoá…" aria-label="Tìm theo tx hash hoặc khoá" className="mono"
            style={{ border: 0, outline: 0, background: "transparent", fontSize: 12, width: 190 }} />
        </label>
      </div>
      <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Lọc theo tên sự kiện">
        <button type="button" className="sx-tog" style={{ ["--ac" as string]: "#0a84d8" }} aria-pressed={names.size === 0} onClick={() => setNames(EMPTY_N)}>Mọi sự kiện</button>
        {byName.map(([n, c]) => (
          <button key={n} type="button" className="sx-tog mono" style={{ ["--ac" as string]: contractMeta(contractOf(n)).color }} aria-pressed={names.has(n)} onClick={() => setNames(toggle(names, n))}>{n} <span className="c">{c}</span></button>
        ))}
      </div>
      {live.length === 0 ? <Empty>Chưa có sự kiện nào. Chạy “Áp dụng chính sách v2” hoặc “Chạy Trợ lý Cân đối” để contract phát log đầu tiên.</Empty> : (
        <div style={{ border: "1.5px solid #efe2c6", borderRadius: 18, overflow: "hidden", background: "#fff" }}>
          <div className="sx-scroll" style={{ overflowX: "auto" }}>
            <div style={{ minWidth: 820 }}>
              <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 8, padding: "6px 10px", background: "#f6ecd9", fontWeight: 700, fontSize: 11.5, color: "var(--ink-2)" }} role="row">
                <span>Block</span><span>Giờ</span><span>Tx</span><span>Log</span><span>Sự kiện</span><span>Dữ liệu chính</span><span />
              </div>
              {rows.length === 0 ? <div style={{ padding: 18 }}><Empty>Không có sự kiện nào khớp bộ lọc.</Empty></div> : (
                <div className="sx-scroll" style={{ height: Math.min(VIEW, acc + 2), overflowY: "auto", position: "relative" }} onScroll={(e) => setTop(e.currentTarget.scrollTop)} role="table" aria-label="Sự kiện chain" aria-rowcount={rows.length}>
                  <div style={{ height: acc, position: "relative" }}>
                    {rows.slice(first, last + 1).map((e, k) => {
                      const i = first + k, isOpen = open.has(e.id), isNew = fresh.has(e.id) && !paused, c = contractMeta(contractOf(e.name));
                      const cell: CSSProperties = { lineHeight: `${ROW}px` };
                      return (
                        <motion.div key={e.id} className={`sx-vrow${isNew ? " sx-new" : ""}`} data-open={isOpen} role="row"
                          initial={isNew && !reduced ? { opacity: 0, x: -36 } : false} animate={{ opacity: 1, x: 0 }} transition={{ type: "spring", stiffness: 260, damping: 26 }}
                          style={{ top: offsets[i], height: heights[i], gridTemplateColumns: COLS, gap: 8, alignContent: "start", paddingTop: 0, borderLeft: `4px solid ${c.color}` }}>
                          <span className="mono tnum" style={cell}>{e.block}</span>
                          <span className="tnum" style={{ ...cell, color: "var(--ink-2)" }}>{fmtClock(e.ts)}</span>
                          <span style={cell}><Hash value={e.txHash} head={6} tail={4} /></span>
                          <span className="mono tnum" style={cell}>{e.logIndex}</span>
                          <span style={cell}>
                            <span className="sx-chip mono" title={c.label} style={{ background: c.soft, color: c.ink, borderColor: c.color }}>{e.name}</span>
                          </span>
                          <span className="mono" style={{ ...cell, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={JSON.stringify(e.payload)}>
                            {summarize(e).map(([k, v], j) => <span key={k}>{j ? <span style={{ color: "#cbb98f" }}>  ·  </span> : null}<span style={{ color: "var(--ink-2)" }}>{k}=</span>{v}</span>)}
                          </span>
                          <button type="button" aria-expanded={isOpen} aria-label={isOpen ? "Thu gọn JSON" : "Mở JSON"} onClick={() => setOpen(toggle(open, e.id))}
                            style={{ border: 0, background: "transparent", cursor: "pointer", height: ROW, color: "var(--ink-2)", display: "grid", placeItems: "center" }}>
                            <ChevronRight size={16} style={{ transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 120ms" }} />
                          </button>
                          {isOpen ? <div className="json"><JsonView value={{ id: e.id, chain: e.chain, contract: c.label, block: e.block, txHash: e.txHash, simulated: e.simulated, logIndex: e.logIndex, name: e.name, payload: e.payload, ts: e.ts }} maxHeight={240} /></div> : null}
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="sx-meta" style={{ padding: "6px 12px", borderTop: "1.5px solid #efe2c6", background: "#fffdf8" }} aria-live="polite">
            <span><b className="tnum">{rows.length}</b>{filtered ? <> / {base.length}</> : null} sự kiện</span>
            {block !== null ? <><span className="sep">·</span><span>block mới nhất <b className="mono tnum">#{block}</b></span></> : null}
            <span className="sep">·</span><span title="Chain mô phỏng (CHAIN_MODE=sim): tx hash gắn nhãn mô phỏng, chưa phải Guardian L1 thật" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>tx mô phỏng <Info size={12} aria-hidden /></span>
            {paused ? <><span className="sep">·</span><Chip t="warn">đang tạm dừng</Chip></> : null}
          </div>
        </div>
      )}
    </section>
  );
}
