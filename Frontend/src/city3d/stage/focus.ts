import { stageHooks } from "../cityStore";

/** Node currently hovered / picked in the canvas (module state, read by label relevance logic via subscribe). */
export const focus = { hover: null as string | null, pick: null as string | null };
const subs = new Set<() => void>();
export const subscribeFocus = (f: () => void) => (subs.add(f), () => void subs.delete(f));
const emit = () => subs.forEach((f) => f());

export function hoverNode(id: string | null) {
  focus.hover = id;
  stageHooks.onHover?.(id ? { type: "node", id } : null);
  emit();
}
export function pickNode(id: string) {
  focus.pick = id;
  stageHooks.onPick?.({ type: "node", id });
  emit();
}
