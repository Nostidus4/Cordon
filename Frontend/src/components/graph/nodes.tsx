// Node components of the spread graph (cream toy look): district box, key card, treasury / vault card. Clicking a district or key toggles its person.
import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Bot, Landmark, Server, User, Vault } from "lucide-react";
import type { KeyKind } from "../../types";
import type { DistrictData, EntityData, KeyData } from "../../graph/toReactFlow";
import { useGraphActions } from "./context";

const ICON: Record<KeyKind, typeof User> = { HUMAN: User, AGENT: Bot, SERVICE: Server };
const cls = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");
const onKey = (fn: () => void) => (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } };

export const DistrictNode = memo(function DistrictNode({ data: d }: NodeProps<Node<DistrictData>>) {
  const { toggle, picked } = useGraphActions();
  const Icon = ICON[d.kind];
  const go = () => toggle(d.principalId);
  return (
    <div role="button" tabIndex={0} aria-pressed={picked.has(d.principalId)} aria-label={`Khu ${d.label}${d.origin ? ", đang giả sử bị chiếm" : ""}${d.red && !d.origin ? ", bị lộ" : ""}`}
      onClick={go} onKeyDown={onKey(go)} style={{ width: d.w, height: d.h }}
      className={cls("sg-node sg-district", d.red && "red", d.origin && "origin", d.locked && "locked", d.dim && "dim", picked.has(d.principalId) && !d.origin && "on")}>
      <Handle id="t" type="target" position={Position.Top} />
      <Handle id="hold" type="source" position={Position.Left} style={{ left: 8, top: 66 }} />
      <Handle id="db" type="source" position={Position.Bottom} />
      {d.origin ? <span className="sg-tab">✕ bị chiếm</span> : d.red ? <span className="sg-tab">✕ bị lộ</span> : null}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="sg-ico"><Icon size={17} aria-hidden /></span>
        <span className="sg-t" style={{ flex: 1 }}>{d.label}</span>
      </div>
      {d.dailyCap ? <span className="sg-chip">✓ Trần chung {d.dailyCap.display}/ngày</span> : <span className="sg-chip none">○ không có trần chung</span>}
    </div>
  );
});

export const KeyNode = memo(function KeyNode({ data: d }: NodeProps<Node<KeyData>>) {
  const { toggle } = useGraphActions();
  const Icon = ICON[d.kind];
  const go = () => { if (d.ownerId) toggle(d.ownerId); };
  return (
    <div role="button" tabIndex={0} aria-label={`${d.label}${d.red ? ", bị lộ" : ""}${d.declaredBy ? `, ${d.declaredBy} tự khai là người quản` : ""}`}
      onClick={go} onKeyDown={onKey(go)} style={{ width: d.w, height: d.h }} className={cls("sg-node sg-key", d.red && "red", d.locked && "locked", d.dim && "dim")}>
      <Handle id="l" type="target" position={Position.Left} />
      <Handle id="bt" type="target" position={Position.Bottom} />
      <span className="sg-ico"><Icon size={16} aria-hidden /></span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span className="sg-t" style={d.active ? undefined : { textDecoration: "line-through" }}>{d.label}</span>
        <span className="sg-s">{!d.active ? "đã gạch khỏi chain" : d.red ? `✕ lộ ${d.cap?.display ?? "?"}/ngày` : `trần ${d.cap?.display ?? "?"}/ngày`}</span>
      </span>
      {d.declaredBy ? <span className="sg-decl">◇ tự khai</span> : null}
    </div>
  );
});

export const EntityNode = memo(function EntityNode({ data: d }: NodeProps<Node<EntityData>>) {
  const Icon = d.type === "Treasury" ? Landmark : Vault;
  return (
    <div style={{ width: d.w, height: d.h, cursor: "default" }} className={cls("sg-node sg-entity", d.red && "red", d.dim && "dim")}>
      <Handle id="l" type="target" position={Position.Left} />
      <Handle id="sr" type="source" position={Position.Right} />
      <Handle id="b" type="source" position={Position.Bottom} />
      <span className="sg-ico"><Icon size={17} aria-hidden /></span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span className="sg-t">{d.label}</span>
        {d.balance ? <span className="sg-s"><b className="tnum" style={{ fontSize: 13, color: "var(--ink)" }}>{d.balance.display}</b> tUSDC</span> : null}
      </span>
    </div>
  );
});
