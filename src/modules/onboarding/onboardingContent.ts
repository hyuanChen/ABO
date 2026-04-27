export interface GuideItem {
  label: string;
  summary: string;
}

export interface GuideSection {
  title: string;
  subtitle: string;
  items: GuideItem[];
}

export interface WorkflowGuide {
  title: string;
  goal: string;
  entry: string;
  steps: string[];
  result: string;
}

export const corePromises = [
  {
    title: "把注意力夺回来",
    summary: "从论文、小红书、B 站、收藏夹和关注流抓取有价值的信息，先进入今日情报。",
  },
  {
    title: "把知识留下了",
    summary: "把值得保留的内容保存到情报库或文献库，再生成 Wiki 页面和长期线索。",
  },
  {
    title: "把过去写出来",
    summary: "用助手、手记、待办和数据洞察，把阅读变成研究动作和可复盘节奏。",
  },
];

export const sidebarSections: GuideSection[] = [
  {
    title: "主工作区",
    subtitle: "每天最常用的研究闭环入口。",
    items: [
      { label: "角色主页", summary: "看能量、SAN、今日待办、时间线、能力雷达和成就。" },
      { label: "助手", summary: "让 Codex 结合今日情报、Wiki、文献库和对话上下文推进任务。" },
      { label: "今日情报", summary: "所有定时和手动抓取的卡片先到这里，按论文、社媒、智能组筛选处理。" },
      { label: "数据洞察", summary: "查看 Today、Intelligence Mirror、Wellness Trends、Engagement Depth、Research Focus 和 30-Day Activity。" },
      { label: "情报库", summary: "查看小红书、B 站、知乎等内容沉淀，支持泡泡视图、列表视图、Obsidian/Finder 打开和路径修改。" },
      { label: "文献库", summary: "管理论文和文献资料，支持独立文献库路径、泡泡视图、列表视图和 Obsidian/Finder 打开。" },
      { label: "Wiki", summary: "把情报库与文献库生成 Internet Wiki / Literature Wiki，按页面和脑图回看知识结构。" },
      { label: "手记", summary: "写每日思考，并沉淀周记总结、月度回顾、年度总结。" },
    ],
  },
  {
    title: "自动化模块",
    subtitle: "只负责运行、暂停、诊断和查看效果；配置细节回到主动工具。",
    items: [
      { label: "模块管理", summary: "查看运行中模块、待看内容、近 7 天浏览、本周新增，搜索模块并按全部/运行中/暂停/异常筛选。" },
      { label: "模块详情", summary: "包含运行概览和历史记录，可立即运行、暂停/启用、快速修复、运行诊断。" },
      { label: "可见模块", summary: "arXiv 论文追踪、Semantic Scholar 追踪、小红书追踪、哔哩哔哩追踪。" },
      { label: "TODO 模块", summary: "小宇宙、知乎、文件夹监控默认隐藏，可在设置里的隐藏模块开关重新放出。" },
    ],
  },
  {
    title: "主动工具",
    subtitle: "手动搜索、预览、调试和配置监控的地方；定时任务必须复用这些链路。",
    items: [
      { label: "小红书工具", summary: "包含收藏专辑抓取、主动爬取、关注监控；右上角一键配置 Cookie，内容保存到情报库 xhs/专辑。" },
      { label: "哔哩哔哩工具", summary: "包含动态追踪、收藏整理、关注监控；右上角一键配置 Cookie，再按全关注流、智能分组或指定 UP 入库。" },
      { label: "论文追踪", summary: "包含后续论文、AI 领域论文、关注监控；用于 Follow Up、关键词监控和保存到文献库。" },
      { label: "arXiv API", summary: "即时搜索和浏览 arXiv 论文，适合临时检索、批量预览和保存。" },
      { label: "健康管理", summary: "把今日状态校准、提醒中心、节律轨迹、习惯、每周复盘和恢复曲线放在一起看。" },
    ],
  },
  {
    title: "底部与全局入口",
    subtitle: "确认基础设施是否可用，并进入全局配置。",
    items: [
      { label: "库连接状态", summary: "侧边栏底部显示库已连接或请配置情报库。" },
      { label: "设置", summary: "配置情报调度、社媒 Cookie、AI 助手、外观、头像、快捷键、开发调试和关于信息。" },
      { label: "命令面板", summary: "通过快捷入口快速跳转页面和执行常用动作。" },
      { label: "全局搜索", summary: "在本地内容中快速定位卡片、页面和历史材料。" },
    ],
  },
];

