// Payroll reason code -> VI/EN text (PAYROLL.md section 5, decision 8), mirror of backend shared/payroll_reasons.py.
// A separate enum from ReasonCode on purpose: the CONTRACTS.md set stays frozen.
export type PayrollReason =
  | "VENUE_NOT_ALLOWED" | "VENUE_IMPAIRED" | "VENUE_CAP_EXCEEDED" | "BUFFER_BREACHED" | "LADDER_CEILING_EXCEEDED"
  | "DEADLINE_PASSED" | "KILL_SWITCH_ACTIVE" | "COVERAGE_INSUFFICIENT" | "AGENT_NOT_AUTHORIZED" | "PAYEE_NOT_IN_ROSTER"
  | "PAYROLL_UNDERFUNDED" | "PAYDAY_NOT_REACHED" | "PAYROLL_ALREADY_PAID" | "BLOCKED_AT_PROTOCOL";

export const PAYROLL_REASONS: Record<PayrollReason, { error: string | null; vi: string; en: string }> = {
  VENUE_NOT_ALLOWED: { error: "VenueNotAllowed", vi: "Nơi gửi chưa được duyệt", en: "Venue not approved" },
  VENUE_IMPAIRED: { error: "VenueImpairedError", vi: "Nơi gửi đang gặp sự cố", en: "Venue impaired" },
  VENUE_CAP_EXCEEDED: { error: "VenueCapExceeded", vi: "Đã chạm 40% cho một nơi", en: "Venue cap reached" },
  BUFFER_BREACHED: { error: "BufferBreached", vi: "Phải giữ 5% tiền mặt trong kho", en: "Liquidity buffer required" },
  LADDER_CEILING_EXCEEDED: { error: "LadderCeilingExceeded", vi: "Vượt mức cho phép của bậc thang hôm nay", en: "Ladder ceiling exceeded" },
  DEADLINE_PASSED: { error: "DeadlinePassed", vi: "Đã qua hạn rút về (T-1)", en: "Past unwind deadline" },
  KILL_SWITCH_ACTIVE: { error: "KillSwitchActive", vi: "Công tắc khẩn cấp đang bật", en: "Kill switch active" },
  COVERAGE_INSUFFICIENT: { error: "CoverageInsufficient", vi: "Chưa đủ dự phòng nếu một nơi gửi bị kẹt", en: "Not enough cover if a venue freezes" },
  AGENT_NOT_AUTHORIZED: { error: "NotAgent", vi: "Khoá này không phải agent quỹ lương", en: "Not a payroll agent" },
  PAYEE_NOT_IN_ROSTER: { error: "NotPayee", vi: "Người nhận không nằm trong bảng lương", en: "Payee not in roster" },
  PAYROLL_UNDERFUNDED: { error: "InsufficientFunds", vi: "Quỹ chưa đủ tiền lương", en: "Payroll underfunded" },
  PAYDAY_NOT_REACHED: { error: "PaydayNotReached", vi: "Chưa tới ngày lương", en: "Payday not reached" },
  PAYROLL_ALREADY_PAID: { error: "AlreadyExecuted", vi: "Kỳ lương này đã chi", en: "Cycle already paid" },
  BLOCKED_AT_PROTOCOL: { error: null, vi: "Thẻ đã bị gạch khỏi chain, không gửi được giao dịch", en: "Card removed from chain allow list" },
};

export const payrollReasonVi = (c: PayrollReason | null | undefined): string => (c ? PAYROLL_REASONS[c].vi : "");
export const payrollReasonEn = (c: PayrollReason | null | undefined): string => (c ? PAYROLL_REASONS[c].en : "");
