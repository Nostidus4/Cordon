// Section 3 (the centerpiece): every attempt as a row of the 8 checks of PolicyVault.pay/swap (spec §6.3).
import { attemptLabel, stepOf, timeOf } from "../../../lib/dto";
import { Fragment, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { REASONS } from "../../../shared/reasonCodes";
import { useAttempts } from "../../../hooks/useAttempts";
import { useGraph } from "../../../hooks/useGraph";
import { useReduced } from "../../../stage/ui";
import type { Attempt } from "../../../types";
import { callSignature, errorName, traceAttempt, type CheckStage } from "../trace";
import { ACCENT, CheckGlyph, Chip, Empty, Hash, Section } from "../ui";
import { AttemptDrawer } from "./Drawer";

const targetLabel = (s: CheckStage, a: Attempt) => (s.id === "target" ? (a.action === "swap" ? "Chợ đổi duyệt" : "Người nhận duyệt") : s.label);

function Flow({ a }: { a: Attempt }) {
  const t = traceAttempt(a);
  if (t.route === "council") {
    const steps = ["Hội đồng ký (1 người đủ)", "PolicyVault.lockPrincipal", "TxAllowList.setNone từng thẻ"];
    return (
      <div className="sx-flow" aria-label="Luồng siết của Hội đồng">
        {steps.map((s, i) => (<Fragment key={s}>{i > 0 ? <span className="sx-link pass" /> : null}<span className="sx-step" data-s="pass"><span className="ic">✓</span>{s}</span></Fragment>))}
      </div>
    );
  }
  const gate = t.gate === "pass" ? "gate" : "gatefail";
  const direct = t.route === "direct" && t.gate === "pass";
  return (
    <div className="sx-flow" role="list" aria-label="Các kiểm tra theo thứ tự">
      <span className="sx-step" data-s={gate} role="listitem" style={{ flex: "1.25 1 0" }} title="Node từ chối trước khi vào block nếu khoá không có trong Tx AllowList (precompile 0x…0002)">
        <span className="ic"><CheckGlyph s={gate} /></span>Node · Tx AllowList
      </span>
      {direct ? (
        <><span className="sx-link gate" /><span className="sx-step" data-s="skip" style={{ flex: "6 1 0", justifyContent: "center" }}>token.approve không đi qua PolicyVault: 8 kiểm tra không chạy</span></>
      ) : t.stages.map((s, i) => {
        const prev = i === 0 ? (t.gate === "pass" ? "pass" : "skip") : t.stages[i - 1].status;
        return (
          <Fragment key={s.id}>
            <span className="sx-link" data-s={s.status === "skip" ? "skip" : prev === "pass" ? (s.status === "fail" ? "fail" : "pass") : "skip"} />
            <span className="sx-step" data-s={s.status} role="listitem" title={`${s.n}. ${s.code}`}>
              <span className="ic"><CheckGlyph s={s.status} /></span>{targetLabel(s, a)}
            </span>
          </Fragment>
        );
      })}
    </div>
  );
}

function Row({ a, label, selected, onOpen }: { a: Attempt; label: string; selected: boolean; onOpen: () => void }) {
  const reduced = useReduced();
  const reason = a.reasonCode ? REASONS[a.reasonCode] : null;
  const gated = a.outcome === "blocked_at_protocol";
  return (
    <motion.li layout={reduced ? false : "position"} initial={reduced ? false : { opacity: 0, y: -16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 26 }} style={{ listStyle: "none" }}>
      <button type="button" className="sx-row" data-o={a.outcome} data-sel={selected} onClick={onOpen} aria-label={`Mở chi tiết: ${attemptLabel(a)}`}>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <Chip t={a.outcome === "ok" ? "ok" : a.outcome === "reverted" ? "bad" : "warn"} mono>{a.outcome === "ok" ? "✓ OK" : a.outcome === "reverted" ? "✕ REVERTED" : "✕ BLOCKED_AT_PROTOCOL"}</Chip>
          <span style={{ color: "var(--ink-2)", fontSize: 12 }}>bước {stepOf(a)} · {timeOf(a)}</span>
          <code className="mono" style={{ fontWeight: 600, color: "var(--ink)", minWidth: 0, overflowWrap: "anywhere" }}>{callSignature(a)}</code>
          <span style={{ flex: 1 }} />
          {a.amount ? <span className="font-toy tnum" style={{ fontWeight: 800, fontSize: 19, color: a.outcome === "ok" ? "var(--ink)" : "var(--ink-2)", textDecoration: a.outcome === "ok" ? "none" : "line-through", textDecorationThickness: 2 }}>{a.amount.display}<span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-2)", marginLeft: 4, textDecoration: "none", display: "inline-block" }}>{a.token ?? "tUSDC"}</span></span> : null}
        </div>
        <Flow a={a} />
        {reason ? (
          <div className="sx-callout" data-t={gated ? "amber" : undefined}>
            <span className="mono">{a.reasonCode}</span>
            <span>{reason.vi}</span>
            {errorName(a.reasonCode) ? <span className="mono" style={{ marginLeft: "auto" }}>{errorName(a.reasonCode)}</span> : <span className="mono" style={{ marginLeft: "auto" }}>RPC rejected · not in Tx AllowList</span>}
          </div>
        ) : null}
        <div className="sx-meta">
          <span>ký bởi <b>{a.signerLabel}</b> <code className="mono">{a.signer}</code></span>
          {a.principalId ? <><span className="sep">·</span><span>khu <b>{label}</b></span></> : null}
          {a.keySpentAfter ? <><span className="sep">·</span><span>đã dùng sau lệnh: thẻ <b className="tnum">{a.keySpentAfter.display}</b></span></> : null}
          {a.principalSpentAfter ? <span>· khu <b className="tnum">{a.principalSpentAfter.display}</b></span> : null}
          <span className="sep">·</span>
          {a.txHash ? <Hash value={a.txHash} /> : gated ? <Chip t="warn">không có tx hash</Chip> : <Chip>không có tx</Chip>}
        </div>
      </button>
    </motion.li>
  );
}

export function Pipeline() {
  const { data: attempts, isLoading } = useAttempts();
  const { data: graph } = useGraph();
  const [filter, setFilter] = useState<"all" | "ok" | "blocked">("all");
  const [limit, setLimit] = useState(10);
  const [selId, setSelId] = useState<number | null>(null);
  const all = useMemo(() => [...(attempts ?? [])].reverse(), [attempts]);
  const shown = all.filter((a) => (filter === "all" ? true : filter === "ok" ? a.outcome === "ok" : a.outcome !== "ok"));
  const labelOf = (pid: string | null) => (pid ? graph?.districts.find((d) => d.principalId === pid)?.label ?? pid : "");
  const sel = all.find((a) => a.id === selId) ?? null;
  // dev-only: /he-thong?autoplay=full&open=2 opens the 2nd newest attempt once there are enough of them
  useEffect(() => {
    if (!import.meta.env.DEV || selId) return;
    const n = Number(new URLSearchParams(window.location.search).get("open") ?? 0);
    if (n > 0 && all.length >= 8) setSelId(all[n - 1]?.id ?? null);
  }, [all, selId]);
  const n = (f: (a: Attempt) => boolean) => all.filter(f).length;

  return (
    <Section id="kiem-tra" accent={ACCENT.safety} title="Mỗi lần thử đi qua 8 cổng"
      sub="Cổng đỏ là nơi lệnh bị chặn; các cổng sau đó chưa chạy. Bấm một dòng để xem JSON."
      right={
        <div className="flex gap-1.5" role="group" aria-label="Lọc">
          {([["all", "Tất cả", all.length], ["ok", "Qua", n((a) => a.outcome === "ok")], ["blocked", "Bị chặn", n((a) => a.outcome !== "ok")]] as const).map(([k, l, c]) => (
            <button key={k} type="button" className="sx-tog" style={{ ["--ac" as string]: ACCENT.safety }} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l} <span className="c">{c}</span></button>
          ))}
        </div>
      }>
      {isLoading ? <Empty>Đang tải…</Empty> : shown.length === 0 ? (
        <Empty>Chưa có lần thử nào{filter !== "all" ? " khớp bộ lọc" : ""}. Bấm “Chạy Trợ lý Cân đối” hoặc “Kẻ gian: bước 1–5” ở trên.</Empty>
      ) : (
        <ul className="sx-scroll" style={{ margin: 0, padding: "2px 4px 8px 2px", display: "grid", gap: 9, maxHeight: "calc(100vh - 250px)", overflowY: "auto" }}>
          <AnimatePresence initial={false}>
            {shown.slice(0, limit).map((a) => <Row key={a.id} a={a} label={labelOf(a.principalId)} selected={a.id === selId} onOpen={() => setSelId(a.id)} />)}
          </AnimatePresence>
          {shown.length > limit ? <li style={{ listStyle: "none", textAlign: "center" }}><button type="button" className="sx-tog" onClick={() => setLimit((l) => l + 10)}>Xem thêm {shown.length - limit} lần thử cũ hơn</button></li> : null}
        </ul>
      )}
      <AttemptDrawer attempt={sel} onClose={() => setSelId(null)} />
    </Section>
  );
}
