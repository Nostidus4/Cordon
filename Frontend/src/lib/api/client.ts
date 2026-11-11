// Live transport: fetch to /api (+ errors as { error: { code, message } }, spec §8.6).
import { env } from "../../config/env";
import { ApiError } from "../mock/server";
export { ApiError };

export async function http<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${env.apiBase}${path}`, {
      method, headers: body !== undefined ? { "Content-Type": "application/json" } : undefined, body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new ApiError("NETWORK", e instanceof Error ? e.message : "Không kết nối được máy chủ", 0);
  }
  if (!res.ok) {
    let code = "HTTP_" + res.status, message = res.statusText;
    try { const j = await res.json(); if (j?.error) { code = j.error.code; message = j.error.message; } } catch { /* ignore */ }
    throw new ApiError(code, message, res.status);
  }
  return (await res.json()) as T;
}
