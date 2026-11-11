import { useAssistantAsk } from "./useActions";
import { useUiStore } from "../store/uiStore";
import type { AskRequest, AssistantAnswer } from "../types";

/** Ask a fixed question; pushes `highlight` into the shared store (gold outline on canvas). */
export function useAssistant() {
  const m = useAssistantAsk();
  const setHighlight = useUiStore((s) => s.setHighlight);
  return {
    ...m,
    ask: (req: AskRequest): Promise<AssistantAnswer> => m.mutateAsync(req).then((a) => { setHighlight(a.highlight); return a; }),
  };
}
