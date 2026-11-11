// API mode/base URL/explorer URL from import.meta.env.
export const env = {
  /** `mock` = in-browser deterministic backend (default); `live` = fetch /api + SSE. */
  apiMode: ((import.meta.env.VITE_API_MODE as string | undefined) ?? "mock") as "mock" | "live",
  apiBase: (import.meta.env.VITE_API_BASE as string | undefined) ?? "/api",
  explorerUrl: (import.meta.env.VITE_EXPLORER_URL as string | undefined) ?? "https://subnets-test.avax.network/explorer",
};
