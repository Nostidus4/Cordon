// End card: the three numbers of the story + a way back to the technical screens.
import { Link, useNavigate } from "react-router-dom";
import { useAttempts } from "../hooks/useAttempts";
import { DISTRICT_CAP_V2, KEY_CAP, SCENE4_STEPS } from "../shared/scenario4";
import { deriveView } from "../pages/incident/incidentView";
import { disp } from "./logic";
import { useStageStore } from "./stageStore";
import { CordonMark } from "../components/brand/Logo";
import { ArrowRightGlyph, Confetti, ToyButton, ToyCard } from "./ui";

/** What the scripted attacker gets through the gate: the ✓ attacker steps of spec §4.3 (10.000 + 10.000). */
const SCRIPTED_STOLEN = SCENE4_STEPS.filter((s) => s.who === "attacker" && s.expect === "ok" && s.amount).reduce((n, s) => n + Number((s.amount ?? 0n) / 1_000_000n), 0);

export function EndCard() {
  const nav = useNavigate();
  const setEnded = useStageStore((s) => s.setEnded);
  const { data } = useAttempts();
  const attacker = data?.length ? deriveView(data, false).attackerSpent : 0n;
  const stolen = attacker > 0n ? disp(attacker) : disp(SCRIPTED_STOLEN);
  return (
    <div data-slot="end-card" className="pointer-events-auto absolute inset-0 z-40 grid place-items-center bg-[rgba(45,34,80,0.38)] px-4" role="dialog" aria-modal="true" aria-label="Tóm tắt">
      <ToyCard className="relative w-[min(760px,100%)] px-8 pb-7 pt-6">
        <Confetti burst={1} />
        <div className="flex items-center gap-3"><CordonMark size={46} /><h2 className="m-0 font-toy text-[30px] font-extrabold leading-tight" style={{ color: "var(--ink)" }}>Cùng một vụ chiếm máy, hai kết cục</h2></div>
        <div className="mt-5 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2">
          <div className="toy-tile" data-tone="red"><div className="toy-tile-label">Khi chưa có cổng chung</div><div className="num mt-1" style={{ fontSize: 46, color: "var(--red-ink)" }}>{disp(5 * KEY_CAP)}</div><div className="toy-body" style={{ fontSize: 13 }}>có thể mất mỗi ngày</div></div>
          <ArrowRightGlyph size={28} />
          <div className="toy-tile" data-tone="violet"><div className="toy-tile-label">Sau khi gom 5 thẻ</div><div className="num mt-1" style={{ fontSize: 46, color: "var(--violet-d)" }}>{disp(DISTRICT_CAP_V2)}</div><div className="toy-body" style={{ fontSize: 13 }}>cổng chung mỗi ngày</div></div>
          <ArrowRightGlyph size={28} />
          <div className="toy-tile" data-tone="teal"><div className="toy-tile-label">Kẻ gian chỉ lấy được</div><div className="num mt-1" style={{ fontSize: 46, color: "var(--teal-ink)" }}>{stolen}</div><div className="toy-body" style={{ fontSize: 13 }}>rồi khu bị khoá</div></div>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <ToyButton color="cream" onClick={() => setEnded(false)}>← Quay lại</ToyButton>
          <ToyButton color="teal" onClick={() => { setEnded(false); nav("/s/look"); }}>Xem lại từ đầu</ToyButton>
          <Link to="/chi-tiet/map" className="ml-auto text-[15px] font-bold underline underline-offset-4" style={{ color: "var(--violet-d)" }}>Xem chi tiết kỹ thuật</Link>
        </div>
      </ToyCard>
    </div>
  );
}
