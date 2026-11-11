import { useEffect, useRef } from "react";
import { useLocation, useOutlet } from "react-router-dom";
import { motion } from "framer-motion";
import { useHealth } from "../../hooks/useHealth";
import { useUiStore } from "../../store/uiStore";
import { Footer } from "./Footer";
import { NavBar } from "./NavBar";
import { TopBar } from "./TopBar";
import { TourOverlay } from "../../tour/TourOverlay";

/** Shell for all 2D screens. Page area height = `calc(100vh - var(--chrome-h))`; content is max 1440 wide and scrolls with the page. */
export function AppShell() {
  const outlet = useOutlet();
  const { pathname } = useLocation();
  const firstPath = useRef(pathname);
  const { data: health } = useHealth();
  const setDemoMode = useUiStore((s) => s.setDemoMode);
  const mode = useUiStore((s) => s.mode);
  useEffect(() => { if (health) setDemoMode(health.demoMode); }, [health, setDemoMode]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [pathname]);
  return (
    <div className="relative z-10 flex min-h-screen flex-col pb-9">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[200] focus:rounded-md focus:bg-brand focus:px-3 focus:py-2">Bỏ qua điều hướng</a>
      <header className="sticky top-0 z-40 border-b border-line bg-[#070a1c]/80 backdrop-blur-xl">
        <TopBar />
        <NavBar />
        {mode === "replay" ? (
          <div className="flex items-center justify-center gap-2 border-t border-brand/30 bg-brand-soft py-1 text-xs font-medium text-[#d6d1ff]">
            <span aria-hidden>↺</span> Chế độ Replay: phát lại kịch bản đã lưu (dữ liệu không chạy trực tiếp)
          </div>
        ) : null}
      </header>
      <main id="main" className="mx-auto w-full max-w-[1440px] flex-1 px-6 py-6">
        <motion.div key={pathname} initial={pathname === firstPath.current ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
          {outlet}
        </motion.div>
      </main>
      <Footer />
      <TourOverlay />
    </div>
  );
}
