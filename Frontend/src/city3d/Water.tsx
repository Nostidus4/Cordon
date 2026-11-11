import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { ShaderMaterial, Vector2, Vector4 } from "three";
import { env } from "./env";
import { ISLAND } from "./layout";

const MAX_LAMPS = 24;

const vert = /* glsl */ `
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const frag = /* glsl */ `
uniform float uTime;
uniform float uNight;
uniform vec2 uLamps[${MAX_LAMPS}];
uniform int uLampCount;
uniform vec4 uIsland; // minX, maxX, minZ, maxZ
varying vec3 vW;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
}
// signed distance (>0 outside) to the rounded island rectangle
float sdIsland(vec2 p){
  vec2 c = vec2((uIsland.x+uIsland.y)*0.5, (uIsland.z+uIsland.w)*0.5);
  vec2 h = vec2((uIsland.y-uIsland.x)*0.5, (uIsland.w-uIsland.z)*0.5) - 9.0;
  vec2 q = abs(p - c) - h;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 9.0;
}

void main() {
  vec2 p = vW.xz;
  float d = sdIsland(p);
  float t = uTime;

  // gentle layered waves -> pseudo height + slope for shading
  float w1 = sin(p.x*0.18 + t*0.6) + sin(p.y*0.23 - t*0.5);
  float w2 = noise(p*0.12 + vec2(t*0.05, -t*0.04)) + noise(p*0.31 - vec2(t*0.07, t*0.03))*0.5;
  float h = w1*0.25 + w2*0.5;

  // depth gradient: turquoise shallows hugging the island -> deep blue
  float shallow = smoothstep(26.0, 0.0, d);
  vec3 deepD = vec3(0.05, 0.14, 0.45), shD = vec3(0.14, 0.52, 0.78);
  vec3 deepN = vec3(0.010, 0.024, 0.11), shN = vec3(0.04, 0.17, 0.38);
  vec3 col = mix(mix(deepD, deepN, uNight), mix(shD, shN, uNight), shallow);
  col += (h - 0.55) * mix(0.10, 0.05, uNight);

  // caustic-like soft bands in the shallows
  float caust = pow(abs(sin(p.x*0.5 + w2*3.0 + t*0.8) * sin(p.y*0.43 + w2*3.0 - t*0.7)), 3.0);
  col += vec3(0.45, 0.85, 1.0) * caust * shallow * mix(0.14, 0.06, uNight);

  // foam ring where water meets the island, with animated ripples
  float ripple = 0.5 + 0.5*sin(d*1.6 - t*1.3 + w2*4.0);
  float foamBand = smoothstep(3.6 + ripple*1.2, 0.2, d) * smoothstep(-0.6, 0.4, d);
  float foamNoise = smoothstep(0.35, 0.8, noise(p*0.9 + t*0.15));
  float outer = smoothstep(7.0, 5.2, d) * smoothstep(3.2, 4.4, d + ripple*1.0) * foamNoise * 0.55;
  float foam = clamp(foamBand * (0.55 + 0.6*foamNoise) + outer, 0.0, 1.0);
  col = mix(col, mix(vec3(0.95, 0.98, 1.0), vec3(0.55, 0.65, 0.95), uNight), foam * 0.9);

  // glints: soft sparkles by day, moonlit glints by night
  float g = sin(p.x*0.55 + t*0.9 + sin(p.y*0.21 + t*0.4)*2.0) * sin(p.y*0.47 - t*0.7 + sin(p.x*0.17)*2.0);
  float sp = smoothstep(0.88, 1.0, g) * smoothstep(0.55, 0.9, noise(p*1.7 + t*0.4));
  col += mix(vec3(1.0), vec3(0.6, 0.7, 1.0), uNight) * sp * mix(0.55, 0.3, uNight);

  // night: neon / lamp reflections as wavy vertical streaks near the shore
  vec2 down = normalize(vec2(-1.0, 1.0)); // toward the camera on the ground plane
  vec2 side = vec2(-down.y, down.x);
  vec3 refl = vec3(0.0);
  for (int i = 0; i < ${MAX_LAMPS}; i++) {
    if (i >= uLampCount) break;
    vec2 r = p - uLamps[i];
    float along = dot(r, down);
    float across = dot(r, side) + sin(along*0.9 + t*1.8 + float(i))*0.35;
    float streak = exp(-across*across*1.6) * smoothstep(-1.0, 3.0, along) * exp(-max(along, 0.0)*0.16);
    refl += streak * (0.5 + 0.5*sin(along*1.7 - t*2.4 + float(i)*1.3));
  }
  col += vec3(1.0, 0.72, 0.36) * refl * 0.65 * uNight * smoothstep(60.0, 2.0, d);
  // building / neon glow spilling on the water
  col += vec3(0.25, 0.45, 1.0) * smoothstep(14.0, 0.0, d) * 0.10 * uNight * (0.7 + 0.3*sin(t*0.8 + p.x*0.2));

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

let shared: ShaderMaterial | null = null;
/** One shared animated water material (used by the procedural plane and the city_water mesh of the base glb). */
export function waterMaterial() {
  if (!shared) {
    shared = new ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        uTime: { value: 0 },
        uNight: { value: 1 },
        uLamps: { value: Array.from({ length: MAX_LAMPS }, () => new Vector2()) },
        uLampCount: { value: 0 },
        uIsland: { value: new Vector4(ISLAND.minX, ISLAND.maxX, ISLAND.minZ, ISLAND.maxZ) },
      },
    });
  }
  return shared;
}

export function setWaterLamps(spots: [number, number][]) {
  const u = waterMaterial().uniforms;
  // prefer lamps closest to the shore (those are the ones whose light reaches the water)
  const edge = (s: [number, number]) => Math.min(Math.abs(s[0] - ISLAND.minX), Math.abs(s[0] - ISLAND.maxX), Math.abs(s[1] - ISLAND.minZ), Math.abs(s[1] - ISLAND.maxZ));
  const pick = [...spots].sort((a, b) => edge(a) - edge(b)).slice(0, MAX_LAMPS);
  pick.forEach(([x, z], i) => u.uLamps.value[i].set(x, z));
  u.uLampCount.value = pick.length;
}

/** Big water plane under everything (horizon skirt); drives the shared material's time / night uniforms. */
export default function Water({ y = -2.2 }: { y?: number }) {
  const mat = useMemo(() => waterMaterial(), []);
  useFrame(({ clock }) => {
    mat.uniforms.uTime.value = clock.elapsedTime;
    mat.uniforms.uNight.value = env.night;
  });
  return (
    <mesh position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => {}}>
      <planeGeometry args={[1200, 1200]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
}
