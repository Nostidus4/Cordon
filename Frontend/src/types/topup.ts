// GET /api/topups (IDX-002). Mirrors the backend TopUpOut. UI label: "nạp tiền giả lập" (simulated top-up).
import type { Money } from "./common";

export interface TopUp {
  /** The C-Chain tx hash that joins both sides (L1 `TopUpRecorded.cChainTxHash`). */
  cChainTxHash: string;
  amount: Money;
  /** Null until the C-Chain transfer is indexed (or when C-Chain indexing is off). */
  cChainBlock: number | null;
  l1TxHash: string | null;
  l1Block: number | null;
  /** True when both the C-Chain transfer and the L1 `TopUpRecorded` were seen. */
  linked: boolean;
  /** Always true: test token, no real value. */
  simulated: boolean;
}
