# Retired Android scaffold

This root Android tree is retained only as historical source. Its Gradle settings
fail intentionally so it cannot produce a second Math3D Android application.
The canonical project is `apps/mobile/android`. Use the root
`mobile:android:debug`, `mobile:android:internal`, or `mobile:android:release`
npm scripts. The root `android` and `ios` npm aliases also route to `apps/mobile`.
Build, signing, verification, and tester installation instructions are in
[`docs/mobile-android-build-and-install.md`](../docs/mobile-android-build-and-install.md).
