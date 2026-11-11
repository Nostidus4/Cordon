import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Building2, FileCheck2, FlaskConical, Info, Map as MapIcon, ShieldAlert, Users } from "lucide-react";
import { cn } from "../ui";

export const NAV_ITEMS = [
  { to: "/chi-tiet/map", label: "Map", vi: "Bản đồ", icon: MapIcon },
  { to: "/chi-tiet/simulate", label: "Simulate", vi: "Giả lập", icon: FlaskConical },
  { to: "/chi-tiet/incident", label: "Incident", vi: "Sự cố", icon: ShieldAlert },
  { to: "/chi-tiet/requests", label: "Requests", vi: "Đề xuất", icon: FileCheck2 },
  { to: "/chi-tiet/council", label: "Council", vi: "Hội đồng", icon: Users },
  { to: "/chi-tiet/about", label: "About", vi: "Pháp lý", icon: Info },
] as const;

export function NavBar() {
  return (
    <nav aria-label="Điều hướng chính" className="flex h-14 items-center gap-1 border-t border-line px-5">
      {NAV_ITEMS.map(({ to, label, vi, icon: Icon }) => (
        <NavLink key={to} to={to} className={({ isActive }) => cn("relative flex items-center gap-2 rounded-[var(--radius-md)] px-4 py-2 text-sm font-semibold transition-colors", isActive ? "text-text" : "text-muted hover:text-text hover:bg-white/5")}>
          {({ isActive }) => (
            <>
              {isActive ? <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-[var(--radius-md)] bg-brand-soft ring-1 ring-brand/45" transition={{ type: "spring", stiffness: 480, damping: 38 }} /> : null}
              <Icon className={cn("relative size-4", isActive && "text-brand")} aria-hidden />
              <span className="relative">{label}</span>
              <span className="relative hidden text-xs font-normal text-faint xl:inline">{vi}</span>
            </>
          )}
        </NavLink>
      ))}
      <div className="mx-2 h-5 w-px bg-line" aria-hidden />
      <NavLink to="/" end className="relative flex items-center gap-2 rounded-[var(--radius-md)] px-4 py-2 text-sm font-semibold text-muted transition-colors hover:bg-white/5 hover:text-text">
        <ArrowLeft className="size-4 text-brand" aria-hidden />
        Về thành phố
      </NavLink>
      <NavLink to="/city" className="relative flex items-center gap-2 rounded-[var(--radius-md)] px-4 py-2 text-sm font-semibold text-muted transition-colors hover:bg-white/5 hover:text-text">
        <Building2 className="size-4 text-accent" aria-hidden />
        Thành phố 3D
        <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-accent">3D</span>
      </NavLink>
    </nav>
  );
}
