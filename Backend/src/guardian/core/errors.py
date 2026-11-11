"""Error format `{error:{code,message}}` (spec §8.6) and exception handlers."""

from __future__ import annotations

import re
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from guardian.chain.errors import ChainRevert
from guardian.shared.reason_codes import reason_text

REVERT_VI: dict[str, str] = {
    "ConflictOfInterest": "Bạn là đối tượng của đề xuất này nên không được duyệt (xung đột lợi ích).",
    "NotCouncilMember": "Chỉ thành viên Hội đồng mới làm được việc này.",
    "NotTightening": "Thay đổi này không phải là siết chặt.",
    "NeedsThreshold": "Thay đổi này là nới quyền, cần 2/3 Hội đồng duyệt qua đề xuất.",
    "AlreadyApproved": "Thành viên này đã duyệt đề xuất rồi.",
    "ProposalNotOpen": "Đề xuất không còn mở (đã thực hiện hoặc đã huỷ).",
    "NotProposer": "Chỉ người tạo đề xuất mới huỷ được.",
    "TargetNotAllowed": "Đề xuất gọi tới hợp đồng không được phép.",
    "UnknownCall": "Đề xuất chứa lệnh không hỗ trợ.",
    "BadCallArgs": "Đề xuất chứa tham số không hợp lệ.",
    "UnknownProposal": "Không có đề xuất này.",
    "KeyAlreadyRegistered": "Thẻ đã được đăng ký.",
    "PrincipalNotFound": "Không tìm thấy khu.",
    "PrincipalExists": "Khu đã tồn tại.",
    "InsufficientBalance": "Không đủ số dư.",
    "InsufficientTreasury": "Quỹ chính không đủ.",
}


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def error_body(code: str, message: str) -> dict[str, Any]:
    return {"error": {"code": code, "message": message}}


def upper_snake(name: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "_", name).upper()


def revert_to_error(e: ChainRevert) -> tuple[str, str]:
    if e.reason is not None:
        return e.reason.value, reason_text(e.reason, "vi")
    return upper_snake(e.name), REVERT_VI.get(e.name, f"Giao dịch bị từ chối: {e.name}")


def register_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api(_: Request, e: ApiError) -> JSONResponse:
        return JSONResponse(error_body(e.code, e.message), status_code=e.status)

    @app.exception_handler(ChainRevert)
    async def _revert(_: Request, e: ChainRevert) -> JSONResponse:
        code, message = revert_to_error(e)
        return JSONResponse(error_body(code, message), status_code=409)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, e: RequestValidationError) -> JSONResponse:
        first = e.errors()[0] if e.errors() else {}
        loc = ".".join(str(p) for p in first.get("loc", []) if p != "body")
        return JSONResponse(
            error_body("VALIDATION_ERROR", f"{loc}: {first.get('msg', 'invalid request')}"),
            status_code=422,
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, e: StarletteHTTPException) -> JSONResponse:
        code = {404: "NOT_FOUND", 405: "METHOD_NOT_ALLOWED"}.get(e.status_code, "HTTP_ERROR")
        return JSONResponse(error_body(code, str(e.detail)), status_code=e.status_code)
