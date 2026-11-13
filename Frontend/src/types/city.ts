// GET /api/city/states + stream `city_updated` (3D city, /city). B01..B08 per Blender kit. Mirrors the backend CityStates.
import type { BuildingEvidence } from "./ops";

export type CityBuildingState = "normal" | "warning" | "incident" | "recovery";
export type CityBuildingId = "B01" | "B02" | "B03" | "B04" | "B05" | "B06" | "B07" | "B08";

export interface CityBuildingStatus {
  id: CityBuildingId;
  name: string;
  state: CityBuildingState;
  reasonVi: string;
  evidence: BuildingEvidence[];
}
export interface CityStates {
  buildings: CityBuildingStatus[];
  graphVersion: number;
  policyVersion: number;
  /** See `GraphSnapshot.policyLabel`. */
  policyLabel: number;
  /** unix seconds */
  updatedAt: number;
}
