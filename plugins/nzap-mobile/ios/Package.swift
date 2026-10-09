// swift-tools-version:5.5

import PackageDescription

let package = Package(
  name: "tauri-plugin-nzap-mobile",
  platforms: [
    .macOS(.v10_13),
    .iOS(.v15),
  ],
  products: [
    .library(
      name: "tauri-plugin-nzap-mobile",
      type: .static,
      targets: ["tauri-plugin-nzap-mobile"])
  ],
  dependencies: [
    .package(name: "Tauri", path: "../.tauri/tauri-api")
  ],
  targets: [
    .target(
      name: "tauri-plugin-nzap-mobile",
      dependencies: [
        .byName(name: "Tauri")
      ],
      path: "Sources")
  ]
)