export const nestedSidebarSections: GuideSection[] = [
  {
    title: "Wiki 二级侧边栏",
    subtitle: "进入 Internet Wiki 或 Literature Wiki 后出现。",
    items: [
      { label: "返回知识库", summary: "回到 Wiki 首页，重新选择 Internet Wiki 或 Literature Wiki。" },
      { label: "找页面或关键词", summary: "在当前 Wiki 中搜索页面标题和关键词。" },
      { label: "概览", summary: "查看当前 Wiki 的总览和生成状态。" },
      { label: "Internet Wiki 分类", summary: "文件夹 VKI、对象页、主题页。" },
      { label: "Literature Wiki 分类", summary: "文件夹 VKI、论文页、主题页。" },
    ],
  },
  {
    title: "设置页侧边栏",
    subtitle: "设置页内部用三类标签组织。",
    items: [
      { label: "通用", summary: "情报调度、Cookie 一键配置、监控词条、今日情报偏好、AI 助手、外观、头像、快捷键。" },
      { label: "开发调试", summary: "Feed 流测试和抓取元数据账本，适合排查定时任务与抓取结果。" },
      { label: "关于", summary: "查看 ABO 基本信息和技术栈。" },
    ],
  },
  {
    title: "助手页工作区",
    subtitle: "不是传统侧栏，但承担新手上手时的任务分流。",
    items: [
      { label: "常用助手", summary: "把论文调研、Wiki 维护、情报推进等流程写入对话。" },
      { label: "最近对话", summary: "回到已有任务上下文，避免每次重新解释背景。" },
      { label: "对话推进", summary: "继续输入具体指令、终止当前回复或保留草稿。" },
      { label: "上下文概览", summary: "查看今日情报、知识库状态和数据洞察是否可送进对话。" },
    ],
  },
];

export const configurationFlow = [
  {
    title: "1. 选择两个库",
    body: "情报库保存社媒、收藏、网页和手记材料；文献库保存论文。第一次使用建议先用同一个 Obsidian Vault，熟悉后再拆开。",
  },
  {
    title: "2. 连接账号",
    body: "B 站和小红书使用浏览器 Cookie。一键配置会复用主动工具的 Cookie 读取逻辑，读取后自动测试并写入 ABO 全局配置。",
  },
  {
    title: "3. 配置学术与 AI",
    body: "arXiv 不需要 API Key；Semantic Scholar 可以留空使用内置回退，也可以填自己的 Key。后台 Agent 默认使用 Codex，Claude 暂不支持。",
  },
  {
    title: "4. 设置每日情报",
    body: "默认 09:00 推送。论文、小宇宙、知乎按该时间调度；小红书和 B 站会提前 30 分钟预抓取，保证 Feed 到点可看。",
  },
  {
    title: "5. 先用主动工具试跑",
    body: "第一次不要直接依赖定时任务。先到小红书/B 站/论文追踪工具页跑一次、确认预览和保存结果，再开启长期监控。",
  },
];

