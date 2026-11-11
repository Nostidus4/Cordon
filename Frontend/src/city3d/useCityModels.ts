import { useEffect, useState } from "react";
import { asset } from "./assets";

export interface CityModels {
  loaded: boolean;
  buildings: Set<string>;
  base: string | null;
  surroundings: string | null;
}

const EMPTY: CityModels = { loaded: true, buildings: new Set(), base: null, surroundings: null };
const ALL = ["B01", "B02", "B03", "B04", "B05", "B06", "B07", "B08"];

/** Reads /models/city/index.json; any failure (404, SPA HTML fallback, bad JSON) means "no models yet". */
export function useCityModels(): CityModels {
  const [models, setModels] = useState<CityModels>({ loaded: false, buildings: new Set(), base: null, surroundings: null });
  useEffect(() => {
    let cancelled = false;
    // dev-only override for testing: ?glb=all|B01,B03  and  &base=city_base.glb
    if (import.meta.env.DEV) {
      const q = new URLSearchParams(window.location.search);
      const g = q.get("glb");
      if (g !== null) {
        setModels({ loaded: true, buildings: new Set(g === "all" ? ALL : g.split(",").filter(Boolean)), base: q.get("base"), surroundings: q.get("surr") });
        return;
      }
    }
    fetch(asset("models/city/index.json"), { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled) return;
        if (!j || !Array.isArray(j.buildings)) return setModels(EMPTY);
        setModels({
          loaded: true,
          buildings: new Set(j.buildings.filter((c: unknown) => typeof c === "string")),
          base: typeof j.base === "string" ? j.base : null,
          surroundings: typeof j.surroundings === "string" ? j.surroundings : null,
        });
      })
      .catch(() => !cancelled && setModels(EMPTY));
    return () => {
      cancelled = true;
    };
  }, []);
  return models;
}
