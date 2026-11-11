// Fixed world mapping of the domain graph onto the city (three.js: x east, z toward the viewer/south, y up).
import type { CameraShot } from "../../stage/contract";

export type V2 = [number, number];

export const KEY_HOME: Record<string, V2> = {
  key_minh: [18, 9], // near the plaza (B08)
  key_agent_data: [38, 17], // near B06
  key_agent_intl_pay: [30, -12], // near B02
  key_agent_rebalance: [-38, 43], // near B04
  key_svc_payment: [-20, 45], // near B04
  key_huy_1: [-52, 15], // near B05
  key_huy_2: [-47, 19],
  key_lan: [30, 45], // near B07
};
/** Where a district's keys gather when it holds several (merged district / huy's two cards). */
export const CLUSTER: Record<string, V2> = { minh: [26, 6], huy: [-48, 17] };
export const DEFAULT_CLUSTER: V2 = [0, 20];

export const MEMBER_POS: Record<string, V2> = { "m:trang": [-9, -22.5], "m:lan": [0, -21], "m:huy": [9, -22.5] };

export const TREASURY: V2 = [0, 106];
export const FUNDS_PATH: V2[] = [[0, 100], [0, 62], [0, 17.5], [-21, 17.5], [-21, -14], [-33, -14]];

export const HOUSE_POS: Record<string, V2> = {
  vendor_data_api: [92, -22],
  vendor_cloud: [92, -4],
  vendor_intl_design: [92, 14],
  stranger_wallet: [110, 48], // on its own islet
};
export const ISLET: V2 = [110, 48];
export const BARGE: V2 = [62, 94]; // EvilDEX
export const MOCKDEX: V2 = [44, 7]; // front of B06
export const BUILDING_XZ: Record<string, V2> = {
  B01: [0, -36], B02: [34, -24], B03: [-34, -24], B04: [-30, 32], B05: [-44, 4], B06: [44, 4], B07: [30, 32], B08: [0, 0],
};

export const KIND_COLOR: Record<string, string> = { HUMAN: "#a78bfa", AGENT: "#22d3ee", SERVICE: "#fb923c", MEMBER: "#facc15" };
export const TONE_COLOR = { amber: "#ffb300", red: "#ff2d3d", teal: "#2dd4bf", grey: "#9aa4b8" } as const;

export function houseSpot(id: string, fallbackIndex: number): V2 {
  return HOUSE_POS[id] ?? [92, 32 + fallbackIndex * 18];
}

export interface ShotDef {
  target: [number, number, number];
  zoom: number; // multiplier of the fit zoom
}
export function shotDef(shot: CameraShot): ShotDef {
  if (typeof shot === "object") {
    const [x, z] = BUILDING_XZ[shot.building];
    return { target: [x + 5, 5, z + 4], zoom: 1.7 };
  }
  switch (shot) {
    case "district-minh": return { target: [26, 2, 5], zoom: 1.5 };
    case "council": return { target: [0, 6, -30], zoom: 1.8 };
    case "vault": return { target: [-12, 0, 42], zoom: 1.2 };
    case "gate": return { target: [26, 3, 10], zoom: 2.2 };
    case "shore": return { target: [86, 0, 34], zoom: 1.7 };
    default: return { target: [8, 0, -2], zoom: 1 };
  }
}
