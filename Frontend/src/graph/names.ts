// Small naming helpers shared by Map and Simulate (Vietnamese plain-language labels).
import type { KeyKind } from "../types";

/** "Anh Minh" -> "anh Minh" (mid-sentence form). */
export const casual = (label: string) => (label ? label.charAt(0).toLowerCase() + label.slice(1) : label);
export const KIND_LABEL: Record<KeyKind, string> = { HUMAN: "Người", AGENT: "Trợ lý AI", SERVICE: "Phần mềm" };
export const RELATION_LABEL: Record<"CONTROLS" | "ADMINS", string> = { CONTROLS: "Điều khiển", ADMINS: "Quản trị" };
