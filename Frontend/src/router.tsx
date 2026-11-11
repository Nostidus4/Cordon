// Routes: "/" and "/s/:scene" = the 3D stage (main experience); the old 2D screens live under /chi-tiet/* (secondary).
// Old top-level paths (/map, /simulate, ...) redirect there. /city (the raw 3D explorer) and /_kit stay as they were.
import { lazy, Suspense } from "react";
import { createBrowserRouter, Link, Navigate, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import MapPage from "./pages/map/MapPage";
import SimulatePage from "./pages/simulate/SimulatePage";
import IncidentPage from "./pages/incident/IncidentPage";
import RequestsPage from "./pages/requests/RequestsPage";
import CouncilPage from "./pages/council/CouncilPage";
import AboutPage from "./pages/about/AboutPage";
import { AppShell } from "./components/layout/AppShell";
import { Root } from "./components/layout/Root";
const StagePage = lazy(() => import("./stage/StagePage"));
const CityPage = lazy(() => import("./pages/city/CityPage"));
const KitPage = lazy(() => import("./pages/kit/KitPage"));
const SystemPage = lazy(() => import("./pages/system/SystemPage"));

/** /city renders full-screen without shell chrome; only a small back pill is overlaid. */
function CityRoute() {
  return (
    <>
      <Suspense fallback={null}><CityPage /></Suspense>
      <Link to="/chi-tiet/map" className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/15 bg-[#070a1c]/75 px-4 py-2 text-xs font-semibold text-slate-100 backdrop-blur-md transition-colors hover:bg-[#10163f]">
        <ArrowLeft className="size-3.5" aria-hidden /> Về bảng điều khiển <kbd className="rounded border border-white/20 px-1 text-[10px] text-slate-300">⌘K</kbd>
      </Link>
    </>
  );
}

/** Keeps the query string (?id=12) when an old path is redirected. */
function Redirect({ to }: { to: string }) {
  const { search } = useLocation();
  return <Navigate to={`${to}${search}`} replace />;
}

const DETAIL = ["map", "simulate", "incident", "requests", "council", "about"] as const;

/** GitHub Pages serves under /Cordon/: Vite's BASE_URL ("/" locally) without the trailing slash. */
const basename = import.meta.env.BASE_URL.replace(/\/+$/, "") || undefined;

export const router = createBrowserRouter([
  // the stage: a single element for "/" and "/s/:scene" so the canvas never remounts between scenes
  { path: "/", element: <Suspense fallback={null}><StagePage /></Suspense>, children: [{ index: true }, { path: "s/:scene" }] },
  {
    element: <Root />,
    children: [
      { path: "city", element: <CityRoute /> },
      // one element for /he-thong and /he-thong/:tab so the live feed never remounts between tabs
      { path: "he-thong", element: <Suspense fallback={null}><SystemPage /></Suspense>, children: [{ index: true }, { path: ":tab" }] },
      {
        path: "chi-tiet",
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="/chi-tiet/map" replace /> },
          { path: "map", element: <MapPage /> },
          { path: "simulate", element: <SimulatePage /> },
          { path: "incident", element: <IncidentPage /> },
          { path: "requests", element: <RequestsPage /> },
          { path: "council", element: <CouncilPage /> },
          { path: "about", element: <AboutPage /> },
          { path: "_kit", element: <Suspense fallback={null}><KitPage /></Suspense> },
        ],
      },
      ...DETAIL.map((p) => ({ path: p, element: <Redirect to={`/chi-tiet/${p}`} /> })),
      { path: "_kit", element: <Redirect to="/chi-tiet/_kit" /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
], { basename });
