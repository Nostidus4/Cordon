import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import CityStage from "../../city3d/CityStage";
import { spreadProp } from "../../stage/logic";
import type { CameraShot, CityStageProps, PickTarget, SceneId } from "../../stage/contract";
import type { Attempt, GraphSnapshot, SimResult } from "../../types";

type H = "look" | "try" | "fix" | "incident" | "locked";
const SHOTS: CameraShot[] = ["overview", "district-minh", "council", "vault", "gate", "shore", { building: "B04" }];

/** Dev harness: /city?harness=1[&scene=look|try|fix|incident|locked][&night=1] drives CityStage with the mock api. */
export default function StageHarness() {
  const q = new URLSearchParams(window.location.search);
  const [scene, setScene] = useState<SceneId>("look");
  const [shot, setShot] = useState<CameraShot>("overview");
  const [graph, setGraph] = useState<GraphSnapshot>();
  const [sim, setSim] = useState<SimResult>();
  const [steps, setSteps] = useState(0);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [locked, setLocked] = useState<string[]>([]);
  const [night, setNight] = useState(q.get("night") !== "0");
  const [picked, setPicked] = useState<string>("");
  const [domain, setDomain] = useState(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    void api.getGraph().then(setGraph);
    return api.subscribe((m) => {
      if (m.type === "graph_updated") void api.getGraph().then(setGraph);
      if (m.type === "attempt") { const w = window as unknown as { __attemptsSeen?: number }; w.__attemptsSeen = (w.__attemptsSeen ?? 0) + 1; }
      if (m.type === "attempt") setAttempts((a) => (a.some((x) => x.id === m.data.id) ? a : [...a, m.data]));
      if (m.type === "reset") { setAttempts([]); setLocked([]); void api.getGraph().then(setGraph); }
    });
  }, []);

  const waitReady = async () => {
    for (let i = 0; i < 400 && ((window as unknown as { __glb?: number }).__glb ?? 0) < 10; i++) await new Promise((r) => setTimeout(r, 500));
    await new Promise((r) => setTimeout(r, 2500));
  };
  const run = async (h: H) => {
    if (timer.current) clearInterval(timer.current);
    setSteps(0);
    if (h === "look") { setScene("look"); setShot("district-minh"); setLocked([]); setAttempts([]); }
    if (h === "try") {
      setScene("try"); setShot("overview"); setLocked([]);
      const r = await api.simulate({ compromised: ["minh"] });
      setSim(r);
      const fixed = q.get("step");
      if (fixed) { await waitReady(); setSteps(Number(fixed)); return; }
      let n = 0;
      timer.current = setInterval(() => { n++; setSteps(n); if (n > 6 && timer.current) clearInterval(timer.current); }, 1100);
    }
    if (h === "fix") { setScene("fix"); setShot("gate"); await api.applyPolicyV2(); setGraph(await api.getGraph()); }
    if (h === "incident") { setScene("incident"); setShot("overview"); setAttempts([]); await waitReady(); void api.runScene4(); }
    if (h === "locked") { setScene("incident"); setShot("district-minh"); await api.lockDistrict({ principalId: "minh", member: "lan" }); setLocked(["minh"]); setGraph(await api.getGraph()); }
  };

  useEffect(() => {
    // ?demo=reverted|blocked|ok: inject one synthetic attempt after the models loaded (visual check of packet outcomes)
    const demo = q.get("demo");
    if (!demo) return;
    void (async () => {
      await api.applyPolicyV2();
      setGraph(await api.getGraph());
      setScene("incident"); setShot("overview");
      await waitReady();
      const base = { scenarioRunId: "demo", step: 1, ts: Math.floor(Date.now() / 1000), displayTime: "14:01", principalId: "minh", reasonCode: null, reasonTextVi: null, reasonTextEn: null, txHash: null, simulated: true, errorRaw: null, block: null, token: null, to: null, toLabel: null, amount: null, keySpentAfter: null, principalSpentAfter: null, source: "server", badge: null } as const;
      const at: Attempt = demo === "blocked"
        ? { ...base, id: 1, signer: "key_minh", signerLabel: "Thẻ anh Minh", action: "raw_call", token: "tSCAM", outcome: "blocked_at_protocol" }
        : demo === "ok"
          ? { ...base, id: 1, signer: "key_agent_data", signerLabel: "Trợ lý Dữ liệu", action: "pay", to: "vendor_data_api", outcome: "ok" }
          : { ...base, id: 1, signer: "key_agent_intl_pay", signerLabel: "Trợ lý TTQT", action: "pay", to: "stranger_wallet", outcome: "reverted" };
      (window as unknown as { __t0?: number }).__t0 = performance.now();
      setAttempts([at]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const s = q.get("scene") as H | null;
    if (!s) return;
    void (async () => {
      if (s === "fix" || s === "incident" || s === "locked") { await api.applyPolicyV2(); setGraph(await api.getGraph()); }
      await run(s);
      const sh = q.get("shot");
      if (sh) setShot(sh as CameraShot);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const district = graph?.districts.find((d) => d.principalId === "minh");
  const last = [...attempts].reverse().find((a) => a.principalSpentAfter);
  const sharedCap = district?.dailyCap && last?.principalSpentAfter ? { spent: last.principalSpentAfter.raw, cap: district.dailyCap.raw } : district?.dailyCap ? { spent: "0", cap: district.dailyCap.raw } : null;
  const props: CityStageProps = {
    scene, shot, graph, showDomain: domain, night, attempts, sharedCap, lockedDistricts: locked,
    spread: scene === "try" && graph && sim ? spreadProp(graph, sim, ["minh"], steps) : undefined,
    onPick: (t: PickTarget) => setPicked(t.type === "node" ? t.id : t.code),
  };

  return (
    <main className="fixed inset-0 overflow-hidden text-slate-100">
      <CityStage {...props} />
      <div className="absolute left-3 top-3 z-50 flex flex-wrap gap-1.5 rounded-xl border border-white/15 bg-[#0c1040]/85 p-2 text-xs backdrop-blur">
        {(["look", "try", "fix", "incident", "locked"] as H[]).map((h) => (
          <button key={h} type="button" onClick={() => void run(h)} className="rounded-lg border border-white/25 px-2.5 py-1 hover:bg-white/15">{h}</button>
        ))}
        <span className="mx-1 opacity-40">|</span>
        {SHOTS.map((s, i) => (
          <button key={i} type="button" onClick={() => setShot(s)} className="rounded-lg border border-white/25 px-2 py-1 hover:bg-white/15">{typeof s === "string" ? s : s.building}</button>
        ))}
        <button type="button" onClick={() => setNight(!night)} className="rounded-lg border border-white/25 px-2 py-1">{night ? "night" : "day"}</button>
        <button type="button" onClick={() => setDomain(!domain)} className="rounded-lg border border-white/25 px-2 py-1">domain {domain ? "on" : "off"}</button>
        <button type="button" onClick={() => void api.resetDemo()} className="rounded-lg border border-white/25 px-2 py-1">reset</button>
        <span className="self-center opacity-70">picked: {picked}</span>
      </div>
    </main>
  );
}
