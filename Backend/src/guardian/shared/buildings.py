"""The eight buildings of the 3D city = eight real modules (docs/spec/CITY_OPS.md §1).

Mirror of `Frontend/src/shared/buildings.ts`: keep both sides in sync. Rule ids are stable and shared with the
colour rules evaluated by `services/city_state.py` (first matching rule in this order wins; every B01-B07
starts with the two responder rules). Module/contract names are shown only in the small "inside" line of the UI.
"""

from __future__ import annotations

from dataclasses import dataclass

RULE_WORST = "worst"  # `state` of B08.worst: whatever the worst of the other seven is


@dataclass(frozen=True)
class RuleDef:
    id: str
    state: str  # incident | recovery | warning | "worst" (B08 only)
    when_vi: str


@dataclass(frozen=True)
class BuildingDef:
    id: str
    name: str
    module: str
    topic: str
    summary_vi: str
    rules: tuple[RuleDef, ...]


def _incident_rules(b: str) -> tuple[RuleDef, RuleDef]:
    return (
        RuleDef(f"{b}.incident_open", "incident", "Có sự cố đang mở ở tòa này"),
        RuleDef(f"{b}.incident_recovering", "recovery", "Sự cố của tòa này đang hồi phục"),
    )


BUILDINGS: tuple[BuildingDef, ...] = (
    BuildingDef(
        "B01",
        "Hội đồng duyệt",
        "GuardianCouncil (multisig 2/3), proposal_service",
        "#12, #21",
        "Nơi Hội đồng duyệt mọi thay đổi nới lỏng luật. Siết chặt thì một thành viên làm được, "
        "nới lỏng cần 2 trên 3 người duyệt và người có quyền lợi liên quan không được tự duyệt.",
        (
            *_incident_rules("B01"),
            RuleDef("B01.conflict", "incident", "Vừa có lần duyệt bị chặn vì xung đột lợi ích"),
            RuleDef("B01.executed", "recovery", "Một đề xuất vừa được thực hiện"),
            RuleDef("B01.pending", "warning", "Có đề xuất chờ Hội đồng duyệt"),
        ),
    ),
    BuildingDef(
        "B02",
        "Trợ lý AI",
        "assistant/ (công cụ đọc + verifier)",
        "#13",
        "Trợ lý chỉ đọc dữ liệu thật và trả lời bằng số liệu đã được kiểm chứng. "
        "Con số nào không kiểm chứng được thì trợ lý từ chối nói.",
        (
            *_incident_rules("B02"),
            RuleDef("B02.unverified", "warning", "Câu trả lời gần nhất có số liệu chưa kiểm chứng"),
        ),
    ),
    BuildingDef(
        "B03",
        "Kho tiền có luật",
        "PolicyVault (hạn mức, danh sách được phép, dừng khẩn cấp)",
        "#12",
        "Kho giữ tiền của công ty. Mỗi khoản chi phải qua hạn mức thẻ, hạn mức chung của khu "
        "và danh sách người nhận được duyệt; Hội đồng có thể dừng cả kho.",
        (
            *_incident_rules("B03"),
            RuleDef("B03.paused", "incident", "Cả kho đang dừng"),
            RuleDef("B03.near_cap", "warning", "Một khu đã dùng từ 80% hạn mức chung hôm nay"),
        ),
    ),
    BuildingDef(
        "B04",
        "Cổng chi trả",
        "vault.pay / vault.swap (các lần thử chi)",
        "#21",
        "Cổng mọi lệnh chi và đổi tiền đi qua. Lệnh sai luật bị chain từ chối và được ghi lại "
        "cùng mã lý do.",
        (
            *_incident_rules("B04"),
            RuleDef("B04.blocked_open", "incident", "Giao dịch vừa bị chặn, khu chưa được khoá"),
            RuleDef("B04.blocked_locked", "recovery", "Giao dịch vừa bị chặn, khu đã được khoá"),
        ),
    ),
    BuildingDef(
        "B05",
        "Trạm soi giao dịch",
        "Tx AllowList precompile + khoá khu",
        "#14",
        "Lá chắn ở tầng chain: khi một khu bị khoá, khoá của khu bị gạch khỏi danh sách và "
        "giao dịch bị từ chối trước khi vào khối.",
        (
            *_incident_rules("B05"),
            RuleDef(
                "B05.shield",
                "incident",
                "Chain vừa từ chối giao dịch của khu bị khoá hoặc thẻ bị gạch",
            ),
            RuleDef("B05.locked", "recovery", "Có khu đang bị khoá"),
        ),
    ),
    BuildingDef(
        "B06",
        "Agent cân đối",
        "agent_rebalance/ (rule engine + LLM chỉ viết lý do)",
        "#12",
        "Agent tự cân đối danh mục theo luật cố định. AI chỉ viết lời giải thích; số tiền, token "
        "và sàn giao dịch do rule engine quyết, và contract vẫn chặn nếu vượt luật.",
        (
            *_incident_rules("B06"),
            RuleDef("B06.blocked", "warning", "Lần chạy gần nhất của agent bị chặn hoặc revert"),
        ),
    ),
    BuildingDef(
        "B07",
        "Sổ kiểm toán",
        "graph/findings (cờ rủi ro), nhật ký thao tác",
        "#12",
        "Quét cấu hình và gắn cờ rủi ro (ví dụ nhiều khoá không chung hạn mức). "
        "Mọi thao tác ký đều có nhật ký.",
        (
            *_incident_rules("B07"),
            RuleDef("B07.high", "warning", "Còn cờ rủi ro mức cao đang mở"),
        ),
    ),
    BuildingDef(
        "B08",
        "Trung tâm sự cố",
        "responder (khoanh vùng tự động, xin Hội đồng nới)",
        "",
        "Theo dõi sự cố: tự siết để khoanh vùng, soạn đề xuất sửa gửi Hội đồng 2/3 và kiểm tra "
        "lại sau khi hồi phục. Hệ thống không bao giờ tự nới.",
        (RuleDef("B08.worst", RULE_WORST, "Trạng thái xấu nhất của bảy tòa còn lại"),),
    ),
)

BUILDING_IDS: tuple[str, ...] = tuple(b.id for b in BUILDINGS)
BUILDING_BY_ID: dict[str, BuildingDef] = {b.id: b for b in BUILDINGS}
