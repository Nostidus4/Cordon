import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { CityStageProps } from "../contract";
import { useCityProps, usePrimaryAction } from "../stageStore";
import { CordonLogo } from "../../components/brand/Logo";
import { PersonIcon, RobotIcon, ServerIcon, ToyButton, ToyCard } from "../ui";

export function IntroScene() {
  const nav = useNavigate();
  const city = useMemo<Partial<CityStageProps>>(() => ({ shot: "overview", showDomain: false }), []);
  useCityProps(city);
  const start = () => nav("/s/look");
  usePrimaryAction(start);
  return (
    <div className="absolute inset-x-0 bottom-12 flex justify-center px-6 sm:justify-start sm:pl-10">
      <ToyCard className="w-[min(520px,100%)] px-8 pb-7 pt-6" label="Mở đầu">
        <div className="mb-3 flex items-end justify-between gap-3">
          <CordonLogo tone="dark" height={40} title="Cordon" />
          <div className="flex items-end gap-1.5" aria-hidden><PersonIcon size={40} /><RobotIcon size={40} /><ServerIcon size={40} /></div>
        </div>
        <h1 className="m-0 font-toy text-[34px] font-extrabold leading-[1.08]" style={{ color: "var(--ink)" }}>
          Mây Labs giao quyền chi tiền cho người, trợ lý AI và phần mềm.
        </h1>
        <p className="mb-5 mt-3 font-toy text-[24px] font-bold leading-tight" style={{ color: "var(--violet-d)" }}>
          Ai đang thật sự cầm những thẻ nào?
        </p>
        <div className="flex items-center gap-4">
          <ToyButton size="lg" pulse onClick={start}>Bắt đầu →</ToyButton>
          <span className="toy-body hidden sm:inline">Bấm phím cách hoặc mũi tên →</span>
        </div>
      </ToyCard>
    </div>
  );
}
