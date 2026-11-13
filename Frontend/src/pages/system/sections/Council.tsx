// Hội đồng: proposals with symbolic calls, frozen risk report, 2/3 approvals and the per-member conflict-of-interest check.
import { useEvents } from "../../../hooks/useEvents";
import { useOrg } from "../../../hooks/useOrg";
import { useProposals } from "../../../hooks/useProposals";
import { shortHash } from "../../../lib/format";
import { FaceAvatar } from "../../../stage/ui";
import type { ChainEvent, CouncilMember, Money, Proposal, SimTotals } from "../../../types";
import { approvalSummary, callSymbol, conflictCheck, emergencyActions } from "../council.logic";
import { ACCENT, Chip, Empty, Hash, Section, fmtClock } from "../ui";

const card = { background: "#fff", borderRadius: 24, padding: "18px 20px 18px", boxShadow: "0 10px 28px -20px rgba(45,34,80,.55), 0 2px 0 var(--line)", minWidth: 0 } as const;
const label = { fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)" } as const;

/** before -> after of one number: the "after" is the headline. */
function Shift({ k, a, b }: { k: string; a: Money | number; b: Money | number }) {
  const f = (x: Money | number) => (typeof x === "number" ? `${String(x).replace(".", ",")}%` : x.display);
  const up = typeof a === "number" ? (b as number) > a : BigInt((b as Money).raw) > BigInt((a as Money).raw);
  const same = f(a) === f(b);
  return (
    <div style={{ minWidth: 0 }}>
      <div style={label}>{k}</div>
      <div className="font-toy tnum" style={{ fontWeight: 800, fontSize: 26, lineHeight: 1.1, color: same ? "var(--ink)" : up ? "var(--amber-ink)" : "var(--ok-ink)", whiteSpace: "nowrap" }}>{f(b)}</div>
      <div className="tnum" style={{ fontSize: 12, color: "var(--ink-2)" }}>{same ? "không đổi" : <>trước {f(a)}</>}</div>
    </div>
  );
}

function Risk({ before, after }: { before: SimTotals; after: SimTotals }) {
  return (
    <div className="grid gap-x-5 gap-y-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(105px, 1fr))" }}>
      <Shift k="Bạn nghĩ" a={before.youThink} b={after.youThink} />
      <Shift k="Chain chặn" a={before.enforced} b={after.enforced} />
      <Shift k="Ước tính" a={before.estimated} b={after.estimated} />
      <Shift k="% quỹ chính" a={before.percentOfMainTreasury} b={after.percentOfMainTreasury} />
    </div>
  );
}

