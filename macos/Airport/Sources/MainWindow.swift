import AppKit
import WebKit

class MainWindow: NSWindow {
    private var webView: WKWebView!

    /// Height of the custom title bar in points.
    private let titleBarHeight: CGFloat = 38
    /// X offset to avoid the traffic-light (close/minimize/zoom) buttons.
    private let trafficLightInset: CGFloat = 80

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

    // MARK: - Custom title bar drag handling

    /// Returns true if the given point (in window coordinates) falls within
    /// the draggable region of the custom title bar.
    private func isInTitleBarDragArea(_ pointInWindow: NSPoint) -> Bool {
        guard let contentView = self.contentView else { return false }
        let contentHeight = contentView.frame.height
        // Window coordinates: origin is bottom-left, Y increases upward.
        // Title bar is the top `titleBarHeight` points of the content view.
        return pointInWindow.y >= contentHeight - titleBarHeight
            && pointInWindow.x >= trafficLightInset
    }

    override func sendEvent(_ event: NSEvent) {
        // Only intercept left mouse down events in the title bar drag area.
        guard event.type == .leftMouseDown,
              isInTitleBarDragArea(event.locationInWindow) else {
            super.sendEvent(event)
            return
        }

        // Double-click: standard macOS zoom (maximize / restore).
        if event.clickCount == 2 {
            self.performZoom(nil)
            return
        }

        // Single click: begin manual window drag via event tracking loop.
        let initialMouseLocation = NSEvent.mouseLocation
        let initialWindowOrigin = self.frame.origin

        while true {
            guard let nextEvent = self.nextEvent(
                matching: [.leftMouseDragged, .leftMouseUp]
            ) else { break }

            if nextEvent.type == .leftMouseUp { break }

            let currentMouseLocation = NSEvent.mouseLocation
            let newOrigin = NSPoint(
                x: initialWindowOrigin.x + (currentMouseLocation.x - initialMouseLocation.x),
                y: initialWindowOrigin.y + (currentMouseLocation.y - initialMouseLocation.y)
            )
            self.setFrameOrigin(newOrigin)
        }
    }
}
