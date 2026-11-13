// Right-hand drawer: everything about one attempt (check trace, raw JSON, related chain events).
import { attemptLabel, eventKey, isoOfSec, stepOf, timeOf } from "../../../lib/dto";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { REASONS } from "../../../shared/reasonCodes";
import { useEvents } from "../../../hooks/useEvents";
import type { Attempt } from "../../../types";
import { callSignature, errorName, traceAttempt } from "../trace";
import { Chip, CheckGlyph, Hash, JsonView, fmtClock } from "../ui";

export function AttemptDrawer({ attempt, onClose }: { attempt: Attempt | null; onClose: () => void }) {
  return createPortal(
    <AnimatePresence>
      {attempt ? (
        <>
          <motion.div key="scrim" className="sx-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside key="drawer" className="sx-drawer stage sys" role="dialog" aria-modal="true" aria-label="Chi tiết lần thử"
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", stiffness: 300, damping: 32 }}>
            <DrawerBody attempt={attempt} onClose={onClose} />
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

function DrawerBody({ attempt: a, onClose }: { attempt: Attempt; onClose: () => void }) {
  const { data: events } = useEvents();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  const t = traceAttempt(a);
  const related = a.txHash ? (events ?? []).filter((e) => e.txHash === a.txHash) : [];
  const tone = a.outcome === "ok" ? "ok" : a.outcome === "reverted" ? "bad" : "warn";
  return (
    <>
      <div className="flex items-start gap-3 p-5 pb-3">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Chip t={tone} mono>{a.outcome === "ok" ? "OK" : a.outcome === "reverted" ? "REVERTED" : "BLOCKED_AT_PROTOCOL"}</Chip>
            <Chip>bước {stepOf(a)} · {timeOf(a)}</Chip>
            <span className="sx-ref">{fmtClock(isoOfSec(a.ts))}</span>
          </div>
          <h2 className="font-toy" style={{ fontWeight: 800, fontSize: 22, lineHeight: 1.15, margin: 0 }}>{attemptLabel(a)}</h2>
          <p className="mono" style={{ margin: "6px 0 0", wordBreak: "break-all" }}>{callSignature(a)}</p>
        </div>
        <button ref={closeRef} type="button" className="toy-btn" data-c="cream" data-size="xs" onClick={onClose} aria-label="Đóng"><X size={16} aria-hidden /></button>
      </div>
      <div className="sx-scroll flex-1 space-y-4 overflow-y-auto px-5 pb-6">
        <div>
          <h3 className="sx-h3">Kiểm tra theo thứ tự §6.3</h3>
          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 5 }}>
            <li className="sx-step" data-s={t.gate === "pass" ? "gate" : "gatefail"} style={{ flex: "none" }}>
              <span className="ic"><CheckGlyph s={t.gate === "pass" ? "gate" : "gatefail"} /></span>
              <span>Node: Tx AllowList cho phép khoá</span><code className="mono" style={{ marginLeft: "auto", opacity: 0.8 }}>0x…0002</code>
            </li>
            {t.stages.map((s) => (
              <li key={s.id} className="sx-step" data-s={s.status} style={{ flex: "none" }}>
                <span className="ic"><CheckGlyph s={s.status} /></span>
                <span>{s.n}. {s.label}</span><code className="mono" style={{ marginLeft: "auto", opacity: 0.85, fontSize: 11 }}>{s.code}</code>
              </li>
            ))}
          </ol>
          <p className="sx-sub" style={{ marginTop: 8 }}>{t.summary}</p>
        </div>

        {a.reasonCode ? (
          <div className="sx-callout" data-t={a.outcome === "blocked_at_protocol" ? "amber" : undefined}>
            <span className="mono">{a.reasonCode}</span><span>{REASONS[a.reasonCode].vi}</span>
            <span className="mono" style={{ marginLeft: "auto" }}>{errorName(a.reasonCode) ?? "RPC -32000"}</span>
          </div>
        ) : null}
        {a.errorRaw ? <JsonView value={{ errorRaw: a.errorRaw }} /> : null}

        <div>
          <h3 className="sx-h3">Giao dịch</h3>
          {a.txHash ? <Hash value={a.txHash} simulated={a.simulated} head={14} tail={10} /> : <Chip t="warn">RPC rejected · not in Tx AllowList (không có tx hash)</Chip>}
        </div>

        <div>
          <h3 className="sx-h3">Sự kiện liên quan <Chip t={related.length ? "info" : undefined}>{related.length}</Chip></h3>
          {related.length === 0 ? <p className="sx-sub tight">{a.outcome === "ok" ? "Chưa thấy event cùng tx (indexer có thể chậm)." : "Lệnh bị chặn không sinh event (spec §6.3). Lý do lấy từ eth_call / RPC."}</p> : (
            <div className="grid gap-2">{related.map((e) => (
              <div key={eventKey(e)}>
                <div className="mb-1 flex flex-wrap items-center gap-2"><Chip t="info" mono>{e.name}</Chip><span className="sx-ref">block {e.block} · log {e.logIndex}</span></div>
                <JsonView value={e.payload} maxHeight={200} />
              </div>
            ))}</div>
          )}
        </div>

        <div>
          <h3 className="sx-h3">JSON đầy đủ của lần thử</h3>
          <JsonView value={a} maxHeight={420} />
        </div>
      </div>
    </>
  );
}
