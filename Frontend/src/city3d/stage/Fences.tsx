import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, DoubleSide, ShaderMaterial, Vector2, type Group, type Mesh } from "three";
import { hoverNode, pickNode } from "./focus";
import { env } from "../env";
import { useRT } from "./context";
import { ToyLabel } from "./ToyLabel";
import { KIND_COLOR, TONE_COLOR } from "./world";

const vert = /* glsl */ `
varying vec2 vP;
uniform vec2 uSize;
void main() { vP = (uv - 0.5) * uSize; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const frag = /* glsl */ `
varying vec2 vP;
uniform vec2 uHalf; uniform vec3 uColor; uniform float uAlpha; uniform float uTime; uniform float uLock; uniform float uGlow;
float sdBox(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main() {
  float sd = sdBox(vP, uHalf, 4.0);
  if (sd > 1.2) discard;
  float fill = smoothstep(0.0, -7.0, sd) * (0.30 + 0.2 * uGlow);
  float rim = smoothstep(1.0, 0.0, abs(sd + 0.5) - 0.35);
  float dash = step(0.45, fract((vP.x + vP.y) * 0.22 - uTime * 0.25));
  float border = rim * mix(0.35 + 0.65 * dash, 1.0, uGlow);
  vec3 col = uColor * 2.0;
  float a = fill + border * 1.0;
  // locked: black/yellow cordon tape band along the border
  float band = smoothstep(1.7, 1.1, abs(sd + 0.9));
  float stripe = step(0.5, fract((vP.x - vP.y) * 0.45));
  vec3 tape = mix(vec3(0.06, 0.06, 0.08), vec3(1.0, 0.8, 0.1), stripe);
  col = mix(col, tape, band * uLock);
  a = mix(a, max(a, band * 0.95), uLock);
  gl_FragColor = vec4(col, a * uAlpha);
}`;

export function Fence({ id, showLabel }: { id: string; showLabel: boolean }) {
  const rt = useRT();
  const mesh = useRef<Mesh>(null);
  const label = useRef<Group>(null);
  const size = useMemo(() => new Vector2(10, 10), []);
  const half = useMemo(() => new Vector2(5, 5), []);
  const color = useMemo(() => new Color(), []);
  const tmp = useMemo(() => new Color(), []);
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        uniforms: { uSize: { value: size }, uHalf: { value: half }, uColor: { value: color }, uAlpha: { value: 0 }, uTime: { value: 0 }, uLock: { value: 0 }, uGlow: { value: 0 } },
      }),
    [size, half, color],
  );

  useFrame(({ clock }) => {
    const f = rt.fences.get(id);
    if (!f || !mesh.current) return;
    const nid = `p:${id}`;
    const a = rt.amt(nid);
    mesh.current.visible = f.alpha > 0.015;
    mesh.current.position.set(f.cx, 1.0, f.cz);
    const w = (f.hx + 3) * 2;
    const d = (f.hz + 3) * 2;
    mesh.current.scale.set(w, d, 1);
    size.set(w, d);
    half.set(f.hx, f.hz);
    const base = f.cap ? "#ffc23d" : KIND_COLOR[f.kind] ?? "#a78bfa";
    color.set(base).lerp(tmp.set("#ff3b4a"), a.red);
    if (a.hl > 0.01) color.lerp(tmp.set(TONE_COLOR[a.tone]), a.hl * 0.8);
    const pulse = a.hl * (0.6 + 0.4 * Math.sin(clock.elapsedTime * 5));
    mat.uniforms.uAlpha.value = f.alpha * (env.night > 0.5 ? 1 : 0.9);
    mat.uniforms.uTime.value = clock.elapsedTime;
    mat.uniforms.uLock.value = f.lock;
    mat.uniforms.uGlow.value = Math.max(pulse, a.red * 0.7);
    if (label.current) {
      label.current.position.set(f.cx, 1.5, f.cz - f.hz - 1.5);
      label.current.visible = f.alpha > 0.3;
    }
  });

  const f0 = rt.fences.get(id);
  const text = f0 ? `Khu ${f0.label.replace(/^(Anh|Chị) /, (m) => m.toLowerCase())} · ${f0.cap ? `chung ${f0.cap}/ngày` : "không có cổng chung"}` : "";
  const show = showLabel && !!f0;

  return (
    <>
      <mesh
        ref={mesh}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(e) => {
          e.stopPropagation();
          pickNode(`p:${id}`);
        }}
        onPointerOver={() => {
          hoverNode(`p:${id}`);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          hoverNode(null);
          document.body.style.cursor = "";
        }}
      >
        <planeGeometry args={[1, 1]} />
        <primitive object={mat} attach="material" />
      </mesh>
      <group ref={label}>
        {show && (
          <ToyLabel id={`fence:${id}`} position={[0, 0, 0]} dot={f0?.cap ? "#ffb02e" : KIND_COLOR[f0?.kind ?? "HUMAN"] ?? "#a78bfa"}>
            {text}
          </ToyLabel>
        )}
      </group>
    </>
  );
}
