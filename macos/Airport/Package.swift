// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "Airport",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(
            name: "Airport",
            path: "Sources",
            linkerSettings: [
                .linkedFramework("AppKit"),
                .linkedFramework("WebKit"),
            ]
        ),
    ]
)
