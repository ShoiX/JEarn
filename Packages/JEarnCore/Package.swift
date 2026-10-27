// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "JEarnCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [.library(name: "JEarnCore", targets: ["JEarnCore"])],
    targets: [
        .target(name: "JEarnCore"),
        .testTarget(name: "JEarnCoreTests", dependencies: ["JEarnCore"]),
    ]
)
