// Static require paths let Metro bundle the same reviewed PNG previews used by desktop.
import type { ImageSourcePropType } from "react-native";
export const mobileGraphGalleryAssets: Readonly<Record<string, ImageSourcePropType>> = {
  "line-comparison": require("../../../../packages/core/assets/graph2d-gallery/line-comparison.png"),
  "translated-quadratic": require("../../../../packages/core/assets/graph2d-gallery/translated-quadratic.png"),
  "cubic-extrema": require("../../../../packages/core/assets/graph2d-gallery/cubic-extrema.png"),
  "repeated-root": require("../../../../packages/core/assets/graph2d-gallery/repeated-root.png"),
  "reciprocal-pole": require("../../../../packages/core/assets/graph2d-gallery/reciprocal-pole.png"),
  "exponential-log": require("../../../../packages/core/assets/graph2d-gallery/exponential-log.png"),
  "sine-cosine": require("../../../../packages/core/assets/graph2d-gallery/sine-cosine.png"),
  "damped-wave": require("../../../../packages/core/assets/graph2d-gallery/damped-wave.png"),
  "wave-beats": require("../../../../packages/core/assets/graph2d-gallery/wave-beats.png"),
  "sine-derivative": require("../../../../packages/core/assets/graph2d-gallery/sine-derivative.png"),
  "parabola-tangent": require("../../../../packages/core/assets/graph2d-gallery/parabola-tangent.png"),
  "circle-ellipse": require("../../../../packages/core/assets/graph2d-gallery/circle-ellipse.png"),
  "lissajous": require("../../../../packages/core/assets/graph2d-gallery/lissajous.png"),
  "cycloid": require("../../../../packages/core/assets/graph2d-gallery/cycloid.png"),
  "polar-rose": require("../../../../packages/core/assets/graph2d-gallery/polar-rose.png"),
  "archimedean-spiral": require("../../../../packages/core/assets/graph2d-gallery/archimedean-spiral.png"),
  "cardioid": require("../../../../packages/core/assets/graph2d-gallery/cardioid.png"),
  "implicit-conics": require("../../../../packages/core/assets/graph2d-gallery/implicit-conics.png"),
  "strict-disk": require("../../../../packages/core/assets/graph2d-gallery/strict-disk.png"),
  "piecewise-data-gaps": require("../../../../packages/core/assets/graph2d-gallery/piecewise-data-gaps.png"),
};
