# Android Gallery walkthrough evidence — 2026-09-29

See [GGL07–09 acceptance](../../graph2d-gallery-ggl07-ggl09-acceptance.md) for scope, exact internal APK/source hashes and pending G13 release work. These captures were refreshed on the final installed build. [The manifest](manifest.json) records SHA-256 and byte counts for captured screenshots/hierarchies and actual handoff files.

| Check | Capture |
| --- | --- |
| Fresh Featured browse | [Gallery](final-gallery.png), [scroll without keyboard](final-gallery-scrolled.png), [detail](final-gallery-detail.png) |
| Explicit/editable project | [Two slopes](opened-slopes.png), [reopened `4*x` source](reopened-source.png) |
| Parametric | [Lissajous loops](opened-lissajous.png) |
| Signed polar | [Three-petal rose](opened-rose.png) |
| Implicit | [Circle and hyperbola](opened-conics.png) |
| Inequality | [Strict disk](opened-disk.png) |
| Piecewise and data | [Open endpoint/missing row](opened-gaps.png), [process restart](reopened-gaps.png) |
| Fresh preset launch | [Beating waves](opened-beats.png) |
| Native layout | [Landscape columns](gallery-landscape-cards.png), [150% text](gallery-large-text.png), [150% preview/controls](gallery-large-text-detail.png) |
| Actual Android/Electron exchange | [Desktop return](desktop-return.png), [native imported `5*x`](returned-source.png) |

Actual files: [Android export](native-two-slopes.handoff.json), [Electron return](desktop-return.handoff.json). These are ordinary Graph projects created for this walkthrough. Importing the return on the phone creates an independent copy when the original ID already exists.

Matching `.xml` files contain the UI hierarchies captured with each native screenshot. This evidence covers one Android handset and seven example scenes; it is not a completed six-device production release matrix.
