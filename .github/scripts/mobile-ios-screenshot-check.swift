import AppKit
import Foundation

guard CommandLine.arguments.count == 2,
      let image = NSImage(contentsOfFile: CommandLine.arguments[1]),
      let tiff = image.tiffRepresentation,
      let pixels = NSBitmapImageRep(data: tiff) else {
  fputs("Cannot read iOS simulator screenshot.\n", stderr)
  exit(1)
}

let step = max(1, pixels.pixelsWide / 80)
var sampled = 0
var nonWhite = 0
for y in stride(from: pixels.pixelsHigh / 5, to: pixels.pixelsHigh * 4 / 5, by: step) {
  for x in stride(from: pixels.pixelsWide / 10, to: pixels.pixelsWide * 9 / 10, by: step) {
    guard let color = pixels.colorAt(x: x, y: y)?.usingColorSpace(.deviceRGB) else { continue }
    sampled += 1
    if min(color.redComponent, min(color.greenComponent, color.blueComponent)) < 0.93 {
      nonWhite += 1
    }
  }
}

print("Simulator content samples: \(nonWhite)/\(sampled) non-white")
guard sampled > 0, nonWhite >= 8 else {
  fputs("Simulator app content is blank after launch.\n", stderr)
  exit(1)
}

guard let background = pixels.colorAt(x: pixels.pixelsWide / 2, y: pixels.pixelsHigh / 2)?.usingColorSpace(.deviceRGB) else {
  fputs("Cannot sample iOS viewport.\n", stderr)
  exit(1)
}

var viewportVariation = 0
for y in stride(from: pixels.pixelsHigh * 30 / 100, to: pixels.pixelsHigh * 75 / 100, by: step) {
  for x in stride(from: pixels.pixelsWide / 10, to: pixels.pixelsWide * 9 / 10, by: step) {
    guard let color = pixels.colorAt(x: x, y: y)?.usingColorSpace(.deviceRGB) else { continue }
    let difference = max(
      abs(color.redComponent - background.redComponent),
      max(abs(color.greenComponent - background.greenComponent), abs(color.blueComponent - background.blueComponent))
    )
    if difference > 0.08 { viewportVariation += 1 }
  }
}

print("Simulator viewport varied samples: \(viewportVariation)")
guard viewportVariation >= 8 else {
  fputs("Simulator 3D viewport is blank after launch.\n", stderr)
  exit(1)
}
