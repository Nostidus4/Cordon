import { Suspense, useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, OrthographicCamera } from "@react-three/drei";
import { Bloom, EffectComposer, SMAA, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { Color, NoToneMapping, type AmbientLight, type DirectionalLight, type Fog, type HemisphereLight } from "three";
import Assembly from "./AssemblyFx";
import { useAssembly } from "./assembly";
import Building from "./Building";
import { BUILDINGS } from "./buildings";
import CameraRig, { ISO_DIR } from "./CameraRig";
import City from "./City";
import { env } from "./env";
import Declutter from "./Declutter";
import EnvDriver from "./EnvDriver";
import FrameGovernor from "./FrameGovernor";
import PerfStats, { PERF } from "./PerfStats";
import { effectiveDpr, LEVELS, useQuality } from "./quality";
import { useCityModels } from "./useCityModels";

const C = {
  hemiSkyD: new Color("#b9b4ff"), hemiSkyN: new Color("#4a4fc0"), hemiGrD: new Color("#4a4a9a"), hemiGrN: new Color("#1a1450"),
  keyD: new Color("#ffe2b8"), keyN: new Color("#8fa8ff"), fogD: new Color("#4a3f9a"), fogN: new Color("#0a0e30"),
};

/** Day/night driven lighting + fog (key light, hemisphere, ambient, rim). One static-ish shadow map from the key light. */
function EnvLights() {
  const hemi = useRef<HemisphereLight>(null);
  const amb = useRef<AmbientLight>(null);
  const key = useRef<DirectionalLight>(null);
  const rim = useRef<DirectionalLight>(null);
  const fog = useRef<Fog>(null);
  const tier = useQuality((s) => LEVELS[s.level].tier);
  const size = tier === "low" ? 1024 : 2048;
  useEffect(() => {
    // new resolution -> drop the old shadow map so three allocates the new one
    const sh = key.current?.shadow;
    if (!sh) return;
    sh.mapSize.set(size, size);
    sh.map?.dispose();
    sh.map = null;
  }, [size]);
  useFrame(() => {
    const k = env.night;
    if (hemi.current) {
      hemi.current.intensity = 1.0 - 0.45 * k;
      hemi.current.color.copy(C.hemiSkyD).lerp(C.hemiSkyN, k);
      hemi.current.groundColor.copy(C.hemiGrD).lerp(C.hemiGrN, k);
    }
    if (amb.current) amb.current.intensity = 0.35 - 0.12 * k;
    if (key.current) {
      key.current.intensity = 2.2 - 1.55 * k;
      key.current.color.copy(C.keyD).lerp(C.keyN, k);
    }
    if (rim.current) rim.current.intensity = 0.8 + 0.5 * k;
    if (fog.current) fog.current.color.copy(C.fogD).lerp(C.fogN, k);
  });
  return (
    <>
      <fog ref={fog} attach="fog" args={["#0a0e30", 420, 800]} />
      <hemisphereLight ref={hemi} args={["#b9b4ff", "#4a4a9a", 1.0]} />
      <ambientLight ref={amb} intensity={0.35} color="#8f8be8" />
      <directionalLight
        ref={key}
        position={[-60, 120, 90]}
        intensity={2.2}
        color="#ffe2b8"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-95}
        shadow-camera-right={95}
        shadow-camera-top={95}
        shadow-camera-bottom={-95}
        shadow-camera-near={10}
        shadow-camera-far={400}
        shadow-bias={-0.0004}
        shadow-radius={5}
      />
      <directionalLight ref={rim} position={[80, 40, -60]} intensity={0.8} color="#7aa7ff" />
    </>
  );
}

/** Bloom at half resolution (mipmap blur) + ACES tone mapping; SMAA only when the pixel ratio is below 1.5. Low tier: no post at all. */
function Post() {
  const bloom = useRef<{ intensity: number; luminanceMaterial: { threshold: number } } | null>(null);
  const level = useQuality((s) => s.level);
  const tier = LEVELS[level].tier;
  const smaa = effectiveDpr(level) < 1.5;
  useFrame(() => {
    const k = env.night;
    if (bloom.current) {
      bloom.current.intensity = 0.45 + 0.85 * k;
      bloom.current.luminanceMaterial.threshold = 1.0 - 0.3 * k;
    }
  });
  if (tier === "low") return null;
  return (
    <EffectComposer key={smaa ? "aa" : "noaa"} multisampling={0} enableNormalPass={false} resolutionScale={1}>
      <Bloom ref={bloom as never} mipmapBlur resolutionScale={0.5} intensity={0.9} luminanceThreshold={0.8} luminanceSmoothing={0.2} radius={0.7} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      {smaa ? <SMAA /> : <></>}
    </EffectComposer>
  );
}

/** Vignette as a CSS overlay inside the canvas wrapper (below the HTML cards): no full-screen shader pass. */
function CssVignette() {
  const dom = useThree((s) => s.gl.domElement);
  useEffect(() => {
    const parent = dom.parentElement;
    if (!parent) return;
    const el = document.createElement("div");
    el.setAttribute("aria-hidden", "true");
    el.style.cssText =
      "position:absolute;inset:0;pointer-events:none;z-index:1;background:radial-gradient(ellipse farthest-corner at 50% 50%,rgba(0,0,0,0) 36%,rgba(0,0,0,0.3) 72%,rgba(0,0,0,0.62) 100%)";
    parent.appendChild(el);
    return () => el.remove();
  }, [dom]);
  return null;
}

export default function CityCanvas({ children }: { children?: React.ReactNode } = {}) {
  const models = useCityModels();
  const level = useQuality((s) => s.level);
  const assembled = useAssembly((s) => s.assembled);
  const expected = models.loaded
    ? [...(models.base ? ["base"] : []), ...(models.surroundings ? ["surr"] : []), ...BUILDINGS.filter((b) => models.buildings.has(b.code)).map((b) => b.code), ...BUILDINGS.filter((b) => !models.buildings.has(b.code)).map((b) => b.code)]
    : [];
  return (
    <Canvas
      frameloop="demand"
      shadows="percentage"
      dpr={effectiveDpr(level)}
      gl={{ antialias: false, powerPreference: "high-performance", toneMapping: NoToneMapping }}
      aria-label="Thành phố 3D Cordon"
    >
      <OrthographicCamera makeDefault position={ISO_DIR.clone().multiplyScalar(300).toArray()} zoom={5} near={-200} far={900} />
      <FrameGovernor />
      <CssVignette />
      <EnvDriver />
      <EnvLights />
      <Declutter />
      {models.loaded && <Assembly expected={expected} />}
      <Suspense fallback={null}>
        {models.loaded && (
          <>
            <City baseFile={models.base} surroundings={models.surroundings} />
            {BUILDINGS.map((b) => (
              <Building key={b.code} def={b} hasGlb={models.buildings.has(b.code)} />
            ))}
          </>
        )}
      </Suspense>
      {assembled && children}
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.1}
        minPolarAngle={0.5236}
        maxPolarAngle={1.0}
        enablePan
        screenSpacePanning={false}
      />
      <CameraRig />
      <Post />
      {PERF && <PerfStats />}
    </Canvas>
  );
}
