// API mode/base URL/explorer URL from import.meta.env.
export type ApiMode = "mock" | "live";
export const API_MODE_KEY = "guardian.apiMode";

const isMode = (v: unknown): v is ApiMode => v === "mock" || v === "live";

/** Pure resolver: `?api=` > localStorage > build default. "live" is ignored (mock) when no backend is reachable by config. */
export function resolveApiMode(o: {
  search: string;
  storage: Pick<Storage, "getItem" | "setItem"> | null;
  buildMode: ApiMode;
  liveAvailable: boolean;
}): ApiMode {
  let mode: ApiMode = o.buildMode;
  let stored: unknown = null;
  try { stored = o.storage?.getItem(API_MODE_KEY) ?? null; } catch { /* storage blocked */ }
  if (isMode(stored)) mode = stored;
  let q: string | null = null;
  try { q = new URLSearchParams(o.search).get("api"); } catch { /* bad search */ }
  if (isMode(q)) {
    mode = q;
    try { o.storage?.setItem(API_MODE_KEY, q); } catch { /* storage blocked */ }
  }
  return mode === "live" && !o.liveAvailable ? "mock" : mode;
}

/** Switch the runtime mode (persisted) and reload: modules read `env.apiMode` once at import. */
export function switchApiMode(mode: ApiMode): void {
  try { localStorage.setItem(API_MODE_KEY, mode); } catch { /* storage blocked */ }
  const url = new URL(location.href);
  url.searchParams.delete("api");
  location.replace(url.toString());
}

const buildMode: ApiMode = import.meta.env.VITE_API_MODE === "live" ? "live" : "mock";
const apiBase = (import.meta.env.VITE_API_BASE as string | undefined) ?? "/api";
/** A live backend is reachable when the build is live, or VITE_API_BASE is an absolute http(s) URL. */
const liveAvailable = buildMode === "live" || /^https?:\/\//i.test(apiBase);
const safeStorage = (): Storage | null => { try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; } };

export const env = {
  /** `mock` = in-browser deterministic backend (default); `live` = fetch `apiBase` + SSE. Resolved once at startup (query > storage > build). */
  apiMode: resolveApiMode({ search: typeof location === "undefined" ? "" : location.search, storage: safeStorage(), buildMode, liveAvailable }),
  /** Build default (what you get with no query/storage override). */
  buildMode,
  liveAvailable,
  apiBase: apiBase.replace(/\/+$/, ""),
  explorerUrl: (import.meta.env.VITE_EXPLORER_URL as string | undefined) || "", // the Guardian L1 has no public explorer: empty = no link
  /** Wallet signing for Council members: needs apiMode live plus RPC and Council address, else the button is hidden. */
  l1RpcUrl: (import.meta.env.VITE_L1_RPC_URL as string | undefined) || undefined,
  councilAddress: (import.meta.env.VITE_COUNCIL_ADDRESS as string | undefined) || undefined,
  l1ChainId: Number((import.meta.env.VITE_L1_CHAIN_ID as string | undefined) || 845357),
  l1NativeSymbol: (import.meta.env.VITE_L1_NATIVE_SYMBOL as string | undefined) || "GRD",
};
