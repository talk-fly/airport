import AppKit
import WebKit

class MainWindow: NSWindow {
    private var webView: WKWebView!

    init(port: Int) {
        super.init(
            contentRect: NSRect(x: 0, y: 0, width: 1400, height: 900),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )

        self.titlebarAppearsTransparent = true
        self.titleVisibility = .hidden
        self.backgroundColor = NSColor(red: 0x1e/255, green: 0x1e/255, blue: 0x2e/255, alpha: 1) // Catppuccin Mocha base
        self.minSize = NSSize(width: 800, height: 500)
        self.center()

        let config = WKWebViewConfiguration()
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")

        webView = WKWebView(frame: .zero, configuration: config)
        webView.autoresizingMask = [.width, .height]
        webView.setValue(false, forKey: "drawsBackground") // Transparent until content loads

        self.contentView = webView

        let url = URL(string: "http://127.0.0.1:\(port)")!
        webView.load(URLRequest(url: url))
    }
}
