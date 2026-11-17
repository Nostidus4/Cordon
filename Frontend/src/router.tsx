// Routes: "/" and "/s/:scene" = the 3D stage (main experience); /he-thong/:tab = technical dashboard; /bang-chung = on-chain proof; /city = raw 3D explorer.
// The old 2D screens (/chi-tiet/*, /map, /simulate, ...) were removed; their paths redirect into /he-thong so old links never 404.
import { lazy, Suspense } from "react";
import { RouteSkeleton } from "./components/layout/RouteSkeleton";
import { createBrowserRouter, Link, Navigate, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
const AppShell = lazy(() => import("./components/layout/AppShell").then((m) => ({ default: m.AppShell })));
const Root = lazy(() => import("./components/layout/Root").then((m) => ({ default: m.Root })));
const StagePage = lazy(() => import("./stage/StagePage"));
const CityPage = lazy(() => import("./pages/city/CityPage"));
const KitPage = lazy(() => import("./pages/kit/KitPage"));
const EvidencePage = lazy(() => import("./pages/evidence/EvidencePage"));
const SystemPage = lazy(() => import("./pages/system/SystemPage"));
const SoundPage = import.meta.env.DEV ? lazy(() => import("./pages/sound/SoundPage")) : null;

/** /city renders full-screen without shell chrome; only a small back pill is overlaid. */
function CityRoute() {
  return (
    <>
      <Suspense fallback={<RouteSkeleton kind="full" />}><CityPage /></Suspense>
      <Link to="/he-thong" className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/15 bg-[#070a1c]/75 px-4 py-2 text-xs font-semibold text-slate-100 backdrop-blur-md transition-colors hover:bg-[#10163f]">
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

/** old 2D screen -> its home in the /he-thong dashboard (query string is preserved by <Redirect>) */
const OLD_SCREENS: Array<[string, string]> = [
  ["map", "chinh-sach"],
  ["simulate", "rui-ro"],
  ["incident", "giao-dich"],
  ["requests", "hoi-dong"],
  ["council", "hoi-dong"],
  ["about", "gioi-thieu"],
];
const oldRedirects = (prefix: string) => OLD_SCREENS.map(([p, tab]) => ({ path: `${prefix}${p}`, element: <Redirect to={`/he-thong/${tab}`} /> }));

/** GitHub Pages serves under /Cordon/: Vite's BASE_URL ("/" locally) without the trailing slash. */
const basename = import.meta.env.BASE_URL.replace(/\/+$/, "") || undefined;

export const router = createBrowserRouter([
  // the stage: a single element for "/" and "/s/:scene" so the canvas never remounts between scenes
  { path: "/", element: <Suspense fallback={<RouteSkeleton kind="stage" />}><StagePage /></Suspense>, children: [{ index: true, element: null }, { path: "s/:scene", element: null }] },
  {
    element: <Suspense fallback={<RouteSkeleton kind="full" />}><Root /></Suspense>,
    children: [
      { path: "city", element: <CityRoute /> },
      // one element for /he-thong and /he-thong/:tab so the live feed never remounts between tabs
      { path: "he-thong", element: <Suspense fallback={<RouteSkeleton kind="full" />}><SystemPage /></Suspense>, children: [{ index: true, element: null }, { path: ":tab", element: null }] },
      // read-only proof page for judges: 2D shell, own path
      { path: "bang-chung", element: <Suspense fallback={<RouteSkeleton kind="full" />}><AppShell /></Suspense>, children: [{ index: true, element: <Suspense fallback={<RouteSkeleton />}><EvidencePage /></Suspense> }] },
      // legacy 2D screens: redirect only
      { path: "chi-tiet", element: <Redirect to="/he-thong/tong-quan" /> },
      ...oldRedirects("chi-tiet/"),
      { path: "chi-tiet/_kit", element: <Redirect to="/_kit" /> },
      { path: "chi-tiet/*", element: <Redirect to="/he-thong/tong-quan" /> },
      ...oldRedirects(""),
      // dev kit: standalone, inside AppShell only for the header
      { path: "_kit", element: <Suspense fallback={<RouteSkeleton kind="full" />}><AppShell /></Suspense>, children: [{ index: true, element: <Suspense fallback={<RouteSkeleton />}><KitPage /></Suspense> }] },
      ...(SoundPage ? [{ path: "_sound", element: <Suspense fallback={<RouteSkeleton kind="full" />}><SoundPage /></Suspense> }] : []), // dev only: audition every cue
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
], { basename });
