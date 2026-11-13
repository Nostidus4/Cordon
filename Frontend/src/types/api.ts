// Request bodies / misc for api layer.
export interface LockRequest { principalId: string; member: import("./common").MemberId }
export interface PauseRequest { member: import("./common").MemberId }
export interface ApproveRequest { member: import("./common").MemberId }
export interface ActionResult {
  status: string;
  txHash: string | null;
  block: number | null;
  simulated: boolean;
  member: string;
  principalId: string | null;
}
