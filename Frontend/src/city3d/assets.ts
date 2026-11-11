/** Public asset URL relative to Vite's base (works under /Cordon/ on GitHub Pages). */
export const asset = (p: string) => import.meta.env.BASE_URL + p.replace(/^\//, "");
export const DRACO = asset("draco/");
