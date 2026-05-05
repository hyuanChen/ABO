cask "abo" do
  version "0.1.0"
  sha256 "2bdd499818562feea18b175cb09424825648118e16340eb82c6fac9528030222"

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
