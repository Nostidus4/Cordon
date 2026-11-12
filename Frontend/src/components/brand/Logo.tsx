// Cordon brand marks. Static SVGs live in public/ (paths, no font needed); BASE_URL keeps them working under /Cordon/.
const url = (f: string) => `${import.meta.env.BASE_URL}${f}`;

/** The hexagonal "C" mark (gradient + glowing dot), square-ish, crisp at 24-32 px. */
export function CordonMark({ size = 28, className, title }: { size?: number; className?: string; title?: string }) {
  return <img src={url("cordon-mark.svg")} width={Math.round((size * 324) / 356)} height={size} alt={title ?? ""} aria-hidden={title ? undefined : true} draggable={false} className={className} style={{ display: "block", flexShrink: 0 }} />;
}

/** Mark + "Cordon" wordmark. `dark` = dark-ink wordmark for the cream toy UI, `light` = white wordmark for dark backgrounds. */
export function CordonLogo({ height = 32, tone = "light", className, title = "Cordon" }: { height?: number; tone?: "light" | "dark"; className?: string; title?: string }) {
  return <img src={url(tone === "dark" ? "cordon-logo-dark.svg" : "cordon-logo-light.svg")} width={Math.round((height * 1112) / 356)} height={height} alt={title} draggable={false} className={className} style={{ display: "block", flexShrink: 0 }} />;
}
