import { useEffect, useMemo } from "react";
import type { BuildingCode, CityStageProps } from "../stage/contract";
import CityCanvas from "./CityCanvas";
import { stageHooks, useCityStore } from "./cityStore";
import Sky from "./Sky";
import DomainLayer from "./stage/DomainLayer";
import type { BuildingState } from "./buildings";

/** Full-bleed 3D city for the scene stage. Domain layer (pins, fences, arcs, packets...) is driven only by props. */
export default function CityStage(props: CityStageProps) {
  const { scene, shot, graph, showDomain, spread, highlight, attempts, sharedCap, lockedDistricts, buildingStates, night, onPick, onHover } = props;

  useEffect(() => {
    stageHooks.active = true;
    return () => {
      stageHooks.active = false;
      stageHooks.onPick = undefined;
      stageHooks.onHover = undefined;
      const s = useCityStore.getState();
      s.setShot(null);
      s.setCards(true);
    };
  }, []);
  useEffect(() => {
    stageHooks.onPick = onPick;
    stageHooks.onHover = onHover;
  }, [onPick, onHover]);

  useEffect(() => {
    const s = useCityStore.getState();
    s.setShot(shot);
    s.select(null);
  }, [shot]);
  useEffect(() => {
    useCityStore.getState().setCards(!showDomain);
  }, [showDomain, scene]);
  useEffect(() => {
    if (night !== undefined) useCityStore.getState().setMode(night ? "night" : "day");
  }, [night]);

  // building states: explicit props, plus the vault turning red when the spread reaches it
  const vaultReached = !!spread && spread.step >= 0 && spread.order.slice(0, spread.step + 1).some((o) => o.nodeIds.includes("vault"));
  const effective = useMemo(() => {
    const m: Record<string, BuildingState> = {};
    for (const [k, v] of Object.entries(buildingStates ?? {})) if (v) m[k as BuildingCode] = v;
    if (vaultReached) m.B03 = "incident";
    return m;
  }, [buildingStates, vaultReached]);
  useEffect(() => {
    const s = useCityStore.getState();
    s.setSource("demo");
    const all: Record<string, BuildingState> = Object.fromEntries(["B01", "B02", "B03", "B04", "B05", "B06", "B07", "B08"].map((c) => [c, "normal" as BuildingState]));
    s.setStates({ ...all, ...effective });
  }, [effective]);

  return (
    <div className="absolute inset-0">
      <Sky />
      <div className="absolute inset-0">
      <CityCanvas>
        {showDomain && <DomainLayer scene={scene} graph={graph} spread={spread} highlight={highlight} attempts={attempts} sharedCap={sharedCap} lockedDistricts={lockedDistricts} />}
      </CityCanvas>
      </div>
    </div>
  );
}
