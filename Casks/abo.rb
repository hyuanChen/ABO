cask "abo" do
  version "0.1.0"
  sha256 "d2ca5971806e84c9e06ed29079115cebc41a2e3e4713c0fe5ca67c3ba9869801"

  url "https://github.com/hyuanChen/ABO/releases/download/v#{version}/ABO_#{version}_aarch64.dmg"
  name "ABO"
  desc "Another Brain Odyssey desktop workspace"
  homepage "https://github.com/hyuanChen/ABO"

  depends_on arch: :arm64

  app "ABO.app"

  zap trash: [
    "~/Library/Application Support/ABO App",
    "~/Library/Application Support/com.huanc.abo",
    "~/Library/Application Support/com.abo.app",
  ]
end
