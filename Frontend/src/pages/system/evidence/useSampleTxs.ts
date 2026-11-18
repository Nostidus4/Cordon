// Reads each curated receipt once (eth_getTransactionReceipt, read-only). With no RPC the page keeps the static list.
import { useEffect, useState } from "react";
import { RpcError, rpcCall } from "./rpc";
import { SAMPLE_TXS, sampleView, type RpcReceipt, type SampleView } from "./sampleTxs";

export function useSampleTxs(url: string): Record<string, SampleView> {
  const initial = (): Record<string, SampleView> => Object.fromEntries(SAMPLE_TXS.map((t) => [t.id, (url ? { state: "loading" } : { state: "static" }) as SampleView]));
  const [views, setViews] = useState<Record<string, SampleView>>(initial);
  useEffect(() => {
    if (!url) { setViews(initial()); return; }
    let alive = true;
    setViews(initial());
    // Sequential with a short gap: the public proxy allows about 120 calls a minute and the page also polls.
    void (async () => {
      for (const tx of SAMPLE_TXS) {
        let view: SampleView;
        try {
          view = sampleView(tx, await rpcCall<RpcReceipt | null>(url, "eth_getTransactionReceipt", [tx.hash]));
        } catch (e) {
          view = { state: "error", message: e instanceof RpcError ? e.message : "Lỗi không rõ" };
        }
        if (!alive) return;
        setViews((v) => ({ ...v, [tx.id]: view }));
        await new Promise((r) => setTimeout(r, 150));
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  return views;
}
