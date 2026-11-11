// Remembers the numbers of requests #12/#13 while Minh's district is still open (before Lan's lock in scene 4 zeroes the live report).
import { useEffect } from "react";
import { useGraph } from "../hooks/useGraph";
import { useProposals } from "../hooks/useProposals";
import { useStream } from "../hooks/useStream";
import { requestNumbers, type RequestNumbers } from "./logic";

let remembered: RequestNumbers | null = null;
export const getRemembered = () => remembered;
export const forgetRequestNumbers = () => { remembered = null; };

/** Mount once (StagePage): snapshot whenever the live numbers are real. */
export function useRememberRequestNumbers() {
  const { data: graph } = useGraph();
  const { data: proposals } = useProposals();
  useStream((m) => { if (m.type === "reset") forgetRequestNumbers(); }, ["reset"]);
  useEffect(() => {
    const locked = !!graph?.districts.find((d) => d.principalId === "minh")?.locked;
    if (locked || !proposals) return;
    const n = requestNumbers(proposals.find((p) => p.id === 12), proposals.find((p) => p.id === 13), false, null);
    if (n) remembered = n;
  }, [graph, proposals]);
}
