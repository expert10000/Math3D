// Three 0.181.2 keeps module-wide fallback textures. Each WebGLRenderer adds a
// dispose listener to them, so closing viewers retains their WebGL contexts.
// Remove only this renderer's listeners when its renderer is disposed.
export function threeTextureCleanup() {
  return {
    name: "math3d-three-texture-cleanup",
    enforce: "pre" as const,
    transform(code: string, id: string) {
      if (!id.replace(/\\/g, "/").split("?")[0].endsWith("/three/build/three.module.js")) return;
      const start = code.indexOf("function WebGLTextures( _gl,");
      const end = code.indexOf("function WebGLUtils(", start);
      if (start < 0 || end < 0) throw new Error("Three 0.181.2 WebGLTextures layout changed");
      let textureModule = code.slice(start, end);
      const changes: [string, string][] = [
        ["\tconst _videoTextures = new WeakMap();", "\tconst _videoTextures = new WeakMap();\n\tconst _disposeListenerTextures = new Set();"],
        ["\t\ttexture.removeEventListener( 'dispose', onTextureDispose );", "\t\ttexture.removeEventListener( 'dispose', onTextureDispose );\n\t\t_disposeListenerTextures.delete( texture );"],
        ["\t\t\ttexture.addEventListener( 'dispose', onTextureDispose );", "\t\t\ttexture.addEventListener( 'dispose', onTextureDispose );\n\t\t\t_disposeListenerTextures.add( texture );"],
        ["\tthis.useMultisampledRTT = useMultisampledRTT;", "\tthis.useMultisampledRTT = useMultisampledRTT;\n\tthis.dispose = function () {\n\t\tfor ( const texture of _disposeListenerTextures ) texture.removeEventListener( 'dispose', onTextureDispose );\n\t\t_disposeListenerTextures.clear();\n\t};"],
      ];
      for (const [before, after] of changes) {
        if (textureModule.split(before).length !== 2) throw new Error(`Three 0.181.2 cleanup patch mismatch: ${before.trim()}`);
        textureModule = textureModule.replace(before, after);
      }
      code = code.slice(0, start) + textureModule + code.slice(end);
      const before = "\t\t\tproperties.dispose();\n\t\t\tcubemaps.dispose();";
      if (code.split(before).length !== 2) throw new Error("Three 0.181.2 WebGLRenderer dispose layout changed");
      code = code.replace(before, "\t\t\ttextures.dispose();\n" + before);
      return code;
    },
  };
}
