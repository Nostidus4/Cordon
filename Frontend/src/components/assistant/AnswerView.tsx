// Splits an assistant answer so every `numbers[].value` occurrence becomes a bold segment (used by the stage assistant bubble).
import type { AssistantAnswer } from "../../types";

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

interface Seg { text: string; num?: AssistantAnswer["numbers"][number] }
/** Split the answer text so every `numbers[].value` occurrence becomes a bold segment. */
export function segmentAnswer(text: string, numbers: AssistantAnswer["numbers"]): Seg[] {
  const vals = [...new Set(numbers.map((n) => n.value).filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!vals.length) return [{ text }];
  const re = new RegExp(`(?<![\\d.,])(${vals.map(esc).join("|")})(?![\\d])`, "g");
  return text.split(re).filter((p) => p !== "").map((p) => {
    const num = numbers.find((n) => n.value === p);
    return num ? { text: p, num } : { text: p };
  });
}