export const coreUsageWorkflows: WorkflowGuide[] = [
  {
    title: "配置基础环境",
    goal: "先让 ABO 知道内容保存在哪里、默认用哪个后台 Agent、每天什么时候抓取。",
    entry: "初始化向导或设置 -> 通用",
    steps: [
      "选择情报库路径：小红书、B 站、收藏、网页和手记会保存到这里。",
      "选择文献库路径：arXiv、Semantic Scholar、Follow Up 论文会保存到这里；第一次可以和情报库共用。",
      "连接小红书和 B 站 Cookie：点击一键配置，确认浏览器已登录对应平台。",
      "设置默认后台 Agent：当前只支持 Codex；Claude 暂不支持，会保持灰色不可选。",
      "设置每日情报时间：默认 09:00，小红书和 B 站会提前 30 分钟预抓取。",
    ],
    result: "侧边栏底部显示库已连接；Cookie 状态显示已连接；今日情报调度可以执行。",
  },
  {
    title: "主动爬取获取数据",
    goal: "先手动试跑，确认登录态、筛选条件、预览结果和保存路径都正确。",
    entry: "侧边栏 -> 主动工具",
    steps: [
      "小红书：进入小红书工具，先配置 Cookie，再跑收藏专辑抓取、主动爬取或关注监控实验台。",
      "B 站：进入哔哩哔哩工具，先配置 Cookie，再跑动态追踪、收藏整理或指定 UP 预览。",
      "论文：进入论文追踪或 arXiv API，用关键词、分类、论文标题或 arXiv ID 搜索论文。",
      "预览结果：先看卡片质量、来源、作者、时间、摘要和保存按钮，不要一开始就全量保存。",
      "保存样本：先保存少量结果，回到情报库或文献库确认文件结构正确。",
    ],
    result: "数据以卡片形式出现，并可被保存到情报库或文献库；这一步也是排查定时任务前的标准测试。",
  },
  {
    title: "设置关注监控",
    goal: "把一次性搜索变成每天自动更新的情报来源。",
    entry: "主动工具里的关注监控 / 论文追踪里的关注监控",
    steps: [
      "小红书：配置关键词扫描、关注流扫描、固定博主和博主最新动态；低频小批量更稳定。",
      "B 站：配置常驻关键词、智能分组或固定监督 UP；可先从关注流或智能分组导入。",
      "论文：配置 arXiv 关键词监控，或配置 Semantic Scholar Follow Up 监控。",
      "设置数量和时间窗：控制每次抓取条数、最近天数、排序方式和是否启用关键词过滤。",
      "保存后回到模块管理：确认模块已启用，必要时立即运行一次或运行诊断。",
    ],
    result: "到点后新内容会进入今日情报，长期订阅关键词搜索推送。",
  },
  {
    title: "入库与维护",
    goal: "把值得保留的内容从 Feed 卡片沉淀成可检索、可回看的本地知识库。",
    entry: "今日情报、情报库、文献库、Wiki",
    steps: [
      "在今日情报中先过滤范围：全部情报、论文追踪、社媒关注、小红书、B 站、具体关键词或作者。",
      "对卡片做判断：保存、已读、跳过、打开原文，或交给助手进一步分析。",
      "社媒和收藏保存到情报库；论文保存到文献库；保存后回到对应库检查目录。",
      "用情报库和文献库维护内容：泡泡视图看结构，列表视图定位文件，必要时在 Obsidian 或 Finder 打开。",
      "生成 Wiki：用 Internet Wiki 整理对象和主题，用 Literature Wiki 整理论文、方法和研究主线。",
    ],
    result: "内容不只是堆在 Feed 里，而是进入本地 Markdown、Wiki 页面和可继续分析的长期上下文。",
  },
  {
    title: "助手使用",
    goal: "让助手基于你的本地情报和知识库继续推进，而不是只做泛泛聊天。",
    entry: "侧边栏 -> 助手",
    steps: [
      "先看上下文概览：确认今日情报、知识库状态和数据洞察是否已经就位。",
      "选择常用助手：论文调研、Wiki 维护、情报推进等任务会自动生成更合适的提示词。",
      "把具体材料交给助手：可以引用今日情报、某个 Wiki 页面、某篇论文、某个路径或最近对话。",
      "要求明确产出：让助手输出下一步实验、阅读清单、Wiki 页面草稿、研究 idea 或待办。",
      "保留连续上下文：从最近对话继续，而不是每次重新解释背景。",
    ],
    result: "助手变成研究推进器：把抓到的内容变成判断、结构、计划和下一步行动。",
  },
];

export const dailyWorkflow = [
  "打开今日情报，先用全部情报、论文追踪、社媒关注等过滤把范围缩小。",
  "对值得保留的卡片做保存、已读、跳过或进一步追问。",
  "论文保存到文献库；社媒和收藏保存到情报库。",
  "进入 Wiki 生成或更新 Internet Wiki / Literature Wiki，把零散材料变成页面网络。",
  "回到助手或手记，把今天的线索变成下一步实验、阅读清单或复盘。",
];

export const guideDocumentPath = "docs/abo-user-guide.md";
