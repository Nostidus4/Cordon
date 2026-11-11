import { Suspense, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { AdaptiveDpr, ContactShadows, OrbitControls, OrthographicCamera, PerformanceMonitor } from "@react-three/drei";
import { Bloom, EffectComposer, SMAA, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { Color, NoToneMapping, type AmbientLight, type DirectionalLight, type Fog, type HemisphereLight } from "three";
import Building from "./Building";
import { BUILDINGS } from "./buildings";
import CameraRig, { ISO_DIR } from "./CameraRig";
import City from "./City";
import { env } from "./env";
import Declutter from "./Declutter";
import EnvDriver from "./EnvDriver";
import { useCityModels } from "./useCityModels";


const C = {
  hemiSkyD: new Color("#b9b4ff"), hemiSkyN: new Color("#4a4fc0"), hemiGrD: new Color("#4a4a9a"), hemiGrN: new Color("#1a1450"),
  keyD: new Color("#ffe2b8"), keyN: new Color("#8fa8ff"), fogD: new Color("#4a3f9a"), fogN: new Color("#0a0e30"),
};

/** Day/night driven lighting + fog (key light, hemisphere, ambient, rim). */
function EnvLights() {
  const hemi = useRef<HemisphereLight>(null);
  const amb = useRef<AmbientLight>(null);
  const key = useRef<DirectionalLight>(null);
  const rim = useRef<DirectionalLight>(null);
  const fog = useRef<Fog>(null);
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
function Post() {
  const bloom = useRef<{ intensity: number; luminanceMaterial: { threshold: number } } | null>(null);
  useFrame(() => {
    const k = env.night;
    if (bloom.current) {
      bloom.current.intensity = 0.45 + 0.85 * k;
      bloom.current.luminanceMaterial.threshold = 1.0 - 0.3 * k;
    }
  });
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <Bloom ref={bloom as never} mipmapBlur intensity={0.9} luminanceThreshold={0.8} luminanceSmoothing={0.2} radius={0.7} />
      <Vignette eskil={false} offset={0.3} darkness={0.6} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <SMAA />
    </EffectComposer>
  );
}

export default function CityCanvas({ children }: { children?: React.ReactNode } = {}) {
  const models = useCityModels();
  const [dpr, setDpr] = useState(1.5);
  return (
    <Canvas
      shadows
      dpr={dpr}
      gl={{ antialias: false, powerPreference: "high-performance", toneMapping: NoToneMapping }}
      aria-label="Thành phố 3D GuardianAI"
    >
      <OrthographicCamera makeDefault position={ISO_DIR.clone().multiplyScalar(300).toArray()} zoom={5} near={-200} far={900} />
      <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(1.5)} flipflops={3} />
      <AdaptiveDpr />
      <EnvDriver />
      <EnvLights />
      <Declutter />
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
      {children}
      <ContactShadows position={[0, 0.35, 6]} scale={150} blur={2.6} opacity={0.35} far={20} frames={1} />
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
    </Canvas>
  );
}
