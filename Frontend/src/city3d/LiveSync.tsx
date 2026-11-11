import { useEffect } from "react";
import { useCityStates } from "../hooks/useCityStates";
import { useStream } from "../hooks/useStream";
import { useCityStore } from "./cityStore";

/** Feeds cityStore from GET /city/states and the `city_updated` stream (no UI). Shown only while source === "live". */
export default function LiveSync() {
  const q = useCityStates();
  const applyLive = useCityStore((s) => s.applyLive);
  useEffect(() => {
    if (q.data) applyLive(q.data);
  }, [q.data, applyLive]);
  useStream((m) => {
    if (m.type === "city_updated") applyLive(m.data);
  }, ["city_updated"]);
  return null;
}
