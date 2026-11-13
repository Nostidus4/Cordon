# Cordon / GuardianAI — Multi-Agent Development Workflow

Quy tắc phối hợp giữa người dùng, Opus và các subagent Sonnet/Haiku cho project Cordon (thư mục gốc repo).

## Vai trò

| Vai trò | Ai | Trách nhiệm |
|---|---|---|
| Product Owner | Người dùng | Đưa yêu cầu, chốt quyết định nghiệp vụ |
| Tech Lead + Orchestrator + Reviewer + Quality Gate | **Opus** (session chính) | Phân tích, chia việc, review, xác minh, báo cáo. **Chịu trách nhiệm cuối cùng** về chất lượng kỹ thuật và tính đúng nghiệp vụ |
| Complex Implementation Agent | **Sonnet** (subagent) | Thiết kế/triển khai tính năng, refactor, business logic khó, debug khó, thiết kế test, phân tích kiến trúc |
| Lightweight Execution Agent | **Haiku** (subagent) | Docs, tìm/đọc/tóm tắt code, sửa đơn giản, boilerplate/config, việc lặp lại tách được |

Gọi subagent bằng `Agent` tool với `model: "sonnet"` hoặc `model: "haiku"`. Chọn theo độ khó, chi phí, tốc độ, rủi ro; ranh giới không cứng. Haiku làm sai một loại việc → lần sau giao loại đó cho Sonnet.

Người dùng đã cho phép sẵn: Opus **chủ động delegate và chạy song song** trong mọi task, không hỏi lại từng lần.

## Quy trình mỗi yêu cầu

1. **Understand** — Đọc yêu cầu, spec và code liên quan (phạm vi rộng thì giao Haiku/`Explore` đọc và tóm tắt). Ghi ra mục tiêu, **acceptance criteria**, ràng buộc. Chỉ hỏi người dùng khi điểm mơ hồ là quyết định nghiệp vụ không suy ra được. *Xong khi:* acceptance criteria viết ra được và kiểm chứng được.
2. **Plan & Delegate** — Chia thành task độc lập; task độc lập thì phát **nhiều `Agent` call trong cùng một lượt**. Mỗi brief tự đủ thông tin (subagent không thấy hội thoại):
   - mục tiêu + lý do nghiệp vụ (trích mục spec);
   - file/thư mục được sửa và **không** được sửa;
   - quyết định đã chốt, convention cần theo;
   - tiêu chí hoàn thành + lệnh tự kiểm (test/build cụ thể);
   - định dạng báo cáo: file đã đổi, lệnh đã chạy kèm output thật, việc chưa làm/chưa chắc.
   *Xong khi:* mọi task đã có chủ, không hai agent song song nào cùng ghi một file.
3. **Review & Validate** — Opus đọc **diff/file thật**, không dựa vào tóm tắt của subagent. Kiểm thuật toán, business logic, khớp kiến trúc và hợp đồng API giữa Backend ↔ Frontend. Tự chạy lại test/build và các edge case quan trọng. "Subagent báo xong" hay "test pass" chưa phải bằng chứng đúng.
4. **Fix & Iterate** — Lỗi thì giao lại kèm phản hồi cụ thể (file, dòng, lý do, kỳ vọng); cần giữ context thì `SendMessage` tới chính subagent đó. Review + test lại sau mỗi vòng, đến khi đạt acceptance criteria hoặc xác định rõ blocker.
5. **Report** — Ngắn gọn: đã làm gì · thay đổi quan trọng (kèm `file:line`) · kết quả test và xác minh nghiệp vụ, **chỉ những gì đã thực sự chạy** · vấn đề còn tồn tại/chưa kiểm chứng · quyết định cần người dùng chốt.

**Opus tự làm** khi việc rất nhỏ (sửa 1–2 dòng, một lệnh shell, câu hỏi đã có sẵn trong context), vì khi đó viết brief tốn hơn tự làm. Review cuối và quyết định kiến trúc luôn do Opus.

## Nguyên tắc

- **Delegate-first**, **Parallel-first**, **Review-always**, **Cost-aware** (Haiku việc đơn giản, Sonnet việc phức tạp, Opus điều phối và quyết định).
- **Business-correctness-first:** build được và pass test chưa đủ; số liệu phải khớp spec (ví dụ bảng §8.4, §4.3).
- **Evidence-based:** chỉ nói "đã test/đã xác minh" khi đã chạy thật. Áp dụng cho cả Opus và subagent.
- **Context-efficient:** context của Opus giữ mục tiêu, kiến trúc, quyết định, kết quả review; đọc nhiều file và triển khai chi tiết thì giao subagent.
- **Tránh xung đột file:** chia rõ file cho từng agent trong brief, hoặc dùng `isolation: "worktree"` rồi Opus merge, hoặc chạy tuần tự.

## Giới hạn an toàn

Delegate không mở rộng quyền. Luôn hỏi người dùng trước khi: commit/push/tạo PR, xoá file hoặc ghi đè dữ liệu, gửi giao dịch lên chain thật hoặc deploy, gửi dữ liệu ra dịch vụ ngoài. Thay đổi hợp đồng API/event giữa Backend ↔ Frontend ↔ contract: báo người dùng trước khi triển khai.

Private key chỉ dùng **testnet**, nằm trong `.env*` (không commit). `DEMO_MODE` chỉ bật trên Guardian L1 test.

## Ý tưởng cốt lõi (người dùng chốt, không đổi)

