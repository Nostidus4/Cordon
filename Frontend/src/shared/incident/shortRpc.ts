/** "rpc error -32000: cannot send transaction: address 0x… is not on the TxAllowList" -> short form */
export const shortRpc = (raw: string | null) => {
  if (!raw) return "RPC từ chối: không có trong Tx AllowList";
  const code = raw.match(/rpc error (-?\d+)/i)?.[1];
  return `RPC ${code ?? ""}: ${/TxAllowList/i.test(raw) ? "không có trong Tx AllowList" : raw.replace(/^rpc error -?\d+:\s*/i, "").slice(0, 60)}`.replace("RPC :", "RPC:");
};
