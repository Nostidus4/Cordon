// "Chơi lại" (top bar) and "Xem lại từ đầu" (end card) are the same reset: demo data back to scene 1's start, local story state cleared, back to the intro.
import { useDemoReset } from "../hooks/useDemoReset";
import { useUiStore } from "../store/uiStore";
import { forgetRequestNumbers } from "./requestMemory";
import { useStageStore } from "./stageStore";

export function useStageReset(go: (s: "intro") => void) {
  const reset = useDemoReset();
  const run = () => reset.mutate(undefined, {
    onSuccess: () => {
      useUiStore.getState().setSelectedPrincipals(["minh"]);
      useUiStore.getState().clearHighlight();
      useUiStore.getState().setMode("live");
      useUiStore.getState().setReplayRunId(null);
      forgetRequestNumbers();
      useStageStore.getState().clearReached();
      useStageStore.getState().setNightPref(null);
      go("intro");
    },
  });
  return { run, pending: reset.isPending };
}
