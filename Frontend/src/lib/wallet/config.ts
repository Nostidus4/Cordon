// Feature flag + settings (no viem import here: the stage chunk must stay free of it) for "Ký bằng ví" (Council member signs with their own browser wallet).
import { env } from "../../config/env";

export interface WalletEnv {
  apiMode: string;
  l1RpcUrl?: string;
  councilAddress?: string;
  l1ChainId: number;
  nativeSymbol: string;
}

export const walletEnv: WalletEnv = {
  apiMode: env.apiMode,
  l1RpcUrl: env.l1RpcUrl,
  councilAddress: env.councilAddress,
  l1ChainId: env.l1ChainId,
  nativeSymbol: env.l1NativeSymbol,
};

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** Only in live mode, with L1 RPC + Council address configured, and an injected wallet present. */
export function isWalletApproveEnabled(e: WalletEnv, hasWallet: boolean): boolean {
  return e.apiMode === "live" && !!e.l1RpcUrl && !!e.councilAddress && ADDRESS.test(e.councilAddress) && hasWallet;
}
