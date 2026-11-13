import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BUILDING_IDS, BUILDING_REGISTRY, buildingName } from "./buildings";

const SPEC = new URL("../../../docs/spec/CITY_OPS.md", import.meta.url);

/** Rule ids of the table in spec §1, with `<Bxx>.` expanded to B01..B07. */
function specRuleIds(md: string): string[] {
  const ids = new Set<string>();
  for (const line of md.split("\n")) {
    const m = line.match(/^\| `(<Bxx>|B\d\d)\.([a-z_]+)` \|/);
    if (!m) continue;
    if (m[1] === "<Bxx>") for (const b of BUILDING_IDS.slice(0, 7)) ids.add(`${b}.${m[2]}`);
    else ids.add(`${m[1]}.${m[2]}`);
  }
  return [...ids].sort();
}

describe("buildings registry (CITY_OPS §1)", () => {
  it("has the 8 buildings B01..B08 with names, module, topic, summary", () => {
    expect(BUILDING_IDS).toEqual(["B01", "B02", "B03", "B04", "B05", "B06", "B07", "B08"]);
    expect(BUILDING_REGISTRY.map((b) => b.name)).toEqual(["Hội đồng duyệt", "Trợ lý AI", "Kho tiền có luật", "Cổng chi trả", "Trạm soi giao dịch", "Agent cân đối", "Sổ kiểm toán", "Trung tâm sự cố"]);
    for (const b of BUILDING_REGISTRY) { expect(b.module).toBeTruthy(); expect(b.topic).toBeTruthy(); expect(b.summaryVi.length).toBeGreaterThan(10); }
    expect(buildingName("B04")).toBe("Cổng chi trả");
    expect(buildingName("B99")).toBe("B99");
  });
  it("every rule id is prefixed by its building and unique", () => {
    const all = BUILDING_REGISTRY.flatMap((b) => b.rules.map((r) => ({ b: b.id, r })));
    for (const { b, r } of all) expect(r.id.startsWith(`${b}.`)).toBe(true);
    expect(new Set(all.map((x) => x.r.id)).size).toBe(all.length);
  });
  it("puts the incident rules first on B01..B07 (highest priority)", () => {
    for (const b of BUILDING_REGISTRY.slice(0, 7)) expect(b.rules[0].id).toBe(`${b.id}.incident_open`);
  });
  it.skipIf(!existsSync(SPEC))("rule ids match the table in docs/spec/CITY_OPS.md", () => {
    const expected = specRuleIds(readFileSync(SPEC, "utf8"));
    expect(expected.length).toBeGreaterThan(15);
    expect(BUILDING_REGISTRY.flatMap((b) => b.rules.map((r) => r.id)).sort()).toEqual(expected);
  });
});