function Voters({ p, members }: { p: Proposal; members: CouncilMember[] }) {
  const approved = new Set(p.approvals);
  const sum = approvalSummary(p, members);
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="font-toy tnum" style={{ fontWeight: 800, fontSize: 26, color: sum.reached ? "var(--ok-ink)" : sum.stuck ? "var(--red-ink)" : ACCENT.council }}>{sum.approved}/{sum.need}</span>
        <span style={label}>phiếu duyệt{sum.stuck ? " · không đủ người hợp lệ" : ""}</span>
      </div>
      <div className="mt-2 grid gap-1.5">
        {members.map((m) => {
          const cc = conflictCheck(m, p), did = approved.has(m.id);
          return (
            <div key={m.id} className="flex items-center gap-3">
              <FaceAvatar member={m.id} size={34} dim={!did && !cc.conflict} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, lineHeight: 1.2 }}>{m.label} <span style={{ fontWeight: 700, color: did ? "var(--ok-ink)" : "var(--ink-2)", fontSize: 12.5 }}>{did ? "· đã duyệt" : cc.conflict ? "· không được duyệt" : "· chưa duyệt"}</span></div>
                <div style={{ fontSize: 12, color: cc.conflict ? "var(--red-ink)" : "var(--ink-2)" }}>
                  <b>{cc.conflict ? "✕" : "✓"}</b> {cc.conflict ? "xung đột lợi ích" : "không xung đột"}, {cc.reason}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProposalCard({ p, members, events }: { p: Proposal; members: CouncilMember[]; events: ChainEvent[] }) {
  const executedEv = events.find((e) => e.name === "Executed" && e.payload.id === p.id);
  const proposer = members.find((m) => m.id === p.proposer)?.label ?? p.proposer;
  return (
    <article style={{ ...card, borderTop: `6px solid ${p.status === "executed" ? "#22c55e" : ACCENT.council}` }}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-toy" style={{ fontWeight: 800, fontSize: 22 }}>Đề xuất #{p.id}</span>
        <Chip t={p.status === "executed" ? "ok" : p.status === "cancelled" ? "grey" : "violet"}>{p.status === "open" ? "chờ duyệt" : p.status === "executed" ? "đã thực thi" : "đã huỷ"}</Chip>
        <span style={{ ...label, marginLeft: "auto" }}>{proposer} đề xuất{p.subjectPrincipal ? <> · khu <b className="mono">{p.subjectPrincipal}</b></> : null}</span>
      </div>
      <p style={{ margin: "6px 0 10px", fontWeight: 700, fontSize: 15, lineHeight: 1.35 }}>{p.title}</p>

      <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 2, color: "var(--ink)", listStyle: "disc" }}>
        {p.descriptionVi.map((d, i) => <li key={i}>{d}</li>)}
      </ul>
      <div className="mt-2.5" style={{ background: "#2d2250", borderRadius: 14, padding: "8px 12px", display: "grid", gap: 2 }}>
        {p.calls.map((c, i) => <code key={i} className="mono" style={{ color: "#8fe7c9", wordBreak: "break-all", fontSize: 11.5 }}>{callSymbol(c)}</code>)}
      </div>

      <div className="mt-4"><Risk before={p.riskReport.before} after={p.riskReport.after} /></div>
      <div className="mt-4"><Voters p={p} members={members} /></div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
        {p.status === "executed" ? (<>
          <span style={{ color: "var(--ok-ink)", fontWeight: 700 }}>Đã thực thi</span>
          {executedEv ? <Hash value={executedEv.txHash} simulated={executedEv.simulated} /> : null}
        </>) : <span>Đủ {p.threshold} phiếu hợp lệ thì tự thực thi.</span>}
        {p.warnings.map((w, i) => <span key={i} style={{ color: "var(--amber-ink)", fontWeight: 600 }} title={w.text}>⚠ {w.text}</span>)}
      </div>
      <details className="mt-2" style={{ fontSize: 12 }}>
        <summary style={{ cursor: "pointer", color: "var(--ink-2)", fontWeight: 600 }}>Báo cáo rủi ro đã đóng băng</summary>
        <div className="mt-1.5" style={{ color: "var(--ink-2)" }}>riskReportHash <code className="mono" title={p.riskReportHash}>{shortHash(p.riskReportHash, 12, 8)}</code>: keccak256 của báo cáo, ghi lên chain lúc <code className="mono">propose</code>, nên không thể sửa số sau lưng người duyệt.</div>
      </details>
    </article>
  );
}

function EmergencyLog({ events, members }: { events: ChainEvent[]; members: CouncilMember[] }) {
  const list = emergencyActions(events, members);
  return (
    <div className="mt-5">
      <div style={label}>Hành động khẩn của Hội đồng</div>
      {list.length === 0 ? <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 2 }}>Chưa có. Khoá khu hay dừng kho chỉ cần một thành viên.</div> : (
        <ul style={{ margin: "6px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 4 }}>
          {list.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-3" style={{ background: "var(--red-soft)", borderRadius: 14, padding: "5px 12px 5px 6px" }}>
              {(["trang", "lan", "huy"] as const).includes(e.member as "trang") ? <FaceAvatar member={e.member as "trang" | "lan" | "huy"} size={26} /> : null}
              <span><b>{members.find((m) => m.id === e.member)?.label ?? e.member}</b> · {e.label}</span>
              <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--ink-2)" }}>{fmtClock(e.at)}</span>
              <Hash value={e.txHash} simulated={e.simulated} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const Principle = ({ big, k, d, c }: { big: string; k: string; d: string; c: string }) => (
  <div className="flex items-center gap-3" >
    <span className="font-toy tnum" style={{ fontWeight: 800, fontSize: 40, color: c, lineHeight: 1, minWidth: 66 }}>{big}</span>
    <span><b className="font-toy" style={{ fontSize: 17 }}>{k}</b><span style={{ display: "block", fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.3 }}>{d}</span></span>
  </div>
);

export function Council() {
  const { data: proposals } = useProposals();
  const { data: org } = useOrg();
  const { data: events } = useEvents();
  const members = org?.council ?? [];
  const open = (proposals ?? []).filter((p) => p.status === "open"), done = (proposals ?? []).filter((p) => p.status !== "open");
  return (
    <Section id="hoi-dong" accent={ACCENT.council} title="Hội đồng và đề xuất" sub="Siết thì một người là đủ, nới thì cần 2/3; trợ lý AI không có phiếu nào.">
      <div className="mb-5 flex flex-wrap gap-x-14 gap-y-3" aria-label="Nguyên tắc cốt lõi">
        <Principle big="1" k="Siết" d="khoá khu, dừng kho, hạ hạn mức" c="#e0364a" />
        <Principle big="2/3" k="Nới" d="mở khoá, tăng hạn mức, thêm thẻ" c={ACCENT.council} />
        <Principle big="0" k="AI" d="chỉ đọc, không ký, không chi tiền" c="#5e8fa3" />
      </div>
      {!proposals ? <Empty>Đang tải…</Empty> : proposals.length === 0 ? (
        <Empty>Chưa có đề xuất nào. Áp dụng chính sách v2 ở đầu trang sẽ tạo đề xuất đầu tiên.</Empty>
      ) : (
        <>
          {open.length ? (
            <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 480px), 1fr))" }}>
              {open.map((p) => <ProposalCard key={p.id} p={p} members={members} events={events ?? []} />)}
            </div>
          ) : <Empty>Không có đề xuất nào đang chờ duyệt.</Empty>}
          {done.length ? (
            <div className="mt-5 grid gap-2">
              <div style={label}>Đã xử lý</div>
              {done.map((p) => (
                <details key={p.id} style={{ background: "#fff", borderRadius: 18, padding: "10px 16px", boxShadow: "0 2px 0 var(--line)" }}>
                  <summary className="flex flex-wrap items-center gap-x-3" style={{ cursor: "pointer" }}>
                    <b className="font-toy" style={{ fontSize: 16 }}>#{p.id}</b>
                    <span style={{ fontWeight: 600 }}>{p.title}</span>
                    <span style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 700, color: p.status === "executed" ? "var(--ok-ink)" : "var(--ink-2)" }}>
                      {p.status === "executed" ? `✓ đã thực thi · ${p.approvals.length}/${p.threshold} phiếu` : "đã huỷ"}
                    </span>
                  </summary>
                  <div className="mt-3"><ProposalCard p={p} members={members} events={events ?? []} /></div>
                </details>
              ))}
            </div>
          ) : null}
        </>
      )}
      <EmergencyLog events={events ?? []} members={members} />
    </Section>
  );
}
export default Council;
