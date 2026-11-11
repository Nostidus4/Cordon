import { CanvasTexture, SRGBColorSpace } from "three";

export type PinKind = "HUMAN" | "AGENT" | "SERVICE" | "MEMBER";
const cache = new Map<string, CanvasTexture>();

/** White toy token (tinted per frame through material.color) with a dark person / robot / server glyph. */
export function pinTexture(kind: PinKind): CanvasTexture {
  const hit = cache.get(kind);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.beginPath();
  g.arc(64, 64, 60, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "rgba(10,14,60,0.35)";
  g.lineWidth = 6;
  g.beginPath();
  g.arc(64, 64, 54, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = "#10163a";
  g.strokeStyle = "#10163a";
  g.lineWidth = 7;
  g.lineCap = "round";
  g.lineJoin = "round";
  if (kind === "HUMAN" || kind === "MEMBER") {
    g.beginPath();
    g.arc(64, 48, 15, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(34, 96);
    g.quadraticCurveTo(64, 50, 94, 96);
    g.closePath();
    g.fill();
    if (kind === "MEMBER") {
      g.fillStyle = "#facc15";
      g.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
        const b = a + Math.PI / 5;
        g.lineTo(64 + Math.cos(a) * 11, 82 + Math.sin(a) * 11);
        g.lineTo(64 + Math.cos(b) * 5, 82 + Math.sin(b) * 5);
      }
      g.fill();
    }
  } else if (kind === "AGENT") {
    g.beginPath();
    g.roundRect(34, 46, 60, 46, 12);
    g.fill();
    g.beginPath();
    g.moveTo(64, 46);
    g.lineTo(64, 32);
    g.stroke();
    g.beginPath();
    g.arc(64, 30, 4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.arc(52, 68, 7, 0, Math.PI * 2);
    g.arc(76, 68, 7, 0, Math.PI * 2);
    g.fill();
  } else {
    for (let i = 0; i < 3; i++) {
      g.fillStyle = "#10163a";
      g.beginPath();
      g.roundRect(34, 34 + i * 20, 60, 16, 5);
      g.fill();
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.arc(46, 42 + i * 20, 3.5, 0, Math.PI * 2);
      g.fill();
    }
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  cache.set(kind, t);
  return t;
}
