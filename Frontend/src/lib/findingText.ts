import type { Finding } from "../types";

/** VI explanation of a finding, derived from the rule id and the backend `data` facts (the backend only sends `title`). */
export function findingDetail(f: Finding): string {
  const cap = (f.data.suggestedDistrictCap as { display?: string } | undefined)?.display;
  switch (f.ruleId) {
    case "R1_MULTI_KEY_NO_SHARED_CAP":
      return `Mỗi thẻ có trần riêng nhưng không có trần chung, nên mức mất tối đa là tổng các thẻ cộng lại.${cap ? ` Nên gom về một khu với trần chung ${cap}/ngày.` : ""}`;
    case "R2_AGENT_NO_ALLOWLIST":
      return "Chưa có người nhận nào được duyệt, nên thẻ này không có ranh giới rõ về nơi được chuyển tiền tới.";
    case "R3_ADMIN_IS_OPERATOR":
      return "Một người vừa quản trị máy chủ vừa giữ thẻ chi tiêu, nên một chỗ bị lộ có thể mở cả hai cửa. Nên gom thẻ dịch vụ về cùng khu để dùng chung một hạn mức.";
    case "R4_COUNCIL_CONCENTRATION":
      return "Dồn quyền chi tiêu và quyền duyệt vào cùng một người.";
  }
}
