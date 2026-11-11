// Thin adapter around the shared AssistantPanel for request #12/#13 (scene 5, spec §9.5).
import { AssistantPanel } from "../../components/assistant/AssistantPanel";
import { useUiStore } from "../../store/uiStore";
import type { ProposedChange } from "../../types";

export function RequestAssistant({ proposalId, onSuggestion }: { proposalId: number; onSuggestion: (change: ProposedChange, title?: string) => void }) {
  const setHighlight = useUiStore((s) => s.setHighlight);
  return (
    <div data-tour="req-assistant">
      <AssistantPanel
        screen="request"
        questionIds={["give_agent_huy"]}
        context={{ principalIds: ["huy"], proposalId }}
        onHighlight={setHighlight}
        onSuggestion={(s) => onSuggestion(s.change as ProposedChange, s.title)}
      />
    </div>
  );
}
