type RecordedFrame = { time: number; frameId: string };

/** Resolve a plot click to a recorded frame; never interpolate a scientific sample. */
export function nearestRecordedFrame(frames: readonly RecordedFrame[], fraction: number): number {
  if (!frames.length) throw new TypeError("No recorded time frames");
  const clamped = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
  const target = frames[0].time + clamped * (frames[frames.length - 1].time - frames[0].time);
  let index = 0;
  for (let candidate = 1; candidate < frames.length; candidate++) {
    if (Math.abs(frames[candidate].time - target) < Math.abs(frames[index].time - target)) index = candidate;
  }
  return index;
}
