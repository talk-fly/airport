import Foundation
import AppKit

class Updater {
    private static let lastCheckKey = "AirportLastUpdateCheck"
    private static let checkInterval: TimeInterval = 3600 // 1 hour
    private static let repoOwner = "tomer-van-cohen"
    private static let repoName = "airport"

    static func checkForUpdatesInBackground() {
        DispatchQueue.global(qos: .utility).async {
            checkForUpdates()
        }
    }

    private static func checkForUpdates() {
        let lastCheck = UserDefaults.standard.double(forKey: lastCheckKey)
        if Date().timeIntervalSince1970 - lastCheck < checkInterval {
            return
        }

        UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: lastCheckKey)

        guard let currentVersion = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String else {
            return
        }

        let urlString = "https://api.github.com/repos/\(repoOwner)/\(repoName)/releases/latest"
        guard let url = URL(string: urlString) else { return }

        var request = URLRequest(url: url)
        request.setValue("application/vnd.github.v3+json", forHTTPHeaderField: "Accept")
        request.timeoutInterval = 15

        let semaphore = DispatchSemaphore(value: 0)
        var responseData: Data?

        let task = URLSession.shared.dataTask(with: request) { data, response, error in
            if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 {
                responseData = data
            }
            semaphore.signal()
        }
        task.resume()
        semaphore.wait()

        guard let data = responseData,
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let tagName = json["tag_name"] as? String else {
            return
        }

        let remoteVersion = tagName.hasPrefix("v") ? String(tagName.dropFirst()) : tagName

        guard isNewer(remote: remoteVersion, current: currentVersion) else {
            return
        }

        // Determine architecture
        let arch = getArchitecture()

        guard let assets = json["assets"] as? [[String: Any]],
              let asset = assets.first(where: { ($0["name"] as? String)?.contains(arch) == true && ($0["name"] as? String)?.hasSuffix(".tar.gz") == true }),
              let downloadURL = asset["browser_download_url"] as? String,
              let assetURL = URL(string: downloadURL) else {
            return
        }

        // Show alert on main thread
        DispatchQueue.main.async {
            showUpdateAlert(version: remoteVersion, downloadURL: assetURL)
        }
    }

    private static func isNewer(remote: String, current: String) -> Bool {
        let remoteParts = remote.split(separator: ".").compactMap { Int($0) }
        let currentParts = current.split(separator: ".").compactMap { Int($0) }

        for i in 0..<max(remoteParts.count, currentParts.count) {
            let r = i < remoteParts.count ? remoteParts[i] : 0
            let c = i < currentParts.count ? currentParts[i] : 0
            if r > c { return true }
            if r < c { return false }
        }
        return false
    }

    private static func getArchitecture() -> String {
        var sysinfo = utsname()
        uname(&sysinfo)
        let machine = withUnsafePointer(to: &sysinfo.machine) {
            $0.withMemoryRebound(to: CChar.self, capacity: 1) {
                String(cString: $0)
            }
        }
        return machine.contains("arm64") ? "arm64" : "x86_64"
    }

    private static func showUpdateAlert(version: String, downloadURL: URL) {
        let alert = NSAlert()
        alert.messageText = "Airport Update Available"
        alert.informativeText = "Version \(version) is available. Would you like to download and install it? Airport will restart."
        alert.alertStyle = .informational
        alert.addButton(withTitle: "Update & Restart")
        alert.addButton(withTitle: "Later")

        let response = alert.runModal()
        guard response == .alertFirstButtonReturn else { return }

        DispatchQueue.global(qos: .userInitiated).async {
            performUpdate(downloadURL: downloadURL)
        }
    }

    private static func performUpdate(downloadURL: URL) {
        let tempDir = FileManager.default.temporaryDirectory.appendingPathComponent("airport-update-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: tempDir) }

        do {
            try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)

            // Download
            let tarData = try Data(contentsOf: downloadURL)
            let tarPath = tempDir.appendingPathComponent("update.tar.gz")
            try tarData.write(to: tarPath)

            // Extract
            let extract = Process()
            extract.executableURL = URL(fileURLWithPath: "/usr/bin/tar")
            extract.arguments = ["xzf", tarPath.path, "-C", tempDir.path]
            try extract.run()
            extract.waitUntilExit()

            // Find the .app in extracted contents
            let contents = try FileManager.default.contentsOfDirectory(at: tempDir, includingPropertiesForKeys: nil)
            guard let newApp = contents.first(where: { $0.pathExtension == "app" }) else {
                NSLog("Update failed: no .app found in archive")
                return
            }

            // Replace current app
            let currentApp = URL(fileURLWithPath: Bundle.main.bundlePath)
            let backup = currentApp.deletingLastPathComponent().appendingPathComponent("Airport.app.bak")
            try? FileManager.default.removeItem(at: backup)
            try FileManager.default.moveItem(at: currentApp, to: backup)
            try FileManager.default.moveItem(at: newApp, to: currentApp)
            try? FileManager.default.removeItem(at: backup)

            // Relaunch
            DispatchQueue.main.async {
                let config = NSWorkspace.OpenConfiguration()
                NSWorkspace.shared.openApplication(at: currentApp, configuration: config) { _, _ in
                    NSApp.terminate(nil)
                }
            }
        } catch {
            NSLog("Update failed: \(error.localizedDescription)")
            DispatchQueue.main.async {
                let alert = NSAlert()
                alert.messageText = "Update Failed"
                alert.informativeText = error.localizedDescription
                alert.alertStyle = .warning
                alert.runModal()
            }
        }
    }
}
