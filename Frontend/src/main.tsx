import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "./lib/api";
import { useConnStore } from "./store/connStore";
import { router } from "./router";
import "./styles/index.css";

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onSuccess: () => useConnStore.getState().setApi(true),
    // network failure or 5xx = server unreachable; 4xx are ordinary request errors
    onError: (e) => { if (e instanceof ApiError && (e.status === 0 || e.status >= 500)) useConnStore.getState().setApi(false); },
  }),
  defaultOptions: { queries: { staleTime: 5_000, retry: 1, refetchOnWindowFocus: false } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
