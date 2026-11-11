// Indexed chain event (spec §8.2 events).
export interface ChainEvent {
  id: string;
  chain: "l1" | "c";
  block: number;
  txHash: string;
  simulated: boolean;
  logIndex: number;
  name: string; // Paid | Swapped | PrincipalLocked | Paused | Proposed | Approved | Executed | EmergencyAction | KeyMoved | CapChanged | PolicyVersionBumped ...
  payload: Record<string, unknown>;
  ts: string;
}
