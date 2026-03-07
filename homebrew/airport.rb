cask "airport" do
  version "1.5.2"
  sha256 "..."

  url "https://github.com/tomer-van-cohen/airport/releases/download/v#{version}/Airport-#{Hardware::CPU.arch}.dmg"
  name "Airport"
  desc "Terminal multiplexer for AI coding CLIs"
  homepage "https://github.com/tomer-van-cohen/airport"

  app "Airport.app"
  binary "#{appdir}/Airport.app/Contents/Resources/bin/airport"
end
