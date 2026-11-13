// Council members, their district (if any) and voting power (spec §10.6).
import { Crown, Lock } from "lucide-react";
import { Skeleton, StatusChip, cn } from "../../components/ui";
import { useDistrict } from "../../hooks/useDistrict";
import { useOrg } from "../../hooks/useOrg";
import { shortHash } from "../../lib/format";
import type { CouncilMember } from "../../types";

const TONE: Record<string, string> = { trang: "from-[#8b7cf6] to-[#4cc9f0]", lan: "from-[#34e0b4] to-[#4cc9f0]", huy: "from-[#ffbf3c] to-[#ff6b7a]" };
const initial = (label: string) => label.split(" ").pop()?.[0] ?? "?";

function District({ id }: { id: string }) {
  const { data: d } = useDistrict(id);
  if (!d) return <Skeleton className="mt-2 h-10 rounded-md" />;
  return (
    <div className="mt-2 flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-line bg-white/[0.03] px-3 py-2 text-[12px]">
      <div className="min-w-0">
        <p className="truncate font-semibold text-text">Khu {d.label.replace(/^(Anh|Chị) /, "")} <span className="font-normal text-faint">· {d.keys.length} thẻ</span></p>
        <p className="tnum text-faint">{d.dailyCap ? <>đã dùng <b className="text-muted">{d.spentToday.display}</b> / {d.dailyCap.display} mỗi ngày</> : <>không có trần chung · mỗi thẻ một trần</>}</p>
      </div>
      {d.locked ? <StatusChip status="locked" size="sm">đã khoá</StatusChip> : <StatusChip status="ok" size="sm">hoạt động</StatusChip>}
    </div>
  );
}

function Member({ m, total }: { m: CouncilMember; total: number }) {
  return (
    <li className="glass rounded-[var(--radius-lg)] p-3.5">
      <div className="flex items-center gap-3">
        <span className={cn("grid size-11 shrink-0 place-items-center rounded-full bg-gradient-to-br text-lg font-bold text-[#06101f] shadow-[0_6px_20px_-6px_rgb(0_0_0/0.6)]", TONE[m.id] ?? "from-brand to-accent")} aria-hidden>{initial(m.label)}</span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[15px] font-semibold leading-tight text-text">{m.label}<Crown className="size-3.5 text-warn" aria-hidden /></p>
          <p className="font-mono text-[11px] text-faint">{shortHash(m.address, 8, 6)}</p>
        </div>
        <div className="text-right leading-tight">
          <p className="text-[11px] text-faint">quyền biểu quyết</p>
          <p className="tnum text-[15px] font-bold text-text">1 phiếu <span className="text-[12px] font-medium text-muted">· 1/{total}</span></p>
        </div>
      </div>
      {m.principalId ? (
        <>
          <District id={m.principalId} />
          <p className="mt-1.5 text-[11px] leading-snug text-faint"><Lock className="mr-1 inline size-3" aria-hidden />Chủ khu này nên không được duyệt đề xuất nới quyền cho khu của mình (xung đột lợi ích).</p>
        </>
      ) : (
        <p className="mt-2 rounded-[var(--radius-md)] border border-dashed border-line-strong px-3 py-2 text-[12px] text-faint">Không sở hữu khu nào: có thể duyệt mọi đề xuất.</p>
      )}
    </li>
  );
}

export function MemberList() {
  const { data: org } = useOrg();
  return (
    <section aria-labelledby="members-title" className="flex min-h-0 flex-col">
      <h2 id="members-title" className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-faint">Thành viên · {org?.council.length ?? 3} người, cần {org?.threshold ?? 2} để nới</h2>
      <ul className="flex min-h-0 flex-1 flex-col gap-2.5">
        {org ? org.council.map((m) => <Member key={m.id} m={m} total={org.council.length} />) : [0, 1, 2].map((i) => <Skeleton key={i} className="h-32 rounded-[var(--radius-lg)]" />)}
      </ul>
    </section>
  );
}
