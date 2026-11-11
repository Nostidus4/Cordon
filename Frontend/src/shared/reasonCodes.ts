// Reason code -> VI/EN text (spec §6.4), mirror of backend shared/reason_codes.py. Canonical district-cap code: DISTRICT_DAILY_CAP (§6.4; §4.3 'PRINCIPAL_DAILY_CAP' is a spec typo).
export type ReasonCode =
  | "VAULT_PAUSED" | "KEY_NOT_REGISTERED" | "DISTRICT_LOCKED" | "TOKEN_NOT_ALLOWED" | "PROTOCOL_NOT_ALLOWED"
  | "RECIPIENT_NOT_ALLOWED" | "CARD_DAILY_CAP" | "DISTRICT_DAILY_CAP" | "SLIPPAGE" | "BLOCKED_AT_PROTOCOL";

export const REASONS: Record<ReasonCode, { error: string | null; vi: string; en: string }> = {
  VAULT_PAUSED: { error: "VaultPaused", vi: "Cả kho đang dừng", en: "Vault paused" },
  KEY_NOT_REGISTERED: { error: "KeyNotRegistered", vi: "Thẻ chưa đăng ký", en: "Card not registered" },
  DISTRICT_LOCKED: { error: "PrincipalIsLocked", vi: "Khu đã bị khoá", en: "District cordoned off" },
  TOKEN_NOT_ALLOWED: { error: "TokenNotAllowed", vi: "Loại tiền chưa duyệt", en: "Token not approved" },
  PROTOCOL_NOT_ALLOWED: { error: "ProtocolNotAllowed", vi: "Chợ đổi tiền chưa duyệt", en: "Protocol not approved" },
  RECIPIENT_NOT_ALLOWED: { error: "RecipientNotAllowed", vi: "Người nhận chưa duyệt", en: "Recipient not approved" },
  CARD_DAILY_CAP: { error: "KeyDailyCapExceeded", vi: "Thẻ này đã hết hạn mức hôm nay", en: "Card daily cap reached" },
  DISTRICT_DAILY_CAP: { error: "PrincipalDailyCapExceeded", vi: "Cả khu hôm nay đã gần hết phần chung", en: "District daily cap reached" },
  SLIPPAGE: { error: "SlippageTooHigh", vi: "Trượt giá quá mức", en: "Slippage too high" },
  BLOCKED_AT_PROTOCOL: { error: null, vi: "Thẻ đã bị gạch khỏi chain, không gửi được giao dịch", en: "Card removed from chain allow list" },
};

export const reasonVi = (c: ReasonCode | null | undefined): string => (c ? REASONS[c].vi : "");
export const reasonEn = (c: ReasonCode | null | undefined): string => (c ? REASONS[c].en : "");
