// /_kit: every UI component, for screen agents and review. Dev page, not in nav.
import { useState, type ReactNode } from "react";
import { Bell, Lock, Play, Settings, ShieldCheck, Trash2 } from "lucide-react";
import {
  AnimatedNumber, Badge, Button, CapBar, Card, CardHeader, Drawer, EmptyState, EvidenceBadge, IconButton, Kbd, Modal, Money, PageHeader,
  Skeleton, SkeletonCard, StatusChip, StatusDot, Tabs, Tooltip,
} from "../../components/ui";
import { toast, useUiStore } from "../../store/uiStore";
import { REASONS, type ReasonCode } from "../../shared/reasonCodes";
import { fmtPercent, money, toBase } from "../../lib/format";

const Section = ({ id, title, hint, children }: { id: string; title: string; hint?: string; children: ReactNode }) => (
  <section id={id} className="mb-6">
    <Card>
      <CardHeader title={title} en={hint} />
      {children}
    </Card>
  </section>
);
const Swatch = ({ name, cls, text }: { name: string; cls: string; text?: string }) => (
  <div className="w-28">
    <div className={`h-14 rounded-lg border border-line ${cls}`} />
    <p className="mt-1.5 text-xs font-semibold text-text">{name}</p>
    {text ? <p className="text-[11px] text-faint">{text}</p> : null}
  </div>
);

