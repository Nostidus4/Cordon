// /api/payroll/* client (CITY-006). Live: fetch; mock mode: the deterministic in-browser month (lib/mock/payrollSim).
import { env } from "../../config/env";
import type { PayrollAgentRun, PayrollReport, PayrollState, PayrollTx } from "../../types";
import { DAY, derivePayroll, newPayrollWorld } from "../mock/payrollSim";
import { http } from "./client";

export interface PayrollApi {
  getState(): Promise<PayrollState>;
  getReport(): Promise<PayrollReport>;
  getRuns(): Promise<PayrollAgentRun[]>;
  advance(seconds: number): Promise<PayrollState>;
  setFrozen(venue: string, frozen: boolean): Promise<PayrollState>;
  kill(member?: string): Promise<PayrollTx>;
  runAgent(): Promise<PayrollAgentRun>;
  finalize(): Promise<PayrollTx>;
  execute(): Promise<PayrollTx>;
  reset(): Promise<PayrollState>;
}

const live: PayrollApi = {
  getState: () => http("GET", "/payroll"),
  getReport: () => http("GET", "/payroll/report"),
  getRuns: () => http("GET", "/payroll/runs"),
  advance: (seconds) => http("POST", "/payroll/demo/advance", { seconds }),
  setFrozen: (venue, frozen) => http("POST", `/payroll/demo/venues/${encodeURIComponent(venue)}/${frozen ? "freeze" : "unfreeze"}`),
  kill: (member = "lan") => http("POST", "/payroll/kill", { member }),
  runAgent: () => http("POST", "/payroll/agent/run", {}),
  finalize: () => http("POST", "/payroll/finalize"),
  execute: () => http("POST", "/payroll/execute"),
  reset: () => http("POST", "/payroll/demo/reset"),
};

let world = newPayrollWorld();
const tx = (ok: boolean, reasonVi: string | null = null): PayrollTx => ({ ok, status: ok ? "ok" : "reverted", reasonCode: null, reasonVi, errorRaw: null, txHash: null, proposalId: null, events: [] });
const mock: PayrollApi = {
  getState: async () => derivePayroll(world),
  getReport: async () => {
    const s = derivePayroll(world);
    return { ts: s.now, text: `Quỹ đang giữ ${s.idle.display} trong kho, ${s.deployedTotal.display} đang ở các nơi gửi. Cần ${s.payrollTotal.display} cho ngày lương.`, reasonSource: "template", reasonHash: "mock", facts: {} };
  },
  getRuns: async () => [],
  advance: async (seconds) => { world.second += seconds; return derivePayroll(world); },
  setFrozen: async (venue, frozen) => { (frozen ? world.frozen.add(venue) : world.frozen.delete(venue)); return derivePayroll(world); },
  kill: async () => { if (world.killed) return tx(false, "Công tắc đã bật rồi."); world.killed = true; world.killReason = 1; return tx(true); },
  runAgent: async () => ({ id: 1, ts: world.second, outcome: "no_action", actions: [], steps: [], reasonText: "Chế độ giả lập trong trình duyệt.", reasonSource: "template", reasonHash: "mock", untrustedInput: null, injectionIgnored: null, facts: {} }),
  finalize: async () => { world.second = Math.max(world.second, 29 * DAY); return tx(true); },
  execute: async () => { if (world.second < 30 * DAY) return tx(false, "Chưa tới ngày lương."); world.executed = true; return tx(true); },
  reset: async () => { world = newPayrollWorld(); return derivePayroll(world); },
};

export const payrollApi: PayrollApi = env.apiMode === "live" ? live : mock;
