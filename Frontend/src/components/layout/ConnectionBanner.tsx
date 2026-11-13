import { env } from "../../config/env";
import { useConnStore } from "../../store/connStore";

/** Live mode only: small cream pill while the API/stream is unreachable and react-query serves cached data. */
export function ConnectionBanner() {
  const down = useConnStore((s) => !s.sseOpen || s.apiDown);
  const at = useConnStore((s) => s.lastOkAt);
  if (env.apiMode !== "live" || !down) return null;
  return (
    <div role="status" className="pointer-events-none fixed inset-x-0 bottom-3 z-[300] flex justify-center">
      <span className="rounded-full border-2 px-4 py-1.5 text-sm font-bold" style={{ background: "#fff8ee", borderColor: "#e9d5b0", color: "#2d2250", boxShadow: "0 3px 0 #e9d5b0" }}>
        Đang dùng dữ liệu đã lưu lúc {new Date(at).toLocaleTimeString("vi-VN", { hour12: false })}
      </span>
    </div>
  );
}
