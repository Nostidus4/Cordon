const PATHS: Record<string, string> = {
  B01: "M12 2.5l2.9 6.2 6.6.8-4.9 4.6 1.3 6.6L12 17.4 6.1 20.7l1.3-6.6L2.5 9.5l6.6-.8z",
  B02: "M3 5.5c3-1 6-1 9 1 3-2 6-2 9-1v13c-3-1-6-1-9 1-3-2-6-2-9-1zM12 6.5v13",
  B03: "M5 6.5c0-1.4 3-2.5 7-2.5s7 1.1 7 2.5-3 2.5-7 2.5-7-1.1-7-2.5zM5 6.5v5c0 1.4 3 2.5 7 2.5s7-1.1 7-2.5v-5M5 11.5v5c0 1.4 3 2.5 7 2.5s7-1.1 7-2.5v-5",
  B04: "M2.5 4h3l2.6 11.5h9.8L20.5 7H6.5M10 19.5h.01M17 19.5h.01",
  B05: "M12 2.5l8 3v6c0 5-3.5 8.8-8 10.5-4.5-1.7-8-5.5-8-10.5v-6z",
  B06: "M4 20V12M10 20V6M16 20v-6M22 20H2M5 9l5-4 5 4 5-5",
  B07: "M5 19C5 10 11 4.5 20 4.5c0 9-5.5 14.5-15 14.5zM5 19l8-8",
  B08: "M12 2.5l8 3v6c0 5-3.5 8.8-8 10.5-4.5-1.7-8-5.5-8-10.5v-6zM12 8l1.4 2.8 3.1.4-2.3 2.1.6 3.1L12 14.8 9.2 16.4l.6-3.1-2.3-2.1 3.1-.4z",
};

export function BuildingIcon({ code, className = "h-6 w-6" }: { code: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[code] ?? PATHS.B08} />
    </svg>
  );
}

export function StateDot({ color, glyph, size = 16 }: { color: string; glyph: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold leading-none text-[#0b1030]"
      style={{ background: color, width: size, height: size, fontSize: size * 0.62 }}
    >
      {glyph}
    </span>
  );
}
