// Scene 4, step 7: the L1 node itself (Tx AllowList precompile) refuses the locked key's next tx.
// Everything shown comes from the API: the blocked attempt (errorRaw, simulated, txHash) and the district keys (allowListed).
import type { Attempt } from "../types";
import type { DistrictKey } from "../types/district";
import { CrossIcon, KindIcon, ToyCard } from "./ui";

const isNodeReject = (a: Attempt) => a.outcome === "blocked_at_protocol" || a.reasonCode === "BLOCKED_AT_PROTOCOL";

/** The last attempt the node refused (BLOCKED_AT_PROTOCOL), if any. */
export function findNodeReject(attempts: Attempt[]): Attempt | null {
  for (let i = attempts.length - 1; i >= 0; i--) if (isNodeReject(attempts[i])) return attempts[i];
  return null;
}

const kindIcon = (k: DistrictKey["kind"]) => (k === "HUMAN" ? "person" : k === "AGENT" ? "robot" : "server");

export function NodeRejectCard({ attempt, keys }: { attempt: Attempt | null; keys?: DistrictKey[] }) {
  if (!attempt || !isNodeReject(attempt)) return null;
  return (
    <ToyCard tone="red" className="p-4" label="Node từ chối giao dịch" data-testid="node-reject-card">
      <div className="flex items-start justify-between gap-2">
        <div className="font-toy text-[18px] font-bold leading-tight" style={{ color: "var(--ink)" }}>Thẻ đã bị khoá: máy chủ chain từ chối nhận giao dịch</div>
        {attempt.simulated ? <span className="shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-bold" style={{ background: "#ffd9d2", color: "var(--red-d)" }}>mô phỏng</span> : null}
      </div>
      <p className="m-0 mt-1.5 text-[13px] font-semibold leading-snug" style={{ color: "var(--ink-2)" }}>Thẻ này không còn nằm trong danh sách được phép gửi giao dịch của khu.</p>
      {attempt.errorRaw ? (
        <details className="mt-2" data-testid="node-reject-details">
          <summary className="cursor-pointer text-[12px] font-bold" style={{ color: "var(--ink-2)" }}>chi tiết kỹ thuật</summary>
          <pre className="m-0 mt-1 overflow-x-auto whitespace-pre-wrap break-all rounded-xl px-3 py-2 font-mono text-[11px] leading-snug" style={{ background: "#fff3df", color: "var(--red-ink)" }} data-testid="node-reject-raw">{attempt.errorRaw}</pre>
        </details>
      ) : null}
      <p className="m-0 mt-2 flex items-center gap-1.5 text-[13.5px] font-bold" style={{ color: "var(--red-ink)" }}>
        <CrossIcon size={14} />Không có mã giao dịch, không vào block
      </p>
      {keys && keys.length > 0 ? (
        <ul className="m-0 mt-3 flex list-none justify-between gap-1 p-0" aria-label="Các thẻ trong khu">
          {keys.map((k) => (
            <li key={k.address} className="flex flex-col items-center gap-0.5" title={k.label} data-allowlisted={k.allowListed ? "yes" : "no"}>
              <span className="grid place-items-center rounded-full p-1" style={{ background: k.allowListed ? "#f1e4cc" : "#ffc9c0" }}><KindIcon kind={kindIcon(k.kind)} size={26} /></span>
              <span className="text-[11px] font-bold" style={{ color: k.allowListed ? "var(--ink-2)" : "var(--red-ink)" }}>{k.allowListed ? "còn phép" : "bị chặn"}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </ToyCard>
  );
}
