// /he-thong/:tab: technical dashboard for engineers. One focused view per tab, toy pill tab bar like the stage stepper.
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Building2, LayoutDashboard, Radar, Scale, ScrollText, ShieldCheck, SlidersHorizontal, Sparkles } from "lucide-react";
import "../../stage/toy.css";
import { useAudioUnlock } from "../../audio/director";
import { SoundToggle } from "../../audio/SoundToggle";
import "./system.css";
import { SCENE_META, STAGE_SCENES } from "../../stage/logic";
import { ShieldIcon, useReduced } from "../../stage/ui";
import { useSysInvalidation } from "./data";
import { useSystemDevHooks } from "./devHooks";
import { useFeed, useSystemFeed } from "./feed";
import { Architecture } from "./sections/Architecture";
import * as AgentMod from "./sections/AgentRebalance";
import * as AssistantMod from "./sections/Assistant";
import * as CouncilMod from "./sections/Council";
import * as EventLogMod from "./sections/EventLog";
import { Controls, Overview } from "./sections/Overview";
import * as PolicyMod from "./sections/PolicyState";
import { Pipeline } from "./sections/Pipeline";
import * as SimulationMod from "./sections/Simulation";
import { ACCENT } from "./ui";

/** Sections owned by other agents may export a named component or a default: accept both. */
const pick = (mod: object, name: string): ComponentType => ((mod as Record<string, ComponentType>)[name] ?? (mod as { default?: ComponentType }).default ?? (() => null)) as ComponentType;
const EventLog = pick(EventLogMod, "EventLog");
const PolicyState = pick(PolicyMod, "PolicyState");
const Council = pick(CouncilMod, "Council");
const Simulation = pick(SimulationMod, "Simulation");
const AgentRebalance = pick(AgentMod, "AgentRebalance");
const Assistant = pick(AssistantMod, "Assistant");

const SCENE_DOT = { look: "#7a47e6", try: "#1565e8", fix: "#e8782a", incident: "#d62839", request: "#0e968c" } as const;

export const TABS = [
  { id: "tong-quan", label: "Tổng quan", color: ACCENT.plaza, icon: LayoutDashboard },
  { id: "giao-dich", label: "Giao dịch", color: ACCENT.safety, icon: ShieldCheck },
  { id: "su-kien", label: "Sự kiện", color: ACCENT.vault, icon: ScrollText },
  { id: "chinh-sach", label: "Chính sách", color: ACCENT.spend, icon: SlidersHorizontal },
  { id: "hoi-dong", label: "Hội đồng", color: ACCENT.council, icon: Scale },
  { id: "rui-ro", label: "Rủi ro", color: ACCENT.growth, icon: Radar },
  { id: "tro-ly", label: "Trợ lý", color: ACCENT.resp, icon: Sparkles },
] as const;
type TabId = (typeof TABS)[number]["id"];

function Assistants() {
  const [p, setP] = useState<"agent" | "ask">("agent");
  return (
    <div className="grid gap-4">
      <div className="sx-seg" role="group" aria-label="Chọn trợ lý" style={{ justifySelf: "start" }}>
        <button type="button" aria-pressed={p === "agent"} onClick={() => setP("agent")}>Trợ lý Cân đối</button>
        <button type="button" aria-pressed={p === "ask"} onClick={() => setP("ask")}>Hỏi đáp</button>
      </div>
      {p === "agent" ? <AgentRebalance /> : <Assistant />}
    </div>
  );
}

function Body({ tab }: { tab: TabId }): ReactNode {
  switch (tab) {
    case "tong-quan": return <div className="grid gap-4"><Overview /><Controls /><Architecture /></div>;
    case "giao-dich": return <Pipeline />;
    case "su-kien": return <EventLog />;
    case "chinh-sach": return <PolicyState />;
    case "hoi-dong": return <Council />;
    case "rui-ro": return <Simulation />;
    case "tro-ly": return <Assistants />;
  }
}

export default function SystemPage() {
  const qc = useQueryClient();
  const reduced = useReduced();
  const { tab } = useParams();
  const total = useFeed((s) => s.total);
  useAudioUnlock(); // soft clicks on tabs/buttons; the speaker toggle sits in the top bar
  useSystemFeed(); // page level: tab switches never remount the stream tap
  useSysInvalidation(qc);
  useSystemDevHooks();
  useEffect(() => {
    const prev = document.title;
    document.title = "Bảng kỹ thuật · GuardianAI";
    return () => { document.title = prev; };
  }, []);

  const cur = TABS.find((t) => t.id === tab);
  if (!cur) return <Navigate to="/he-thong/tong-quan" replace />;

  return (
    <div className="stage sys fixed inset-0 z-[1] overflow-y-auto overflow-x-hidden" data-testid="system-page">
      <div className="mx-auto px-5 pb-12 pt-4" style={{ maxWidth: 1480 }}>
        <header className="sx-bar-top">
          <div className="sx-brand"><ShieldIcon size={32} />Kỹ thuật</div>
          <nav className="sx-tabs" aria-label="Các mục">
            {TABS.map((t) => {
              const Icon = t.icon, on = t.id === cur.id;
              return (
                <Link key={t.id} to={`/he-thong/${t.id}`} className="sx-tab" aria-current={on ? "page" : undefined} style={{ ["--ac" as string]: t.color }}>
                  {on ? <motion.span layoutId="sx-tab-bg" className="bg" transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 32 }} /> : null}
                  <span className="g"><Icon size={14} strokeWidth={2.6} aria-hidden /></span>{t.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-3" style={{ marginLeft: "auto" }}>
            <SoundToggle />
            <span className="sx-chip" data-t="ok" title="tin trên stream kể từ lúc mở trang" style={{ background: "rgba(255,255,255,.85)" }}><span className="sx-dot" data-live="true" />{total}</span>
            <span className="sx-scenedots" aria-label="Các cảnh">
              {STAGE_SCENES.map((s) => <Link key={s} to={`/s/${s}`} title={`Cảnh ${SCENE_META[s].n}: ${SCENE_META[s].label}`} style={{ background: SCENE_DOT[s] }}>{SCENE_META[s].n}</Link>)}
            </span>
            <Link to="/" className="inline-flex items-center gap-1.5" style={{ color: "#fff", fontWeight: 700, textDecoration: "none", fontSize: 14, textShadow: "0 1px 2px rgba(45,34,80,.4)" }}><Building2 size={16} aria-hidden /> Về thành phố</Link>
          </div>
        </header>
        <AnimatePresence mode="wait" initial={false}>
          <motion.main key={cur.id} id={cur.id} initial={reduced ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={reduced ? undefined : { opacity: 0, y: -6 }} transition={{ duration: 0.16 }}>
            <Body tab={cur.id} />
          </motion.main>
        </AnimatePresence>
      </div>
    </div>
  );
}
