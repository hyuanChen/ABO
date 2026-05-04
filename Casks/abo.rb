cask "abo" do
  version "0.1.0"
  sha256 "2709bdc090915765d265191a5644e6154b8f2e50db1621aed17e008bc13f0f0d"

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
