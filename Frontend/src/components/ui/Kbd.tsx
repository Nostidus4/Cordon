import type { ReactNode } from "react";
export const Kbd = ({ children }: { children: ReactNode }) => (
  <kbd className="inline-flex min-w-5 items-center justify-center rounded-md border border-line-strong bg-white/6 px-1.5 py-0.5 font-sans text-[11px] font-medium text-muted shadow-[0_1px_0_rgb(255_255_255/0.08)]">{children}</kbd>
);
