import { CURVATURE_MAP_COLOURS } from "./savedMeshExploration";
import { studyInteriorStatistics, type SavedStudyComparison } from "./savedStudyComparison";

export const downloadStudyBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob), anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
};
const imageFromData = (url: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new TypeError("Unable to capture the saved Mesh image.")); image.src = url;
});
export const studyComparisonImage = async (comparison: SavedStudyComparison, images: readonly [string, string]): Promise<Blob> => {
  const pictures = await Promise.all(images.map(imageFromData)), canvas = document.createElement("canvas");
  canvas.width = 1600; canvas.height = 1060;
  const ctx = canvas.getContext("2d"); if (!ctx) throw new TypeError("Image export is unavailable.");
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = "#0f172a";
  ctx.font = "bold 30px sans-serif"; ctx.fillText(`Saved Mesh comparison · ${comparison.field === "K" ? "Gaussian K" : "Signed mean H"}`, 28, 44);
  ctx.font = "20px sans-serif";
  ctx.fillText(`Length units: ${comparison.units} · shared scale ${(-comparison.limit).toPrecision(6)} to ${comparison.limit.toPrecision(6)}`, 28, 78);
  const gradient = ctx.createLinearGradient(28, 0, 550, 0);
  gradient.addColorStop(0, CURVATURE_MAP_COLOURS.negative); gradient.addColorStop(.5, CURVATURE_MAP_COLOURS.zero); gradient.addColorStop(1, CURVATURE_MAP_COLOURS.positive);
  ctx.fillStyle = gradient; ctx.fillRect(28, 92, 522, 18); ctx.fillStyle = "#0f172a";
  ctx.fillText("Grey: boundary/invalid vertices · numerical estimates on saved triangle Meshes", 28, 140);
  [comparison.left, comparison.right].forEach((snapshot, index) => {
    const x = 28 + index * 790, picture = pictures[index], stats = studyInteriorStatistics(snapshot);
    ctx.font = "bold 23px sans-serif";
    ctx.fillText(`${index ? "B" : "A"} · ${snapshot.choice.title.slice(0, 55)}`, x, 188, 744);
    ctx.font = "18px sans-serif";
    ctx.fillText(`Mesh r${snapshot.choice.revision} · Surface r${snapshot.choice.sourceRevision ?? "unknown"} · ${snapshot.choice.samplingSize ?? "source-defined"}/axis · ${snapshot.choice.current ? "current" : "historical"}`, x, 219);
    ctx.fillText(snapshot.choice.id, x, 250, 744);
    ctx.fillText(snapshot.choice.structuralHash, x, 278, 744);
    const width = 744, height = Math.min(540, width * picture.height / picture.width);
    ctx.fillStyle = "#f1f5f9"; ctx.fillRect(x, 304, width, 540);
    ctx.drawImage(picture, x, 304 + (540 - height) / 2, width, height); ctx.fillStyle = "#0f172a";
    ctx.fillText(`${stats.count} interior vertices · ${stats.excluded} excluded`, x, 892);
    ctx.fillText(`Mean |H|: ${stats.averageAbsH?.toPrecision(6) ?? "unavailable"} · max |H|: ${stats.maxAbsH?.toPrecision(6) ?? "unavailable"}`, x, 922);
  });
  ctx.font = "18px sans-serif";
  ctx.fillText("K: inverse length² · H: inverse length; input winding for open Meshes, outward orientation for closed Meshes.", 28, 980);
  ctx.fillText("Different sampling distributions are not pointwise error or proof of convergence/minimality.", 28, 1012);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new TypeError("PNG encoding failed.")), "image/png"));
};