export default function KitPage() {
  const [n, setN] = useState(20000);
  const [modal, setModal] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [spent, setSpent] = useState(25000);
  const setPalette = useUiStore((s) => s.setPaletteOpen);
  const reasons = Object.keys(REASONS) as ReasonCode[];
  return (
    <>
      <PageHeader title="UI kit" en="design system" description="Mọi thành phần dùng chung. Màu có nghĩa cố định theo spec §10.1: xanh ngọc = ổn · vàng = chú ý · đỏ = bị chặn · xám = đã khoá, luôn kèm ký hiệu ✓ ▲ ✕ ◐ và chữ."
        actions={<Button variant="secondary" size="sm" onClick={() => setPalette(true)}>Mở bảng lệnh <Kbd>⌘K</Kbd></Button>} />

      <Section id="color" title="Màu & chữ" hint="tokens.css">
        <div className="flex flex-wrap gap-4">
          <Swatch name="bg" cls="bg-bg" /><Swatch name="surface" cls="bg-surface" /><Swatch name="surface-2" cls="bg-surface-2" />
          <Swatch name="brand" cls="bg-brand" /><Swatch name="accent" cls="bg-accent" />
          <Swatch name="ok" cls="bg-ok" text="✓ bình thường / đã duyệt" /><Swatch name="warn" cls="bg-warn" text="▲ chú ý / gần trần" />
          <Swatch name="bad" cls="bg-bad" text="✕ bị ảnh hưởng / chặn" /><Swatch name="lock" cls="bg-lock" text="◐ đã khoá" /><Swatch name="sim" cls="bg-sim" text="mô phỏng" />
        </div>
        <div className="mt-6 grid grid-cols-2 gap-6">
          <div className="space-y-1">
            <p className="text-[28px] font-bold tracking-tight text-text">Heading 28 · Be Vietnam Pro</p>
            <p className="text-xl font-semibold text-text">Tiêu đề 20: Khu anh Minh có cờ vàng</p>
            <p className="text-sm text-muted">Chữ phụ (muted) trên nền tối, tương phản 8:1. Tiếng Việt có dấu: ắ ằ ẳ ẵ ặ ơ ư đ.</p>
            <p className="text-xs text-faint">Chữ mờ (faint), chỉ cho nhãn phụ.</p>
          </div>
          <div className="flex items-center gap-8">
            <div><p className="mb-1 text-xs text-faint">Gradient chữ</p><p className="text-gradient text-4xl font-extrabold">GuardianAI</p></div>
            <div><p className="mb-1 text-xs text-faint">Radius</p><div className="flex gap-2">{["xs", "sm", "md", "lg", "xl"].map((r) => <div key={r} className="size-10 border border-line-strong bg-white/5" style={{ borderRadius: `var(--radius-${r})` }} />)}</div></div>
          </div>
        </div>
      </Section>

      <Section id="buttons" title="Button · IconButton" hint="variants, sizes, loading, disabled with reason">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" icon={<Play className="size-4" />}>Chạy agent buổi sáng</Button>
          <Button variant="secondary">Thử xem →</Button>
          <Button variant="ghost">Huỷ</Button>
          <Button variant="success" icon={<ShieldCheck className="size-4" />}>Duyệt với tư cách Lan</Button>
          <Button variant="danger" icon={<Trash2 className="size-4" />}>Dừng cả kho</Button>
          <Button variant="secondary" loading>Đang gửi</Button>
          <Button variant="secondary" disabled disabledReason="Xung đột lợi ích: anh Huy là chủ khu bị ảnh hưởng">Duyệt với tư cách Huy</Button>
          <Button size="sm">Nhỏ</Button><Button size="lg" variant="primary">Lớn</Button>
        </div>
        <div className="mt-5 flex items-center gap-4">
          <Button variant="danger" size="xl" icon={<Lock className="size-6" />} onClick={() => toast.warning("Đã khoá khu anh Minh", "5 thẻ bị gạch khỏi chain")}>Khoá khu anh Minh</Button>
          <span className="text-xs text-faint">Nút đỏ lớn (danger / xl) cho kill switch cảnh 4.</span>
          <div className="ml-auto flex gap-1">
            <IconButton label="Cài đặt" icon={<Settings className="size-5" />} /><IconButton label="Thông báo" icon={<Bell className="size-5" />} active />
          </div>
        </div>
      </Section>

      <div className="grid grid-cols-2 gap-6">
        <Section id="status" title="StatusChip · Badge · StatusDot" hint="không bao giờ chỉ dùng màu">
          <div className="flex flex-wrap gap-2">
            <StatusChip status="ok">bình thường</StatusChip><StatusChip status="warn">gần trần</StatusChip><StatusChip status="bad">bị chặn</StatusChip><StatusChip status="locked">đã khoá</StatusChip><StatusChip status="info">đang chờ</StatusChip>
          </div>
          <div className="mt-3 flex flex-wrap gap-2"><StatusChip size="sm" status="ok">APPROVED</StatusChip><Badge>HUMAN</Badge><Badge tone="brand">policy v2</Badge><Badge tone="mono">key_minh</Badge></div>
          <div className="mt-4 flex items-center gap-4 text-xs text-muted"><span className="flex items-center gap-2"><StatusDot status="ok" pulse /> chain ổn</span><span className="flex items-center gap-2"><StatusDot status="warn" /> chậm</span><span className="flex items-center gap-2"><StatusDot status="bad" /> mất kết nối</span><span className="flex items-center gap-2"><StatusDot status="idle" /> nghỉ</span></div>
          <p className="mt-4 mb-2 text-xs font-semibold text-faint">Lý do chặn (spec §6.4)</p>
          <div className="flex flex-wrap gap-1.5">{reasons.map((r) => <StatusChip key={r} size="sm" status={r === "BLOCKED_AT_PROTOCOL" || r.endsWith("CAP") ? "bad" : r === "DISTRICT_LOCKED" || r === "VAULT_PAUSED" ? "locked" : "warn"}>{REASONS[r].vi}</StatusChip>)}</div>
        </Section>

        <Section id="evidence" title="EvidenceBadge" hint="spec §10.1">
          <div className="flex flex-col items-start gap-3">
            <EvidenceBadge txHash={"0x" + "ab12".repeat(16)} />
            <EvidenceBadge txHash={"0x" + "cd34".repeat(16)} simulated />
            <EvidenceBadge outcome="blocked_at_protocol" errorRaw="rpc error -32000: cannot send transaction: address 0x7a3f is not on the TxAllowList" />
          </div>
          <p className="mt-4 text-xs text-faint">Rê chuột vào từng huy hiệu để xem chi tiết. Tx mô phỏng không có link explorer.</p>
        </Section>
      </div>

      <Section id="money" title="Money · AnimatedNumber" hint="30.000 · /ngày · count-up">
        <div className="flex flex-wrap items-end gap-10">
          <div><p className="mb-1 text-xs text-faint">Money md</p><Money value={money(toBase(30000))} perDay /></div>
          <div><p className="mb-1 text-xs text-faint">lg + unit</p><Money value={money(toBase(100000))} size="lg" unit="tUSDC" tone="bad" /></div>
          <div><p className="mb-1 text-xs text-faint">xl ok</p><Money value={money(toBase(20000))} size="xl" tone="ok" perDay /></div>
          <div><p className="mb-1 text-xs text-faint">hero · AnimatedNumber (bấm để đổi)</p>
            <button type="button" className="text-left" onClick={() => setN((v) => (v === 20000 ? 100000 : v === 100000 ? 140000 : 20000))}>
              <AnimatedNumber value={n} className="text-6xl font-extrabold tracking-tight text-bad" />
            </button></div>
          <div><p className="mb-1 text-xs text-faint">Phần trăm</p><span className="text-2xl font-bold text-text">{fmtPercent(6.5)}</span> <span className="text-xs text-faint">quỹ chính</span></div>
        </div>
      </Section>

      <Section id="cap" title="CapBar" hint="animated, có nhãn · ok → gần trần → hết hạn mức → đã khoá">
        <div className="grid grid-cols-2 gap-x-10 gap-y-5">
          <CapBar label="Khu anh Minh · hạn mức chung" value={toBase(spent)} cap={toBase(30000)} height="lg" />
          <div className="flex items-end gap-2">
            {[5000, 15000, 25000, 30000].map((v) => <Button key={v} size="sm" variant={spent === v ? "primary" : "secondary"} onClick={() => setSpent(v)}>{(v / 1000).toFixed(0)}.000</Button>)}
          </div>
          <CapBar label="key_agent_data" value={toBase(8000)} cap={toBase(20000)} caption="Hạn mức riêng của thẻ" />
          <CapBar label="key_agent_rebalance" value={toBase(20000)} cap={toBase(20000)} />
          <CapBar label="key_minh (đã khoá)" value={toBase(10000)} cap={toBase(20000)} locked />
          <CapBar label="Thẻ nhỏ" height="sm" value={toBase(3000)} cap={toBase(10000)} />
        </div>
      </Section>

      <div className="grid grid-cols-2 gap-6">
        <Section id="tabs" title="Tabs · Tooltip · Kbd">
          <Tabs items={[
            { id: "a", label: "Bạn nghĩ", content: <p className="text-sm text-muted">Tổng trần của chính người được chọn: <b className="text-text">20.000</b>/ngày.</p> },
            { id: "b", label: "Đã khoá chặt", content: <p className="text-sm text-muted">Chặn bằng luật trên chain: <b className="text-ok">20.000</b>/ngày.</p> },
            { id: "c", label: "Ước tính", content: <p className="text-sm text-muted">Gồm quan hệ tự khai, chưa kiểm chứng: <b className="text-bad">100.000</b>/ngày.</p> },
          ]} />
          <div className="mt-5 flex items-center gap-4 text-sm text-muted">
            <Tooltip content="Quan hệ tự khai: chưa được chain kiểm chứng"><span tabIndex={0} className="cursor-help border-b border-dashed border-faint">tự khai</span></Tooltip>
            <span>Mở bảng lệnh: <Kbd>⌘</Kbd> <Kbd>K</Kbd></span>
          </div>
        </Section>

        <Section id="overlay" title="Toast · Modal · Drawer · Command palette">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => toast.success("Đề xuất #11 đã thực thi", "policy v2")}>Toast ✓</Button>
            <Button size="sm" onClick={() => toast.warning("Khu gần trần", "Đã dùng 25.000/30.000")}>Toast ▲</Button>
            <Button size="sm" onClick={() => toast.error("Bị chặn", "DISTRICT_DAILY_CAP")}>Toast ✕</Button>
            <Button size="sm" onClick={() => toast.info("Đã đặt lại kịch bản")}>Toast ●</Button>
            <Button size="sm" variant="primary" onClick={() => setModal(true)}>Modal</Button>
            <Button size="sm" variant="primary" onClick={() => setDrawer(true)}>Drawer</Button>
            <Button size="sm" variant="secondary" onClick={() => setPalette(true)}>⌘K</Button>
          </div>
        </Section>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <Card><CardHeader title="Skeleton" en="loading" /><div className="space-y-2"><Skeleton className="h-5 w-1/2" /><Skeleton /><Skeleton className="w-4/5" /></div></Card>
        <SkeletonCard lines={4} />
        <EmptyState title="Chưa có đề xuất nào" description="Khi có phát hiện rủi ro, đề xuất sẽ xuất hiện ở đây." action={<Button size="sm" variant="secondary">Tạo đề xuất</Button>} />
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Xác nhận khoá khu" description="Hành động siết: một người Hội đồng là đủ."
        footer={<><Button variant="ghost" onClick={() => setModal(false)}>Huỷ</Button><Button variant="danger" onClick={() => { setModal(false); toast.warning("Đã khoá khu") }}>Khoá khu</Button></>}>
        5 thẻ của khu <b className="text-text">minh</b> sẽ bị gạch khỏi Tx AllowList và không gửi được giao dịch nào.
      </Modal>
      <Drawer open={drawer} onClose={() => setDrawer(false)} title="Chi tiết khu minh" description="Panel bên phải">
        <div className="space-y-4"><CapBar label="Hạn mức chung" value={toBase(25000)} cap={toBase(30000)} /><p>Nội dung cuộn được nằm ở đây.</p></div>
      </Drawer>
    </>
  );
}
