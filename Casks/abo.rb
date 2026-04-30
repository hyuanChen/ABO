cask "abo" do
  version "0.1.0"
  sha256 "e8b657d470dc652f154337b996e650fd7f1c6ef6d1149db463ff9e5792208836"

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
