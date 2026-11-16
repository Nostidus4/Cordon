// Live transport: fetch to /api (+ errors as { error: { code, message } }, spec §8.6).
import { env } from "../../config/env";
import { ApiError } from "../mock/server";
export { ApiError };

// Optional shared secret for the signing endpoints (Backend DEMO_SIGNING_TOKEN); only sent on writes.
const demoToken = (import.meta.env as Record<string, string | undefined>).VITE_DEMO_SIGNING_TOKEN;

export async function http<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  let res: Response;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET" && demoToken) headers["X-Demo-Token"] = demoToken;
  try {
    res = await fetch(`${env.apiBase}${path}`, {
      method, headers: Object.keys(headers).length ? headers : undefined, body: body !== undefined ? JSON.stringify(body) : undefined,
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
