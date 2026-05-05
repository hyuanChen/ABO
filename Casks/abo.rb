cask "abo" do
  version "0.1.0"
  sha256 "55cb1352f7a4b80f9892a61c5e45a9ae61a9f0517319859cea9bdf8151590c8b"

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
