// API mode/base URL/explorer URL from import.meta.env.
export const env = {
  /** `mock` = in-browser deterministic backend (default); `live` = fetch /api + SSE. */
  apiMode: ((import.meta.env.VITE_API_MODE as string | undefined) ?? "mock") as "mock" | "live",
  apiBase: (import.meta.env.VITE_API_BASE as string | undefined) ?? "/api",
  explorerUrl: (import.meta.env.VITE_EXPLORER_URL as string | undefined) ?? "https://subnets-test.avax.network/explorer",
  /** Wallet signing for Council members: needs apiMode live plus RPC and Council address, else the button is hidden. */
  l1RpcUrl: (import.meta.env.VITE_L1_RPC_URL as string | undefined) || undefined,
  councilAddress: (import.meta.env.VITE_COUNCIL_ADDRESS as string | undefined) || undefined,
  l1ChainId: Number((import.meta.env.VITE_L1_CHAIN_ID as string | undefined) || 845357),
  l1NativeSymbol: (import.meta.env.VITE_L1_NATIVE_SYMBOL as string | undefined) || "GRD",
};
