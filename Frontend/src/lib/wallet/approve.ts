// Council member approves with their OWN injected wallet (EIP-1193), straight against GuardianCouncil.
// The backend signs nothing here. Flow: connect -> right chain -> member check -> simulate -> send -> receipt.
import { createPublicClient, createWalletClient, custom, defineChain, getAddress, http, type Chain, Address, type EIP1193Provider, type Hash } from "viem";
import { COUNCIL_SEATS, councilAbi } from "./abi";
import type { WalletEnv } from "./config";
import { WalletFlowError } from "./errors";

export function guardianChain(e: WalletEnv): Chain {
  return defineChain({
    id: e.l1ChainId,
    name: "Guardian L1 (Fuji)",
    nativeCurrency: { name: e.nativeSymbol, symbol: e.nativeSymbol, decimals: 18 },
    rpcUrls: { default: { http: [e.l1RpcUrl ?? ""] } },
  });
}

export interface ApproveResult { hash: Hash; account: Address }

export async function approveWithWallet(
  e: WalletEnv, ethereum: EIP1193Provider, proposalId: number, onStep?: (s: string) => void,
): Promise<ApproveResult> {
  const chain = guardianChain(e);
  const council = e.councilAddress as Address;
  const wallet = createWalletClient({ chain, transport: custom(ethereum) });
  const pub = createPublicClient({ chain, transport: http(e.l1RpcUrl) });

  onStep?.("Đang kết nối ví…");
  const [account] = await wallet.requestAddresses();
  if (!account) throw new WalletFlowError("Ví chưa cấp tài khoản nào.");

  onStep?.("Đang chuyển sang mạng Guardian L1…");
  if ((await wallet.getChainId()) !== e.l1ChainId) {
    try {
      await wallet.switchChain({ id: e.l1ChainId });
    } catch (err) {
      const x = err as { code?: number; cause?: { code?: number } };
      const code = x.code ?? x.cause?.code;
      if (code !== 4902 && code !== -32603) throw err; // 4902: chain unknown to the wallet
      await wallet.addChain({ chain });
    }
  }

  onStep?.("Đang kiểm tra quyền Hội đồng…");
  const seats = await Promise.all(Array.from({ length: COUNCIL_SEATS }, (_, i) =>
    pub.readContract({ address: council, abi: councilAbi, functionName: "members", args: [BigInt(i)] })));
  if (!seats.some((a) => getAddress(a) === getAddress(account))) throw new WalletFlowError("Ví này không thuộc Hội đồng.");
  const already = await pub.readContract({ address: council, abi: councilAbi, functionName: "approvedBy", args: [BigInt(proposalId), account] });
  if (already) throw new WalletFlowError("Ví này đã duyệt đề xuất rồi.");

  // the simulation surfaces custom errors (ConflictOfInterest, ProposalNotOpen...) before the wallet asks to sign
  const { request } = await pub.simulateContract({ account, address: council, abi: councilAbi, functionName: "approve", args: [BigInt(proposalId)] });

  onStep?.("Hãy xác nhận trong ví…");
  const hash = await wallet.writeContract(request);
  onStep?.("Đang chờ chain xác nhận…");
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new WalletFlowError("Giao dịch bị chain từ chối.");
  return { hash, account };
}

export const shortHash = (h: string) => `${h.slice(0, 8)}…${h.slice(-6)}`;
