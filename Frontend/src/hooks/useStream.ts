// Subscribe to stream messages (SSE in live mode, in-process bus in mock mode).
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useConnStore } from "../store/connStore";
import { toast } from "../store/uiStore";
import type { Attempt, CityStates, Incident, StreamListener, StreamMessage, StreamMessageType } from "../types";
import { qk } from "./queryKeys";

/** Custom subscription; optionally filter by message type. */
export function useStream(listener: StreamListener, types?: StreamMessageType[]) {
  const ref = useRef(listener);
  ref.current = listener;
  const key = types?.join(",") ?? "";
  useEffect(() => api.subscribe((m) => { if (!types || types.includes(m.type)) ref.current(m); }), [key]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Mount once (AppShell): turns stream messages into TanStack Query invalidations / cache patches and toasts. */
export function useStreamBridge() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const navRef = useRef(navigate);
  navRef.current = navigate;
  // SSE came back after a drop: refetch everything so events missed meanwhile are not lost
  useEffect(() => useConnStore.subscribe((s, prev) => { if (s.sseOpen && !prev.sseOpen) qc.invalidateQueries(); }), [qc]);
  useEffect(() => api.subscribe((m: StreamMessage) => {
    switch (m.type) {
      case "event":
        qc.invalidateQueries({ queryKey: qk.events }); qc.invalidateQueries({ queryKey: qk.health }); qc.invalidateQueries({ queryKey: ["district"] }); qc.invalidateQueries({ queryKey: qk.org });
        break;
      case "attempt":
        qc.setQueryData<Attempt[]>(qk.attempts(), (old) => (old?.some((a) => a.id === m.data.id) ? old : [...(old ?? []), m.data]));
        qc.invalidateQueries({ queryKey: ["district"] }); qc.invalidateQueries({ queryKey: qk.graph }); qc.invalidateQueries({ queryKey: ["violations"] });
        break;
      case "graph_updated":
        for (const k of [qk.graph, qk.findings, qk.proposals, qk.health, qk.org, ["district"], ["simulate"]]) qc.invalidateQueries({ queryKey: k });
        break;
      case "proposal_updated":
        qc.invalidateQueries({ queryKey: qk.proposals }); qc.invalidateQueries({ queryKey: qk.findings });
        if (m.data.status === "executed") toast.success(`Đề xuất #${m.data.proposalId} đã thực thi`, "Bản đồ được vẽ lại theo chính sách mới.", { label: "Xem trên Map", onClick: () => navRef.current("/map") });
        break;
      case "agent_run":
        qc.invalidateQueries({ queryKey: qk.health }); qc.invalidateQueries({ queryKey: qk.org }); qc.invalidateQueries({ queryKey: qk.agentRuns });
        break;
      case "city_updated":
        qc.setQueryData<CityStates>(qk.city, m.data);
        qc.invalidateQueries({ queryKey: ["building"] });
        break;
      case "incident_updated": {
        const inc: Incident = m.data;
        for (const status of ["open", "all"] as const) {
          qc.setQueryData<Incident[]>(qk.incidents(status), (old) => {
            const rest = (old ?? []).filter((x) => x.id !== inc.id);
            return status === "open" && inc.status === "resolved" ? rest : [inc, ...rest].sort((a, b) => b.id - a.id);
          });
        }
        qc.invalidateQueries({ queryKey: ["building"] });
        break;
      }
      case "reset":
        qc.invalidateQueries();
        break;
    }
  }), [qc]);
}
