// Indexed chain event (spec §8.2 events). Backend EventOut.
export interface ChainEvent {
  block: number;
  txHash: string;
  simulated: boolean;
  logIndex: number;
  name: string; // Paid | Swapped | PrincipalLocked | Paused | Proposed | Approved | Executed | EmergencyAction | KeyMoved | CapChanged | PolicyVersionBumped ...
  payload: Record<string, unknown>;
  ts: number; // epoch seconds
}
