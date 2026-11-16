// "Ký bằng ví": a Council member approves with their own browser wallet, the backend does not sign this vote.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { EIP1193Provider } from "viem"; // type only, erased at build
import { isWalletApproveEnabled, walletEnv } from "../lib/wallet/config";
import { walletErrorMessage } from "../lib/wallet/errors";
import { ToyButton } from "./ui";

const injected = (): EIP1193Provider | undefined => (typeof window === "undefined" ? undefined : (window as unknown as { ethereum?: EIP1193Provider }).ethereum);

export function WalletApproveButton({ proposalId, disabled }: { proposalId: number; disabled?: boolean }) {
  const qc = useQueryClient();
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const wallet = injected();
  if (!wallet || !isWalletApproveEnabled(walletEnv, true)) return null;
  const busy = step !== null;
  const run = async () => {
    setError(null); setHash(null); setStep("Đang kết nối ví…");
    try {
      const { approveWithWallet } = await import("../lib/wallet/approve"); // viem loads on click only
      const r = await approveWithWallet(walletEnv, wallet, proposalId, setStep);
      setHash(r.hash);
    } catch (e) {
      setError(walletErrorMessage(e));
    } finally {
      setStep(null);
      void qc.invalidateQueries(); // the backend reads votes live from the chain; refetch picks the wallet vote up
    }
  };
  return (
    <div className="mt-2" data-wallet-approve>
      <ToyButton size="xs" color="teal" disabled={busy || disabled} onClick={() => void run()}>{busy ? step : "Ký bằng ví"}</ToyButton>
      {hash ? <p className="toy-body mb-0 mt-1.5" role="status">Đã ký bằng ví · <span className="num" style={{ fontSize: 13 }}>{`${hash.slice(0, 8)}…${hash.slice(-6)}`}</span></p> : null}
      {error ? <p className="m-0 mt-1.5 text-[13.5px] font-bold leading-snug" style={{ color: "var(--red-ink)" }} role="alert">{error}</p> : null}
    </div>
  );
}
