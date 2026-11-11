import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { focus, subscribeFocus } from "./focus";
import { useFrame } from "@react-three/fiber";
import type { CityStageProps } from "../../stage/contract";
import { RTContext } from "./context";
import { Arc } from "./Arcs";
import { Fence } from "./Fences";
import Gate from "./Gate";
import Packets from "./Packets";
import { Pin } from "./Pins";
import { StageRuntime, type ArcDef } from "./runtime";
import Shore from "./Shore";

type Props = Pick<CityStageProps, "scene" | "graph" | "spread" | "highlight" | "attempts" | "sharedCap" | "lockedDistricts">;

/** Pins, fences, arcs, shore houses, gate and packets, driven only by props. */
export default function DomainLayer({ scene, graph, spread, highlight, attempts, sharedCap, lockedDistricts }: Props) {
  const rt = useMemo(() => new StageRuntime(), []);
  const [pinIds, setPinIds] = useState<string[]>([]);
  const [fenceIds, setFenceIds] = useState<string[]>([]);
  const [arcs, setArcs] = useState<ArcDef[]>([]);
  const [houses, setHouses] = useState<string[]>([]);
  const [gates, setGates] = useState<string[]>([]);
  const approved = useMemo(() => new Set((graph?.nodes ?? []).filter((n) => n.type === "Recipient").map((n) => n.id.slice(2))), [graph]);
  const sig = useRef("");
  const hover = useSyncExternalStore(subscribeFocus, () => focus.hover);
  const pick = useSyncExternalStore(subscribeFocus, () => focus.pick);
  /** ids whose label is shown: relevant to the scene + hovered/picked node. Others show just the round pin. */
  const labels = useMemo(() => {
    const L = new Set<string>();
    const minhKeys = (graph?.nodes ?? []).filter((n) => n.type === "Key" && n.data.principalId === "minh").map((n) => n.id);
    if (scene === "look" || scene === "fix") { minhKeys.forEach((k) => L.add(k)); L.add("p:minh"); }
    if (scene === "try" && spread && spread.step >= 0) {
      for (const f of spread.from) L.add(f);
      for (let i = 0; i <= Math.min(spread.step, spread.order.length - 1); i++) spread.order[i].nodeIds.forEach((n) => L.add(n));
    }
    if (scene === "incident") {
      L.add("p:minh");
      for (const a of (attempts ?? []).slice(-3)) {
        L.add(`k:${a.signer}`);
        if (a.action.to) L.add(`r:${a.action.to}`);
        if (a.action.dex) L.add(/evil/i.test(a.action.dex) ? "pr:evil_dex" : "pr:MockDEX");
      }
    }
    if (scene === "request") { L.add("council"); }
    for (const n of highlight?.nodeIds ?? []) L.add(n);
    if (hover) L.add(hover);
    if (pick) L.add(pick);
    // keep a district fence label out of the way when its keys already carry labels in try/fix/incident only for minh
    return L;
  }, [scene, graph, spread, attempts, highlight, hover, pick]);
  const shoreLabels = useMemo(() => {
    const S = new Set<string>();
    for (const id of labels) {
      if (id.startsWith("r:") || id.startsWith("pr:") || id === "treasury") S.add(id);
    }
    return S;
  }, [labels]);

  useEffect(() => {
    const reachedNodes = new Set<string>();
    const reachedEdges = new Set<string>();
    if (spread && spread.step >= 0) {
      for (const id of spread.from) reachedNodes.add(id);
      for (let i = 0; i <= Math.min(spread.step, spread.order.length - 1); i++) {
        for (const n of spread.order[i].nodeIds) reachedNodes.add(n);
        for (const e of spread.order[i].edgeIds) reachedEdges.add(e);
      }
    }
    rt.sync(graph, {
      reachedNodes, reachedEdges,
      hlNodes: new Set(highlight?.nodeIds ?? []), hlEdges: new Set(highlight?.edgeIds ?? []),
      tone: highlight?.tone ?? "amber", locked: new Set(lockedDistricts ?? []),
    });
    const s = JSON.stringify([[...rt.pins.keys()], [...rt.fences.keys()], rt.arcs.map((a) => a.id + a.style), rt.houses, [...rt.fences.values()].filter((f) => f.cap).map((f) => f.principalId + f.label + f.cap + f.nPins)]);
    if (s !== sig.current) {
      sig.current = s;
      setPinIds([...rt.pins.keys()]);
      setFenceIds([...rt.fences.keys()]);
      setArcs([...rt.arcs]);
      setHouses([...rt.houses]);
      setGates([...rt.fences.values()].filter((f) => f.cap).map((f) => f.principalId));
    }
  }, [graph, spread, highlight, lockedDistricts, rt]);

  useFrame(({ clock }, dt) => rt.tick(Math.min(dt, 0.05), clock.elapsedTime));

  return (
    <RTContext.Provider value={rt}>
      {fenceIds.map((id) => <Fence key={id} id={id} showLabel={labels.has(`p:${id}`)} />)}
      {gates.map((id) => <Gate key={id} principalId={id} sharedCap={sharedCap ?? null} />)}
      {arcs.map((a) => <Arc key={a.id} def={a} />)}
      {pinIds.map((id) => <Pin key={id} id={id} showLabel={labels.has(id)} />)}
      <Shore houses={houses} approved={approved} labels={shoreLabels} />
      <Packets attempts={attempts} />
    </RTContext.Provider>
  );
}
