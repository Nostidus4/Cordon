import { createContext, useContext } from "react";
import type { StageRuntime } from "./runtime";

export const RTContext = createContext<StageRuntime | null>(null);
export const useRT = (): StageRuntime => {
  const r = useContext(RTContext);
  if (!r) throw new Error("StageRuntime missing");
  return r;
};
