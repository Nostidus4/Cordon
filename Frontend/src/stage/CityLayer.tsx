// The persistent full-bleed 3D layer. Loads src/city3d/CityStage.tsx when it exists, else a light placeholder (the Blender hero render
// that glides between "shots"). The canvas never remounts when the scene changes: only props change.
import { lazy, Suspense, type ComponentType } from "react";
import type { CameraShot, CityStageProps } from "./contract";

// import.meta.glob keeps the build green whether or not the file is there yet.
const found = import.meta.glob("../city3d/CityStage.tsx") as Record<string, () => Promise<{ default: ComponentType<CityStageProps> }>>;
const loader = Object.values(found)[0];
const RealCity = loader ? lazy(loader) : null;
export const HAS_REAL_CITY = !!RealCity;

// where the placeholder "camera" looks: [origin-x %, origin-y %, scale]
const SHOT_VIEW: Record<string, [number, number, number]> = {
  overview: [50, 50, 1.02], "district-minh": [30, 56, 1.5], council: [38, 24, 1.55], vault: [24, 48, 1.55],
  gate: [74, 74, 1.55], shore: [62, 90, 1.35],
};
const shotKey = (s: CameraShot) => (typeof s === "string" ? s : "overview");

function Placeholder({ shot, night }: Pick<CityStageProps, "shot" | "night">) {
  const [ox, oy, sc] = SHOT_VIEW[shotKey(shot)] ?? SHOT_VIEW.overview;
  const img = (n: boolean) => `${import.meta.env.BASE_URL}stage-city-${n ? "night" : "day"}.jpg`;
  const layer = (n: boolean) => (
    <div className="absolute inset-0 bg-cover bg-center transition-opacity duration-700" style={{ backgroundImage: `url(${img(n)})`, opacity: !!night === n ? 1 : 0 }} />
  );
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#6f8ff3]" data-placeholder-city>
      <div className="absolute inset-0 transition-transform duration-[1400ms] ease-[cubic-bezier(.22,1,.36,1)]" style={{ transformOrigin: `${ox}% ${oy}%`, transform: `scale(${sc})` }}>
        {layer(false)}{layer(true)}
      </div>
    </div>
  );
}

export function CityLayer(props: CityStageProps) {
  if (!RealCity) return <Placeholder shot={props.shot} night={props.night} />;
  return (
    <Suspense fallback={<Placeholder shot={props.shot} night={props.night} />}>
      <RealCity {...props} />
    </Suspense>
  );
}
