// Contract between the scene stage (src/stage/**, owns UI + flow) and the 3D city
// (src/city3d/**, owns everything rendered in the canvas). The stage never touches
// three.js; the city never fetches data or renders 2D chrome. Change this file only
// through the lead.
import type { GraphSnapshot } from "../types/graph";
import type { Attempt } from "../types/attempt";

export type BuildingCode = "B01" | "B02" | "B03" | "B04" | "B05" | "B06" | "B07" | "B08";

// The five scenes of spec §4.4 plus an intro/overview.
export type SceneId = "intro" | "look" | "try" | "fix" | "incident" | "request";

// Named camera shots the city knows how to frame (smooth glide between them).
export type CameraShot =
  | "overview"        // whole island, REF_08 framing
  | "district-minh"   // Minh's keys + fence
  | "council"         // B01 with member pins
  | "vault"           // B03 + funds flow from the main treasury
  | "gate"            // shared-cap gate of Minh's district
  | "shore"           // recipients on the outer shore + islet + EvilDEX boat
  | { building: BuildingCode };

export type Tone = "amber" | "red" | "teal" | "grey";

// What the user clicked in the canvas (ids are GraphSnapshot node ids: "p:minh", "k:key_minh",
// "r:vendor_cloud", "pr:mock_dex", "m:lan", "vault", "council", "treasury"; buildings by code).
export type PickTarget =
  | { type: "node"; id: string }
  | { type: "building"; code: BuildingCode };

export interface CityStageProps {
  scene: SceneId;
  shot: CameraShot;
  graph?: GraphSnapshot;            // drives pins, fences, arcs; re-layout animates on change (v1 → v2 merge)
  showDomain: boolean;              // false = pure city (intro); true = pins/arcs/fences visible

  // Simulate (scene 2): red spreads from the compromised principals along edges.
  // The stage advances `step`; the city colours nodes/edges in `reached` up to that step.
  spread?: {
    from: string[];                                   // principal node ids, e.g. ["p:minh"]
    order: { nodeIds: string[]; edgeIds: string[] }[]; // step k reveals order[k]
    step: number;                                     // -1 = nothing yet
  };

  // Assistant/finding highlight (outline + soft pulse).
  highlight?: { nodeIds: string[]; edgeIds: string[]; tone: Tone };

  // Incident (scene 4): each attempt becomes a packet from its key pin to its target
  // (recipient house / DEX). ok → arrives with teal burst; reverted → bounces off the
  // district fence/gate with a red flash; blocked_at_protocol → fizzles at the pin.
  attempts?: Attempt[];
  sharedCap?: { spent: string; cap: string } | null; // gate gauge, base-unit strings from events only

  lockedDistricts?: string[];       // principal ids; cordon tape + grey pins
  buildingStates?: Partial<Record<BuildingCode, "normal" | "warning" | "incident" | "recovery">>;
  night?: boolean;

  onPick?: (target: PickTarget) => void;
  onHover?: (target: PickTarget | null) => void;
}

// Exported by src/city3d/CityStage.tsx:
//   export default function CityStage(props: CityStageProps): JSX.Element
// Full-bleed canvas only (no HTML chrome except in-world labels/pins).
