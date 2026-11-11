// Call to action after the spread: turn the finding into a fix proposal (Requests screen drafts it).
import { motion } from "framer-motion";
import { Wand2 } from "lucide-react";
import { Button } from "../../components/ui";
import { useDraftHandoff } from "../../components/assistant/useDraftHandoff";
import type { Finding } from "../../types";

export function CreateProposalButton({ finding, className }: { finding: Finding; className?: string }) {
  const handoff = useDraftHandoff("simulate");
  return (
    <motion.div data-tour="sim-create-proposal" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 300, damping: 26 }}
      className={`flex items-center justify-between gap-3 border-t border-bad/25 pt-2.5 ${className ?? ""}`}>
      <p className="text-[12px] leading-tight text-muted"><b className="text-text">Có cách chặn lỗ hổng này.</b></p>
      <Button variant="primary" size="sm" icon={<Wand2 className="size-3.5" />} onClick={() => handoff.go({ findingId: finding.id })}>Tạo đề xuất sửa</Button>
    </motion.div>
  );
}