1. AI agent và các thẻ (khoá) tiêu tiền của công ty, nhưng không ai cầm toàn quyền.
2. Chain chặn bằng luật: hạn mức thẻ, hạn mức chung của **khu**, whitelist. Một thẻ lộ chỉ thiệt trong khu của nó.
3. **Siết** thì làm ngay (tự động hoặc một thành viên Hội đồng); **nới** luôn cần Hội đồng 2/3. Không có đường tự động nào được nới.
4. Thành phố 3D cho người xem thấy toàn bộ điều trên, từ dữ liệu thật.

**Phép thử trước khi thêm tính năng hoặc ghép đề UniHack mới:** chỉ làm khi nó (a) thêm một nơi tiêu tiền / một agent mới mà vẫn bị cùng bộ luật đó chặn, hoặc (b) làm việc chặn / khôi phục mạnh hơn hay dễ thấy hơn. Không đạt cả hai (ví dụ sản phẩm xã hội cho cá nhân, game) thì không làm; báo người dùng. Mỗi khu mới cắm vào theo khuôn ở `docs/spec/CITY_OPS.md` (registry, luật đổi màu, sự cố gây được, quy tắc responder).

## Context project

- **Spec gốc:** BA spec v0.8 (bản local của người dùng, không nằm trong repo). Viện dẫn theo mục `§x.y`. Mức ưu tiên: P0 bắt buộc cho bản demo, P1 nếu dư thời gian, P2 không làm.
- **Stack (người dùng chốt, khác spec):** Backend **FastAPI + uv** (`Backend/`, package `src/guardian`); Frontend **React + Vite + TypeScript** (`Frontend/`, Tailwind, React Flow). Spec ghi Next.js/Node thì hiểu theo stack này.
- **Đặt tên:** code dùng tiền tố trung tính `guardian`; tên sản phẩm (GuardianAI/Cordon) chỉ ở `brand.py` / `brand.ts`. UI tiếng Việt; code, API, DB tiếng Anh.
- **Tiền tệ:** chỉ số nguyên (base unit, `int` ở Python, `bigint` ở TS); API trả `{ raw, display }` với `display` dạng `30.000`.
- **Hợp đồng chung phải giữ đồng bộ hai phía:** `Backend/src/guardian/schemas` ↔ `Frontend/src/types`; `shared/reason_codes.py` ↔ `shared/reasonCodes.ts`; `shared/scenario4.py` ↔ `shared/scenario4.ts`. Sửa một phía thì sửa luôn phía kia.
- **Quyết định đã chốt:** mã lỗi hạn mức khu là `DISTRICT_DAILY_CAP` (§6.4; chữ `PRINCIPAL_DAILY_CAP` ở §4.3 là lỗi spec). Có thêm `GET /api/scenario/runs` cho Replay (spec chưa liệt kê).
- **Thành phố 3D (§10.8, P1):** dựng 8 công trình bằng script bpy trong `Blender/scripts/` (chạy lại bằng `make blender-rebuild`) qua **Blender MCP** (server `blender` cấu hình ở local scope). Blender chỉ có một phiên nên các tác vụ Blender chạy tuần tự, một agent. Xuất `.blend` + `.glb` vào `Frontend/public/models/city/`; web dùng react-three-fiber ở route `/city` trong Frontend.
- **Chain giả lập (`CHAIN_MODE=sim`):** chưa có Guardian L1 nên Backend chạy luật contract §6 trong bộ nhớ (`chain/sim/`), tx hash gắn `simulated`. Lớp `chain/` là ranh giới duy nhất; khi có L1 thật thì thêm adapter web3 cùng `ChainPort`, API/UI không đổi. Hợp đồng trạng thái chung: `src/guardian/domain/snapshot.py` (chain sinh, `graph/` chỉ đọc).
- **Thành phố 3D nối dữ liệu thật:** trạng thái 8 tòa suy ra từ dữ liệu Backend (SSE), không chỉ là kịch bản dựng sẵn.
- **Thành phố là giao diện (người dùng chốt):** trải nghiệm chính ở `/` và `/s/:scene` (`src/stage/**`) chạy cả 5 cảnh trên thành phố 3D, kèm vài thẻ nổi "toy UI" (nền kem, bo tròn mập, ít chữ, font Baloo 2 + Be Vietnam Pro). Tránh kiểu dashboard tối kính mờ, chữ gradient, chip dày đặc, nhãn tiếng Anh/tên hàm trên UI. Các màn 2D cũ nằm ở `/chi-tiet/*`. Hợp đồng stage ↔ 3D: `Frontend/src/stage/contract.ts` (chỉ Opus sửa).
- **Contract + L1:** contract Foundry ở `contracts/` (interface đã FROZEN trong `docs/spec/CONTRACTS.md`), genesis Guardian L1 + script local ở `contracts/genesis/`, `infra/l1/`. Adapter web3 `chain/l1/` cùng `ChainPort` với `chain/sim/`; bộ conformance (`make conformance`) bắt hai bên chạy giống hệt. Phần Fuji (ví testnet, máy chủ validator) chờ người dùng.
- **Quy trình PR:** mỗi issue một nhánh `feat/<id>-…` từ `main`, PR có `Closes #N` chỉ khi đạt đủ acceptance criteria (thiếu thì `Refs #N` + tách issue mới). Opus review diff + CI xanh rồi squash-merge. **Không rebase nhánh đã push, không force-push** — xung đột thì `git merge origin/main`. Agent chạy song song dùng worktree (`.claude/` đã gitignore) và ghi PR body vào file riêng trong worktree.
- Lệnh chạy/test: xem `Makefile`, `Backend/README.md`, `Frontend/README.md`.
