// 'Dừng cả kho' (demoMode) with a confirm modal -> /api/actions/pause (spec §10.6). Tighten needs one member only.
import { useState } from "react";
import { OctagonX } from "lucide-react";
import { Button, Modal, cn } from "../../components/ui";
import { useActions } from "../../hooks/useActions";
import { useOrg } from "../../hooks/useOrg";
import type { MemberId } from "../../types";

export function PauseAllButton({ paused }: { paused: boolean }) {
  const [open, setOpen] = useState(false);
  const [member, setMember] = useState<MemberId>("lan");
  const { data: org } = useOrg();
  const { pause } = useActions();
  const confirm = () => pause.mutate({ member }, { onSuccess: () => setOpen(false) });
  return (
    <>
      <Button variant="danger" size="lg" icon={<OctagonX className="size-5" aria-hidden />} onClick={() => setOpen(true)} disabled={paused} disabledReason={paused ? "Kho đã dừng" : undefined}>Dừng cả kho</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Dừng cả kho?" description="Mọi thẻ ở mọi khu sẽ ngừng chi ngay lập tức (VAULT_PAUSED)."
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Huỷ</Button><Button variant="danger" loading={pause.isPending} onClick={confirm} data-autofocus>Dừng cả kho</Button></>}>
        <p className="mb-3 text-[13px] text-muted">Dừng là hành động <b className="text-text">siết</b>: chỉ cần một thành viên ký. Mở lại kho là <b className="text-text">nới</b>, cần 2/3 thành viên.</p>
        <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wider text-faint">Ký bởi</p>
        <div role="radiogroup" aria-label="Thành viên ký" className="flex gap-2">
          {(org?.council ?? []).map((m) => (
            <button key={m.id} role="radio" aria-checked={member === m.id} type="button" onClick={() => setMember(m.id)}
              className={cn("flex-1 rounded-[var(--radius-md)] border px-3 py-2 text-sm font-semibold transition-colors", member === m.id ? "border-bad/60 bg-bad-soft text-text" : "border-line text-muted hover:border-line-strong")}>{m.label}</button>
          ))}
        </div>
      </Modal>
    </>
  );
}
