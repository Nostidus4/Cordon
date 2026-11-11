// Request bodies / misc for api layer.
export interface LockRequest { principalId: string; member: import("./common").MemberId }
export interface PauseRequest { member: import("./common").MemberId }
export interface ApproveRequest { member: import("./common").MemberId }
export interface ActionResult { ok: true; txHash: string | null; simulated: boolean; policyVersion?: number }
