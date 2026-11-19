import { describe, expect, it } from "vitest";
import { API_MODE_KEY, resolveApiMode } from "./env";

const store = (init: Record<string, string> = {}) => {
  const m = { ...init };
  return { m, getItem: (k: string) => m[k] ?? null, setItem: (k: string, v: string) => { m[k] = v; } };
};
const base = { search: "", buildMode: "mock" as const, liveAvailable: true };

describe("resolveApiMode", () => {
  it("falls back to the build default", () => {
    expect(resolveApiMode({ ...base, storage: store() })).toBe("mock");
    expect(resolveApiMode({ ...base, buildMode: "live", storage: store() })).toBe("live");
  });
  it("storage beats build default", () => {
    expect(resolveApiMode({ ...base, storage: store({ [API_MODE_KEY]: "live" }) })).toBe("live");
  });
  it("query beats storage and is persisted", () => {
    const s = store({ [API_MODE_KEY]: "live" });
    expect(resolveApiMode({ ...base, search: "?api=mock", storage: s })).toBe("mock");
    expect(s.m[API_MODE_KEY]).toBe("mock");
  });
  it("ignores invalid values", () => {
    expect(resolveApiMode({ ...base, search: "?api=zzz", storage: store({ [API_MODE_KEY]: "nope" }) })).toBe("mock");
  });
  it("ignores live when not available", () => {
    expect(resolveApiMode({ ...base, liveAvailable: false, search: "?api=live", storage: store() })).toBe("mock");
    expect(resolveApiMode({ ...base, liveAvailable: false, storage: store({ [API_MODE_KEY]: "live" }) })).toBe("mock");
  });
  it("survives storage that throws", () => {
    const bad = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(resolveApiMode({ ...base, search: "?api=live", storage: bad })).toBe("live");
    expect(resolveApiMode({ ...base, storage: bad })).toBe("mock");
    expect(resolveApiMode({ ...base, storage: null, search: "?api=live" })).toBe("live");
  });
});
