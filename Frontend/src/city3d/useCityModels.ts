import { useEffect, useState } from "react";
import { DefaultLoadingManager } from "three";
import { useGLTF } from "@react-three/drei";
import { asset, DRACO } from "./assets";
import { POP_ORDER } from "./assembly";

export interface CityModels {
  loaded: boolean;
  buildings: Set<string>;
  base: string | null;
  surroundings: string | null;
}

const EMPTY: CityModels = { loaded: true, buildings: new Set(), base: null, surroundings: null };
const ALL = ["B01", "B02", "B03", "B04", "B05", "B06", "B07", "B08"];

/**
 * Kick off every glb download at once, in assembly order (island first, plaza/council/vault, the rest, surroundings last).
 * They all go through three's DefaultLoadingManager, so drei's useProgress sees one steady 0..100 as they arrive.
 */
function preloadAll(m: CityModels) {
  const url = (f: string) => asset(`models/city/${f}`);
  if (m.base) useGLTF.preload(url(m.base), DRACO, true);
  for (const code of POP_ORDER) if (m.buildings.has(code)) useGLTF.preload(url(`${code}.glb`), DRACO, true);
  for (const code of m.buildings) if (!POP_ORDER.includes(code)) useGLTF.preload(url(`${code}.glb`), DRACO, true);
  if (m.surroundings) useGLTF.preload(url(m.surroundings), DRACO, true);
}

/** Reads /models/city/index.json; any failure (404, SPA HTML fallback, bad JSON) means "no models yet". */
export function useCityModels(): CityModels {
  const [models, setModels] = useState<CityModels>({ loaded: false, buildings: new Set(), base: null, surroundings: null });
  useEffect(() => {
    let cancelled = false;
    const done = (m: CityModels) => {
      if (cancelled) return;
      preloadAll(m);
      setModels(m);
    };
    // dev-only override for testing: ?glb=all|B01,B03  and  &base=city_base.glb
    if (import.meta.env.DEV) {
      const q = new URLSearchParams(window.location.search);
      const g = q.get("glb");
      if (g !== null) {
        done({ loaded: true, buildings: new Set(g === "all" ? ALL : g.split(",").filter(Boolean)), base: q.get("base"), surroundings: q.get("surr") });
        return;
      }
    }
    const indexUrl = asset("models/city/index.json");
    DefaultLoadingManager.itemStart(indexUrl); // the manifest counts towards the loading progress too
    fetch(indexUrl, { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j || !Array.isArray(j.buildings)) return done(EMPTY);
        done({
          loaded: true,
          buildings: new Set(j.buildings.filter((c: unknown) => typeof c === "string")),
          base: typeof j.base === "string" ? j.base : null,
          surroundings: typeof j.surroundings === "string" ? j.surroundings : null,
        });
      })
      .catch(() => done(EMPTY))
      .finally(() => DefaultLoadingManager.itemEnd(indexUrl));
    return () => {
      cancelled = true;
    };
  }, []);
  return models;
}
