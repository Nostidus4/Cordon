// GET /api/city/states + stream `city_updated` (3D city, /city). B01..B08 per Blender kit.
export type CityBuildingState = "normal" | "warning" | "incident" | "recovery";
export type CityBuildingId = "B01" | "B02" | "B03" | "B04" | "B05" | "B06" | "B07" | "B08";

export interface CityBuildingStatus {
  state: CityBuildingState;
  reasonVi: string;
  evidence?: { kind: "attempt" | "proposal" | "finding" | "event" | "agent_run"; ref: string; txHash?: string | null; simulated?: boolean };
}
export type CityStates = Record<CityBuildingId, CityBuildingStatus>;
