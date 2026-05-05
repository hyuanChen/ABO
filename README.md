# ABO (阿布) - Another Brain Odyssey

> **“你负责探索世界，阿布帮你记住重要的事情。”** 🌍⚔️👑 **把散落的输入，变成一个本地、持续、可沉淀的第二大脑。**

**ABO（阿布）** ，你的“地球OL”专属向导🗺️，也是一场属于你“第二大脑”的奥德赛之旅👣。

它不是单纯的网页爬虫，也不是简单将内容搬进笔记软件的工具。ABO 致力于将你散落的输入，转化为一个本地、持续、可回顾的个人信息系统**（All in one, All in Obsidian）**。

在这个时代，我们最不缺的就是信息，最缺的是沉淀。阿布想做的，就是把你每天追踪的论文、吃灰的收藏，以及当下的状态彻底打通，让它们不再是散落的碎片，**而是真正变成你可回看、可复用、可拓展的个人资产，同时阿布助手也会帮你做系统性的维护和整理，彻底解放双手。**

 [⬇️下载 MacOS Silicon 版本](https://github.com/hyuanChen/ABO/releases/download/v0.1.0/ABO_0.1.0_aarch64.dmg)

> macOS 首次打开会因为没钱付费购买 Apple Developer ID，而提示 `Apple could not verify "ABO" is free of malware`。这时需要手动放行：右键 `ABO.app` -> `打开`，或前往“系统设置 -> 隐私与安全性”里手动允许后再打开。



![intro](./docs/intro.png)

## 有趣人生可视化……

把输入收进来、整理好后，阿布能很好的基于本地数据做一些有趣的人生可视化……

1. `历史兴趣点迁移图`
   根据不同时间段导入的小红书收藏、B 站收藏夹、关注流和论文主题，画出你的兴趣如何从一个主题迁移到另一个主题，从数据的角度体现你心境的变化，比如，可能是从生活区到文学区。

2. `当下生活的突破词`
   结合最近收藏内容、手记关键词、任务状态和情绪记录，识别你当前被什么问题、情绪或主题包围，以及最近出现了哪些可能带来“突围舒适圈”的新输入。分析你的当下状态，给你推荐可以进一步成长的尝试，与你此时跃跃欲试的心境契合。

3. `周期性注意力地图`
   把一周内、一个月内、一个季度内反复出现的主题画出来，观察你的注意力究竟是短期热点驱动，还是在围绕几个长期母题循环深化。

4. `Data driven式自主科研`
   通过对于关键词，关键论文的定向追踪，实现自动化的课题整理，形式完整脉络的wiki。

5. `灵感共振时刻`
   识别不同来源在接近时间里同时指向同一主题的时刻，例如某篇论文、一个 B 站视频和几条小红书收藏都在推你关注同一个问题，这种共振点往往最值得沉淀进 Wiki。

6. `个人主题宇宙`
   从长期积累的数据中生成你的主题网络：哪些主题是中心恒星，哪些只是短暂划过的兴趣流星，哪些正在从边缘走向核心，你真的懂得哪些事情，让摄取过的信息都变成你的知识库。

7. `状态剖面`
   用更准确的数据去说清楚你的成长，而不是只能靠感觉，是否每天往自己想成为的人更靠近一点点。

还有很多这种随着进一步体验和使用反馈，才会慢慢浮现出来的有趣东西……


## ABO 做了什么

很多人的问题不是“没有输入”，而是输入太分散：

- 收藏越来越多，但很少真正回看，缺少系统整理。
- 论文下载了很多，但还记得的论文太少。
- 每天有任务、情绪、精力和健康波动，却很难看见长期规律。
- Obsidian 或本地笔记库里有材料，但缺少持续维护和再利用。

ABO 的目标，是把这些散落输入重新拉回本地，让它们经过筛选、保存、归类、Wiki 化和助手分析，逐渐变成属于你自己的研究资产、注意力资产和成长轨迹。

## 核心功能与数据流

ABO 的功能不是一组孤立页面，而是一条从输入到沉淀再到复用的数据流。

```text
外部输入 -> 主动工具 -> 模块管理 -> 今日情报 -> 情报库 / 文献库 / 手记 -> Wiki -> 助手 / 数据洞察 / 角色主页
```

三条主链可以理解为：

```text
注意力链：平台输入 -> 今日情报 -> 情报库 / Wiki -> 长期注意力画像
研究链：论文发现 -> 今日情报 -> 文献库 / Wiki -> 助手生成判断与 idea
成长链：个人记录 -> 手记 / 数据洞察 -> 角色主页 -> 下一步建议
```

## 三条典型使用路径

```text
情报路径：聚合收藏 / 关注流 / 关键词 -> 今日情报 -> 情报库 -> Internet Wiki -> 长期偏好复盘
论文路径：arXiv / Follow Up -> 今日情报 -> 文献库 -> Literature Wiki -> 助手提炼 idea
成长路径：任务 / 手记 / 状态记录 -> 数据洞察 -> 角色主页 -> 周期复盘 -> 下一步安排
```

## 第一次使用建议

第一次使用 ABO，不需要一次配置所有能力。建议先走一条小而完整的链路：

1. 选择一个本地目录作为情报库和文献库，最好是你愿意长期使用的 Obsidian Vault。
2. 先连接小红书或 B 站 Cookie，手动导入少量收藏或关注流内容。
3. 在今日情报里筛选卡片，保存几条真正有价值的内容。
4. 到情报库确认内容已经写入本地。
5. 再尝试生成或更新 Wiki 页面。
6. 最后让助手基于这些本地材料做总结、对比或下一步计划。

如果你主要做研究，可以从论文追踪开始：先用 arXiv 搜索或 Follow Up 追踪保存少量论文，再进入文献库和 Literature Wiki。

## 一句话总结

我们的slogan是：**“你负责探索世界，阿布帮你记住重要的事情。”**

在这个信息过载的时代，和阿布一起，共同维护你的专属个人据点吧～。



如果你准备好搭建自己的专属精神据点，直接下载软件快速上手吧🚀；

如果需要了解更进一步的完整功能和开发思路，请阅读 [ABO 完整指南](docs/abo-user-guide.md)。

## 阿布的自我介绍

<p align="center">
  <img src="./docs/treasure.png" alt="ABO 情报篇自我介绍" width="32.7%" />
  <img src="./docs/growth.png" alt="ABO 成长篇自我介绍" width="35%" />
  <img src="./docs/paper.png" alt="ABO 论文篇自我介绍" width="31.3%" />
</p>
<p align="center">
  <img src="./docs/base.png" alt="阿布角色设定图" width="48%" />
  <img src="./docs/meme/16x.png" alt="阿布表情与状态图" width="48%" />
</p>




## 具体使用配置

安装这两个 [obsidian ](https://obsidian.md/)和 [codex](https://chatgpt.com/zh-Hans-CN/codex/) 依赖：

```bash
brew install --cask obsidian
brew install --cask codex

codex login
```

- `Obsidian`：用于创建或打开本地 Vault，后续把 ABO 的情报库和文献库指到这个目录。
- `Codex`：用于助手能力；安装后先执行一次 `codex login`。

### 小红书配置

小红书一键测试：

```bash
bash scripts/xhs/open_browser_with_extension.sh
```

它会启动独立浏览器 profile，并加载 `extension/` 下的小红书 bridge 扩展。首次使用时，在这个浏览器实例里登录小红书即可。

若一键测试不行则手动加载：

```text
./extension
```

以 Chrome / Edge 为例（开发者使用的是Edge）：

1. 打开浏览器扩展管理页。
2. 开启“开发者模式”。
3. 选择“加载已解压的扩展程序”。
4. 选择本仓库下的 `extension` 目录。
5. 在同一个浏览器里登录小红书，再回到 ABO 配置 Cookie 或运行小红书工具。

## 继续调试开发

如果你只是想了解 ABO 的功能，读到这里就够了。下面是给继续开发和本地调试的人看的最小说明。

### 环境准备

建议本机具备：

- `Python 3.11+`
- `Node.js 20+`
- `Rust` 与 `Tauri` 开发环境
- 已登录小红书的 `Edge` 或 `Chrome`
- 一个长期沉淀内容的本地目录，最好是 `Obsidian Vault`

### 安装依赖

```bash
npm install
python3 -m pip install -r requirements.txt
```

### 启动桌面应用

推荐直接启动 Tauri 开发环境：

```bash
npm run tauri:fresh-dev
```

这条命令会清理旧端口，并拉起前端、后端和桌面壳。

如果需要分别调试前后端，可以分开运行：

```bash
python3 -m abo.main
npm run dev
```

默认开发服务：

```text
后端：http://127.0.0.1:8765
前端：http://localhost:1420
```

### 小红书浏览器链路调试

如果要调试更稳定的小红书浏览器链路，可以使用：

```bash
bash scripts/xhs/open_browser_with_extension.sh
```

它会启动独立浏览器 profile，并加载 `extension/` 下的小红书 bridge 扩展。首次使用时，在这个浏览器实例里登录小红书即可。

### macOS 封装

生成可分发的 macOS 应用：

```bash
npm run build:mac-app
```

生成 macOS release，并同步更新 Homebrew Cask 信息：

```bash
npm run build:mac-release
```

打包产物会出现在：

```text
release/ABO.app
release/ABO_<version>_<arch>.dmg
```

其中当前仓库默认会生成类似 `ABO_0.1.0_aarch64.dmg` 这样的 Apple Silicon 产物。

#### Homebrew

当前实现已经具备 `Homebrew Cask` 生成能力，但要让最终用户真正通过 `brew install` 使用，还依赖两个外部条件：

1. GitHub Releases 里必须存在标签 `v<version>`，并上传同名资产 `ABO_<version>_<arch>.dmg`
2. `Casks/abo.rb` 必须放在用户可以 `brew tap` 到的仓库里

也就是说，`npm run build:mac-release` 已经解决了“生成 cask 元数据”这一步，但还没有自动解决“发布 release 资产”和“提供一个标准 tap 仓库”这两步。

另外，当前 `scripts/update_homebrew_cask.py` 一次只会为当前构建架构生成一个 cask，并写入 `depends_on arch:`。这对单架构发布是够用的；如果以后要同时支持 Intel 和 Apple Silicon，最好改成 Homebrew 官方推荐的 `arch arm:/intel:` + 双 `sha256` / 双下载地址写法。

#### 以后如何维护

每次发新版本时，建议按这个顺序维护：

1. 更新 `src-tauri/tauri.conf.json` 里的 `version`
2. 运行 `npm run build:mac-release`
3. 检查 `release/ABO.app`、`release/ABO_<version>_<arch>.dmg`、`Casks/abo.rb`
4. 在 GitHub 上创建 `v<version>` release，并上传对应的 DMG
5. 提交当前仓库里的版本号、README 和 `Casks/abo.rb`
6. 如果你使用独立 tap 仓库，再把同一份 `Casks/abo.rb` 同步过去

这里有两个维护细节：

- `Casks/abo.rb` 里的下载地址默认会跟随当前仓库 `origin` remote 自动生成；如果你以后把发布资产放到别的仓库，需要运行 `python3 scripts/update_homebrew_cask.py --repo-slug owner/repo`
- Homebrew 最稳定的做法是单独维护一个 tap 仓库，例如 `hyuanChen/homebrew-abo`；这样用户可以直接用标准 `brew tap hyuanChen/abo`

#### 用户如何通过 Brew 安装和更新

如果你暂时不想单独建 tap 仓库，也可以继续把 `Casks/abo.rb` 放在当前仓库根目录下的 `Casks/`，然后让用户手动指定自定义 tap URL：

```bash
brew tap hyuanChen/abo https://github.com/hyuanChen/ABO
brew install --cask hyuanChen/abo/abo
brew update
brew upgrade --cask hyuanChen/abo/abo
```

这个方案可以工作，但比单独的 `homebrew-abo` tap 更不标准，也更依赖 README 明确说明。



（还未实现）更推荐做法是准备一个独立 tap 仓库，例如 `hyuanChen/homebrew-abo`，并把 `Casks/abo.rb` 放进去。这样用户侧命令最简单：

```bash
brew tap hyuanChen/abo
brew install --cask abo
brew update
brew upgrade --cask abo
```

卸载时可以使用：

```bash
brew uninstall --cask abo
brew uninstall --cask --zap abo
```

## License

This project is licensed under the Apache-2.0 License.
