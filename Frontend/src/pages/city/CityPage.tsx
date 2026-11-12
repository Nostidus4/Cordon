import { useEffect } from "react";
import BuildingPanel from "../../city3d/BuildingPanel";
import CityCanvas from "../../city3d/CityCanvas";
import { useCityStore } from "../../city3d/cityStore";
import { IncidentColumn, IntroTitle, Legend, Minimap, TopBar } from "../../city3d/panels";
import type { ScenarioId } from "../../city3d/scenarios";
import LiveSync from "../../city3d/LiveSync";
import { useTitle } from "../../hooks/useTitle";
import { api } from "../../lib/api";
import StageHarness from "./StageHarness";
import Sky from "../../city3d/Sky";
import "./city.css";

export default function CityPage() {
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).get("harness") === "1") return <StageHarness />;
  return <CityPageInner />;
}

function CityPageInner() {
  useTitle("Thành phố 3D");
  useEffect(() => {
    useCityStore.getState().goLive();
  }, []);

  useEffect(() => {
    // dev-only hooks: /city?live=scene4  ?scenario=vault|evac&at=8  ?set=B03:incident  ?select=B03  ?mode=day|night  ?intro=0
    if (!import.meta.env.DEV) return;
    (window as unknown as { __city: unknown }).__city = useCityStore;
    const q = new URLSearchParams(window.location.search);
    const st = useCityStore.getState();
    const mode = q.get("mode");
    if (mode === "day" || mode === "night") st.setMode(mode);
    q.get("set")?.split(",").forEach((kv) => {
      const [c, s] = kv.split(":");
      if (c && s) st.setState(c, s as never);
    });
    const sc = q.get("scenario");
    if (sc === "vault" || sc === "evac") st.startScenario(sc as ScenarioId, Number(q.get("at") ?? 0), q.get("pause") !== "0");
    // ?live=scene4 -> run the mock backend flow (scene 4) so city states come from real data
    if (q.get("live") === "scene4") void api.runScene4();
    const sel = q.get("select");
    if (sel) st.select(sel);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") useCityStore.getState().select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      useCityStore.getState().stopScenario();
      document.body.style.cursor = "";
    };
  }, []);

  return (
    <main className="city-root relative h-screen w-full overflow-hidden text-slate-100">
      <LiveSync />
      <Sky />
      <div className="absolute inset-0">
        <CityCanvas />
      </div>
      <div className="pointer-events-none absolute inset-0 z-40 p-4">
        <div className="flex h-full flex-col gap-3">
          <TopBar />
          <div className="flex min-h-0 flex-1 justify-between">
            <div className="flex flex-col justify-end">
              <Minimap />
            </div>
            <div className="flex min-h-0 w-[22.5rem] max-w-[90vw] flex-col gap-3">
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1 [&>*]:shrink-0">
                <BuildingPanel />
                <IncidentColumn />
              </div>
              <div className="shrink-0 self-end"><Legend /></div>
            </div>
          </div>
        </div>
      </div>
      <IntroTitle />
    </main>
  );
}
