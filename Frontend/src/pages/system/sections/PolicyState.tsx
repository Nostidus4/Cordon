// Section 5: policy state as the vault holds it (spec §6.3 storage): districts, keys, Tx AllowList role, allow-lists, balances.
import { Bot, Cog, User } from "lucide-react";
import { useGraph } from "../../../hooks/useGraph";
import { useHealth } from "../../../hooks/useHealth";
import { useOrg } from "../../../hooks/useOrg";
import { percentOf, shortHash } from "../../../lib/format";
import type { GraphNode } from "../../../types";
import { useChanged } from "../data";
import { decimalsOf, parseProtocol, policySnapshot } from "../policyState";
import { Info } from "lucide-react";
import { CapBar, Chip, Empty, big } from "../ui";
import { policyLabel } from "../../../lib/policy";

const KIND: Record<string, { label: string; t: "ok" | "info" | "violet"; Icon: typeof User }> = {
  HUMAN: { label: "Người", t: "info", Icon: User }, AGENT: { label: "Trợ lý AI", t: "violet", Icon: Bot }, SERVICE: { label: "Phần mềm", t: "ok", Icon: Cog },
};
const KindTag = ({ kind }: { kind?: string }) => {
  const k = KIND[kind ?? ""];
  return k ? <span className="inline-flex items-center gap-1.5 align-middle" title={k.label} style={{ color: "var(--ink-2)", fontWeight: 600, fontSize: 12.5 }}><k.Icon size={14} aria-hidden style={{ color: k.t === "violet" ? "var(--violet-d)" : k.t === "ok" ? "var(--ok-ink)" : "#0b5e9c" }} /></span> : <span style={{ color: "var(--ink-2)" }}>{kind}</span>;
};
// Not exposed by the graph/mock (it only lists allowed items), so the denied examples are fixed: the ones the scene-4 attacker tries.
const NOT_ALLOWED = [{ kind: "protocol", name: "EvilDEX.swapExactIn" }, { kind: "token", name: "tSCAM" }, { kind: "recipient", name: "stranger_wallet" }];

