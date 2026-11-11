// EventSource client for /api/stream with reconnect (EventSource reconnects itself; we also re-open on hard close).
import { env } from "../config/env";
import { STREAM_TYPES, type StreamListener, type StreamMessage } from "../types";

export function connectSse(onMessage: StreamListener, onStatus?: (open: boolean) => void): () => void {
  let es: EventSource | null = null;
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const open = () => {
    es = new EventSource(`${env.apiBase}/stream`);
    es.onopen = () => onStatus?.(true);
    es.onerror = () => {
      onStatus?.(false);
      if (es && es.readyState === EventSource.CLOSED && !closed) timer = setTimeout(open, 2000);
    };
    for (const t of STREAM_TYPES)
      es.addEventListener(t, (ev) => {
        try { onMessage({ type: t, data: JSON.parse((ev as MessageEvent).data) } as StreamMessage); } catch { /* ignore malformed */ }
      });
  };
  open();
  return () => { closed = true; clearTimeout(timer); es?.close(); };
}
