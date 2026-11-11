import { Color, type Material, type MeshStandardMaterial } from "three";

export interface RimUniforms {
  uRimColor: { value: Color };
  uRim: { value: number };
}
export const makeRim = (): RimUniforms => ({ uRimColor: { value: new Color("#9fe8ff") }, uRim: { value: 0 } });

/** Adds a fresnel rim emissive (silhouette glow) to a standard material, driven by per-building uniforms. */
export function applyRim(mat: Material, rim: RimUniforms) {
  const m = mat as MeshStandardMaterial;
  if (!("isMeshStandardMaterial" in m) || (m as { userData: { rim?: boolean } }).userData.rim) return;
  m.userData.rim = true;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRimColor = rim.uRimColor;
    sh.uniforms.uRim = rim.uRim;
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uRimColor;\nuniform float uRim;")
      .replace(
        "#include <emissivemap_fragment>",
        "#include <emissivemap_fragment>\n totalEmissiveRadiance += uRimColor * uRim * pow(1.0 - saturate(dot(normalize(normal), normalize(vViewPosition))), 5.0);",
      );
  };
  m.customProgramCacheKey = () => "rim1";
  m.needsUpdate = true;
}
