import { FOOTER_TEXT, FOOTER_TEXT_MOCK } from "../../config/brand";
import { env } from "../../config/env";
/** Fixed footer text (spec §10.1). */
export function Footer() {
  return (
    <footer className="fixed inset-x-0 bottom-0 z-40 flex h-9 items-center justify-center border-t border-line bg-[#060818]/85 px-4 text-xs text-muted backdrop-blur-md">
      <span aria-hidden className="mr-2 text-warn">▲</span>{env.apiMode === "live" ? FOOTER_TEXT : FOOTER_TEXT_MOCK}
    </footer>
  );
}
