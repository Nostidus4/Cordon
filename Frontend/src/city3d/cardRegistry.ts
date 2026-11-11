import type { Object3D } from "three";

export interface CardEntry {
  anchor: Object3D; // world anchor of the pin
  el: HTMLElement; // card wrapper (width/height)
  line: HTMLElement; // leader line (height is extended by the declutter pass)
  nudge: number; // current smoothed vertical nudge in px
}
export const cards = new Map<string, CardEntry>();
