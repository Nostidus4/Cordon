import { useEffect } from "react";
import { BRAND } from "../config/brand";

/** Per-route document title: "<part> · Cordon" (just "Cordon" with no parts). */
export const makeTitle = (...parts: Array<string | undefined | null | false>): string => [...parts.filter(Boolean), BRAND.name].join(" · ");

export function useTitle(...parts: Array<string | undefined | null | false>): void {
  const title = makeTitle(...parts);
  useEffect(() => { document.title = title; }, [title]);
}
