import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useFrame, useThree } from "@react-three/fiber";
import { PerspectiveCamera, Vector3, type Group } from "three";

const v1 = new Vector3();
const v2 = new Vector3();
const v3 = new Vector3();

/**
 * Replacement for drei `<Html>` (non-transform mode only) that unmounts safely.
 * drei unmounts its nested React root synchronously inside a layout-effect cleanup (React warns "synchronously unmount a root
 * while React was already rendering", and StrictMode's simulated unmount hits it on every mount) and calls
 * `target.removeChild(el)` unguarded (throws NotFoundError when the Canvas container is already gone).
 * Here the root is unmounted in a microtask and the node is removed with `el.remove()`; a fresh element is made per effect run
 * so a StrictMode remount never reuses a container whose root is still pending unmount.
 */
export function ScreenHtml({ position, center, zIndexRange, style, children }: {
  position?: [number, number, number];
  center?: boolean;
  zIndexRange: [number, number];
  style?: CSSProperties;
  children: ReactNode;
}) {
  const { camera, size, gl, events } = useThree();
  const group = useRef<Group>(null);
  const el = useRef<HTMLDivElement | null>(null);
  const root = useRef<Root | null>(null);
  const last = useRef<[number, number]>([NaN, NaN]);
  const visible = useRef(true);
  const target = events.connected || gl.domElement.parentNode;

  useLayoutEffect(() => {
    if (!target) return;
    const node = document.createElement("div");
    node.style.cssText = "position:absolute;top:0;left:0;transform-origin:0 0;";
    target.appendChild(node);
    const r = createRoot(node);
    el.current = node;
    root.current = r;
    last.current = [NaN, NaN];
    return () => {
      el.current = null;
      root.current = null;
      node.remove();
      queueMicrotask(() => r.unmount());
    };
  }, [target]);

  useLayoutEffect(() => {
    root.current?.render(
      <div style={{ position: "absolute", transform: center ? "translate3d(-50%,-50%,0)" : "none", ...style }}>{children}</div>,
    );
  });

  useFrame(() => {
    const g = group.current;
    const node = el.current;
    if (!g || !node) return;
    camera.updateMatrixWorld();
    g.updateWorldMatrix(true, false);
    const p = v1.setFromMatrixPosition(g.matrixWorld);
    const camPos = v2.setFromMatrixPosition(camera.matrixWorld);
    const behind = p.clone().sub(camPos).angleTo(camera.getWorldDirection(v3)) > Math.PI / 2;
    p.project(camera);
    const x = (p.x * size.width) / 2 + size.width / 2;
    const y = -(p.y * size.height) / 2 + size.height / 2;
    if (behind === visible.current) {
      visible.current = !behind;
      node.style.display = behind ? "none" : "block";
    } else if (Math.abs(last.current[0] - x) <= 0.001 && Math.abs(last.current[1] - y) <= 0.001) return;
    if (camera instanceof PerspectiveCamera) {
      const dist = v1.setFromMatrixPosition(g.matrixWorld).distanceTo(camPos);
      const a = (zIndexRange[1] - zIndexRange[0]) / (camera.far - camera.near);
      node.style.zIndex = `${Math.round(a * dist + zIndexRange[1] - a * camera.far)}`;
    }
    node.style.transform = `translate3d(${x}px,${y}px,0)`;
    last.current = [x, y];
  });

  return <group ref={group} position={position} />;
}