export function PolicyState() {
  const { data: graph } = useGraph();
  const { data: org } = useOrg();
  const { data: health } = useHealth();
  const vault = graph?.nodes.find((n) => n.id === "vault");
  const paused = vault?.data.paused === true;
  const keyNode = (id: string): GraphNode | undefined => graph?.nodes.find((n) => n.id === `k:${id}`);

  const snap = policySnapshot(graph, org ? { usdc: org.vault.balance.raw, tkb: org.vault.tkb?.raw ?? "" } : undefined);
  const ch = useChanged(snap);
  const f = (k: string) => (ch.has(k) ? "sx-flash" : "");

  const tokens = graph?.nodes.filter((n) => n.type === "Token") ?? [];
  const protocols = graph?.nodes.filter((n) => n.type === "Protocol") ?? [];
  const recipients = graph?.nodes.filter((n) => n.type === "Recipient") ?? [];
  const tkb = org?.vault.tkb;
  const total = org ? big(org.vault.balance.raw) + big(tkb?.raw ?? "0") : 0n;
  const share = tkb ? percentOf(big(tkb.raw), total) : 0;

  return (
    <section id="chinh-sach" aria-labelledby="chinh-sach-t" className="sx-card" style={{ ["--ac" as string]: "#ff8c42", padding: "22px 26px 20px" }}>
      <header className="sx-head" style={{ marginBottom: 16 }}>
        <div style={{ minWidth: 0 }}>
          <h2 id="chinh-sach-t" className="sx-title">Chính sách trong vault</h2>
          <p className="sx-sub">Trạng thái vault đang giữ ngay lúc này; ô vừa đổi sẽ sáng vàng vài giây.</p>
        </div>
        <span className="tnum" style={{ fontFamily: "var(--font-toy)", fontWeight: 800, fontSize: 28, lineHeight: 1 }}>v{policyLabel(graph) ?? policyLabel(health) ?? "…"}<span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-2)", marginLeft: 6 }}>phiên bản chính sách</span></span>
      </header>
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
        <Stat cls={f("vault:paused")} k="Vault" v={paused ? "Đã dừng" : "Đang chạy"} tone={paused ? "bad" : "ok"} s={paused ? "mọi pay/swap bị revert" : undefined} />
        <Stat cls={f("usdc")} k="tUSDC trong vault" v={org?.vault.balance.display ?? "…"} />
        {tkb ? <Stat cls={f("tkb")} k="tTKB trong vault" v={tkb.display} s={<>chiếm <b>{share.toFixed(1).replace(".", ",")}%</b> (mục tiêu 20%)</>} /> : null}
        <Stat k="Quỹ chính · C-Chain" v={org?.mainTreasury.balance.display ?? "…"} />
      </div>

      <div className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div style={{ minWidth: 0 }}>
      <h3 className="sx-h3">Khu và thẻ <span title="Tx AllowList là danh sách của node: thẻ ở trạng thái None bị từ chối trước khi vào block, không có tx hash." style={{ color: "var(--ink-2)", display: "inline-flex" }}><Info size={14} aria-label="Giải thích Tx AllowList" /></span></h3>
      {!graph ? <Empty>Đang tải…</Empty> : (
        <div className="sx-scroll" style={{ border: "1.5px solid #efe2c6", borderRadius: 18, background: "#fff", overflowX: "auto" }}>
          <table className="sx-table" style={{ minWidth: 640 }}>
            <thead><tr><th>Khu / thẻ</th><th>Tx AllowList</th><th className="r">Hạn mức thẻ</th><th className="r">Hạn mức khu</th><th style={{ width: 210 }}>Đã dùng hôm nay</th><th>Trạng thái</th></tr></thead>
            <tbody>
              {graph.districts.map((d) => {
                const dcap = d.dailyCap ? big(d.dailyCap.raw) : null, dspent = big(d.spentToday.raw);
                return (
                  <FragmentRows key={d.principalId}>
                    <tr style={{ background: "#fbf3e1" }}>
                      <td><KindTag kind={d.kind} /> <b className="font-toy" style={{ fontSize: 15 }}>{d.label}</b> <code className="mono" style={{ color: "var(--ink-2)" }}>{d.principalId}</code></td>
                                            <td><span style={{ color: "var(--ink-2)" }}>{d.keys.length} thẻ</span></td>
                      <td className="r" />
                      <td className={`r tnum ${f(`d:${d.principalId}:cap`)}`}><b>{d.dailyCap ? d.dailyCap.display : "—"}</b></td>
                      <td className={f(`d:${d.principalId}:spent`)}>
                        <div className="flex items-center gap-2"><b className="tnum" style={{ minWidth: 46, textAlign: "right" }}>{d.spentToday.display}</b><div style={{ flex: 1 }}><CapBar spent={dspent} cap={dcap} /></div></div>
                      </td>
                      <td className={f(`d:${d.principalId}:locked`)}>{d.locked ? <Chip t="bad">đã khoá</Chip> : <span style={{ color: "var(--ok-ink)", fontWeight: 700, fontSize: 12 }}>hoạt động</span>}</td>
                    </tr>
                    {d.keys.map((kid) => {
                      const n = keyNode(kid)?.data, kcap = big(n?.keyDailyCap?.raw), kspent = big(n?.keySpentToday?.raw);
                      const enabled = n?.active !== false;
                      return (
                        <tr key={kid}>
                          <td style={{ paddingLeft: 24 }}><KindTag kind={n?.kind} /> <code className="mono">{kid}</code> <span className="mono" style={{ color: "var(--ink-2)", fontSize: 11 }}>{n?.address ? shortHash(n.address, 6, 4) : ""}</span></td>
                                                    <td className={f(`k:${kid}:role`)}><Chip t={enabled ? "ok" : "bad"} mono>{enabled ? "Enabled" : "None"}</Chip></td>
                          <td className={`r tnum ${f(`k:${kid}:cap`)}`}>{n?.keyDailyCap?.display ?? "…"}</td>
                          <td className="r" style={{ color: "var(--ink-2)" }}>·</td>
                          <td className={f(`k:${kid}:spent`)}>
                            <div className="flex items-center gap-2"><span className="tnum" style={{ minWidth: 46, textAlign: "right" }}>{n?.keySpentToday?.display ?? "…"}</span><div style={{ flex: 1 }}><CapBar spent={kspent} cap={kcap} /></div></div>
                          </td>
                          <td>{!enabled ? <span style={{ color: "var(--ink-2)", fontSize: 12 }}>node từ chối</span> : kspent >= kcap && kcap > 0n ? <Chip t="warn">hết hạn mức thẻ</Chip> : null}</td>
                        </tr>
                      );
                    })}
                  </FragmentRows>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      </div>
      <div className="grid gap-3.5">
        <AllowList title="Tiền đã duyệt" code="tokenAllowed[token]" flash={f("allow:count")}
          rows={[...tokens.map((n) => ({ id: n.id, name: n.label, ok: true, sub: decimalsOf(n.label) !== null ? `${decimalsOf(n.label)} decimals` : undefined })), ...NOT_ALLOWED.filter((x) => x.kind === "token").map((x) => ({ id: x.name, name: x.name, ok: false, sub: `${decimalsOf(x.name) ?? "?"} decimals` }))]} />
        <AllowList title="Chợ đổi tiền đã duyệt" code="protocolAllowed[target][selector]" flash={f("allow:count")}
          rows={[...protocols.map((n) => ({ id: n.id, ...parseProtocol(n.label), ok: true })), ...NOT_ALLOWED.filter((x) => x.kind === "protocol").map((x) => ({ id: x.name, ...parseProtocol(x.name), ok: false }))].map((r) => ({ id: r.id, name: r.target, fn: r.fn, ok: r.ok }))} />
        <AllowList title="Người nhận đã duyệt" code="recipientAllowed[addr]" flash={f("allow:count")}
          rows={[...recipients.map((n) => ({ id: n.id, name: n.label, ok: true, sub: n.data.address ? shortHash(n.data.address, 6, 4) : undefined })), ...NOT_ALLOWED.filter((x) => x.kind === "recipient").map((x) => ({ id: x.name, name: x.name, ok: false }))]} />
      </div>
      </div>
    </section>
  );
}

function FragmentRows({ children }: { children: React.ReactNode }) { return <>{children}</>; }

interface AllowRow { id: string; name: string; ok: boolean; sub?: string; fn?: string }
function AllowList({ title, code, rows, flash }: { title: string; code: string; rows: AllowRow[]; flash?: string }) {
  return (
    <div className={flash} style={{ background: "#fffdf8", border: "1.5px solid #efe2c6", borderRadius: 18, padding: "12px 14px 14px" }}>
      <div className="font-toy" style={{ fontWeight: 800, fontSize: 16 }}>{title}</div>
      <code className="mono" style={{ color: "var(--ink-2)", fontSize: 11 }}>{code}</code>
      <ul className="mt-2 flex flex-col gap-1.5" style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {rows.length === 0 ? <li style={{ color: "var(--ink-2)" }}>(trống)</li> : rows.map((r) => (
          <li key={r.id} className="flex items-center gap-2" style={{ background: "#fff", border: `1.5px ${r.ok ? "solid" : "dashed"} ${r.ok ? "var(--ok-line)" : "#e3b3b3"}`, borderRadius: 12, padding: "3px 9px", minWidth: 0 }}
            title={r.ok ? "Có trong danh sách" : "Không có trong danh sách: dùng trong kịch bản kẻ gian"}>
            <span aria-label={r.ok ? "được phép" : "không được phép"} style={{ fontWeight: 800, color: r.ok ? "var(--ok-ink)" : "var(--red-ink)", width: 14 }}>{r.ok ? "✓" : "✕"}</span>
            <span className="mono" style={{ fontWeight: 600, fontSize: 12, textDecoration: r.ok ? "none" : "line-through", color: r.ok ? "var(--ink)" : "#a05a5a" }}>{r.name}{r.fn ? <span style={{ color: "var(--ink-2)" }}>.{r.fn}</span> : null}</span>
            {r.sub ? <span className="mono" style={{ marginLeft: "auto", color: "var(--ink-2)", fontSize: 11 }}>{r.sub}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ k, v, s, tone, cls }: { k: string; v: React.ReactNode; s?: React.ReactNode; tone?: "ok" | "bad"; cls?: string }) {
  return (
    <div className={cls} style={{ borderRadius: 16, padding: "4px 6px" }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink-2)" }}>{k}</div>
      <div className="font-toy tnum" style={{ fontWeight: 800, fontSize: 32, lineHeight: 1.15, color: tone === "bad" ? "var(--red-ink)" : tone === "ok" ? "var(--ok-ink)" : "var(--ink)" }}>{v}</div>
      {s ? <div style={{ fontSize: 12, color: "var(--ink-2)" }}>{s}</div> : null}
    </div>
  );
}
