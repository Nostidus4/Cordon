// Subscribe to stream messages (SSE in live mode, in-process bus in mock mode).
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { toast } from "../store/uiStore";
import type { Attempt, CityStates, StreamListener, StreamMessage, StreamMessageType } from "../types";
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
  useEffect(() => api.subscribe((m: StreamMessage) => {
    switch (m.type) {
      case "event":
        qc.invalidateQueries({ queryKey: qk.events }); qc.invalidateQueries({ queryKey: qk.health }); qc.invalidateQueries({ queryKey: ["district"] }); qc.invalidateQueries({ queryKey: qk.org });
        break;
      case "attempt":
        qc.setQueryData<Attempt[]>(qk.attempts(), (old) => (old?.some((a) => a.id === m.data.id) ? old : [...(old ?? []), m.data]));
        qc.invalidateQueries({ queryKey: ["district"] }); qc.invalidateQueries({ queryKey: qk.graph });
        break;
      case "graph_updated":
        for (const k of [qk.graph, qk.findings, qk.proposals, qk.health, qk.org, ["district"], ["simulate"]]) qc.invalidateQueries({ queryKey: k });
        break;
      case "proposal_updated":
        qc.invalidateQueries({ queryKey: qk.proposals }); qc.invalidateQueries({ queryKey: qk.findings });
        if (m.data.status === "executed") toast.success(`Đề xuất #${m.data.proposalId} đã thực thi`, "Bản đồ được vẽ lại theo chính sách mới.", { label: "Xem trên Map", onClick: () => navRef.current("/map") });
        break;
      case "agent_run":
        qc.invalidateQueries({ queryKey: qk.health }); qc.invalidateQueries({ queryKey: qk.org });
        break;
      case "city_updated":
        qc.setQueryData<CityStates>(qk.city, m.data);
        break;
      case "reset":
        qc.invalidateQueries();
        break;
    }
  }), [qc]);
}
