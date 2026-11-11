// Layout matches the Blender kit: three (x, z) = (bx, -by); all facades face +Z (toward the viewer).
export const ISLAND = { minX: -66, maxX: 66, minZ: -52, maxZ: 64 };
export const GATE: [number, number] = [0, 56];
export const ASSEMBLY: [number, number] = [-54, 48];

// Blender (bx, by) -> three (x, z)
const BLENDER_XY: Record<string, [number, number]> = {
  B08: [0, 0],
  B01: [0, 36],
  B03: [-34, 24],
  B02: [34, 24],
  B05: [-44, -4],
  B06: [44, -4],
  B04: [-30, -32],
  B07: [30, -32],
};

export interface Placement {
  position: [number, number, number];
  rotationY: number;
}

export function getPlacement(code: string): Placement {
  const [bx, by] = BLENDER_XY[code] ?? [0, 0];
  return { position: [bx, 0, by === 0 ? 0 : -by], rotationY: 0 };
}

/** Street segments (three x,z) used for people and cars; also drawn by the procedural island. */
export interface Seg {
  a: [number, number];
  b: [number, number];
}
export const ROAD_W = 6;
export const ROADS: Seg[] = [
  { a: [0, -27], b: [0, 70] }, // main axis from B01 to the gate
  { a: [-21, -47], b: [-21, 52] },
  { a: [21, -47], b: [21, 52] },
  { a: [-62, -9.5], b: [62, -9.5] },
  { a: [-62, 17.5], b: [62, 17.5] },
];
export const PLAZA_RING = { inner: 10, outer: 15 };
