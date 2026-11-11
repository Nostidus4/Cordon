/// <reference types="node" />
import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { visualizer } from "rollup-plugin-visualizer";

/** Vendor split: the 2D screens never pull three.js, the stage never waits for @xyflow. */
function manualChunks(id: string): string | undefined {
  // Vite's dynamic-import helper must not land inside a heavy vendor chunk (the entry would then import three.js)
  if (id.includes("vite/preload-helper") || id.includes("vite/modulepreload-polyfill")) return "vendor-core";
  if (!id.includes("node_modules")) return undefined;
  const m = (re: RegExp) => re.test(id);
  // tiny libs shared by every group: keep them out of the big vendor chunks so groups do not drag each other in
  if (m(/node_modules\/(zustand|use-sync-external-store|tslib|@babel\/runtime|clsx|classcat|dequal)\//)) return "vendor-core";
  if (m(/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom|@remix-run)\//)) return "vendor-react";
  if (m(/node_modules\/@xyflow\//)) return "vendor-xyflow";
  if (m(/node_modules\/(framer-motion|motion-dom|motion-utils)\//)) return "vendor-motion";
  if (m(/node_modules\/(postprocessing|@react-three\/postprocessing)\//)) return "vendor-postprocessing";
  if (m(/node_modules\/(@react-three\/fiber|@react-three\/drei|three-stdlib|troika-[^/]+|meshline|maath|camera-controls|detect-gpu|@monogrid)\//)) return "vendor-r3f";
  if (m(/node_modules\/three\//)) return "vendor-three";
  return undefined;
}

/** Stage routes only: modulepreload the lazy stage chunk + the 3D runtime chunk (and their static deps) so they download in parallel
 *  with the entry instead of waterfalling (entry -> stage -> runtime -> vendors). Filled into the placeholder in index.html. */
function stagePreload(): PluginOption {
  return {
    name: "stage-modulepreload",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        const bundle = ctx.bundle;
        if (!bundle) return html;
        const chunks = Object.values(bundle).filter((c) => c.type === "chunk");
        const byFile = new Map(chunks.map((c) => [c.fileName, c]));
        const entry = chunks.find((c) => c.isEntry);
        const already = new Set<string>();
        const walk = (f: string) => { if (already.has(f)) return; already.add(f); byFile.get(f)?.imports.forEach(walk); };
        if (entry) walk(entry.fileName); // the entry's own static deps are already modulepreloaded by Vite
        const wanted = new Set<string>();
        const add = (f: string) => { if (already.has(f) || wanted.has(f)) return; wanted.add(f); byFile.get(f)?.imports.forEach(add); };
        for (const c of chunks) if (/^(StagePage|CityRuntime)$/.test(c.name) && c.isDynamicEntry) add(c.fileName);
        const js = [...wanted].map((f) => `add("modulepreload", base + ${JSON.stringify(f)}, "", 1);`).join(" ");
        return html.replace("/*__STAGE_MODULEPRELOAD__*/", js);
      },
    },
  };
}

export default defineConfig({
  // Configurable for static hosting under a sub-path (e.g. GitHub Pages: /Cordon/).
  base: process.env.VITE_BASE ?? "/",
  plugins: [
    react(),
    tailwindcss(),
    stagePreload(),
    // ANALYZE=1 npx vite build  ->  dist/stats.html (treemap, gzip sizes)
    process.env.ANALYZE ? (visualizer({ filename: "dist/stats.html", gzipSize: true, template: "treemap" }) as PluginOption) : null,
  ],
  build: {
    rollupOptions: { output: { manualChunks } },
    chunkSizeWarningLimit: 700,
  },
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:8000" },
  },
  test: {
    globals: true,
  },
});
