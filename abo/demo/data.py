"""
Demo data for promotional screenshots.

Persona: 具身智能博士生 + 文艺复兴式多面手
- Core: Embodied Intelligence / Robotics PhD
- Side: 日语, 炒股, 文学, 存在主义, 科普UP主, 电影, 摄影, 吉他, 羽毛球, 徒步
- Aspiration: 数字游民, FIRE 早退休, Vibe Coding
"""
import random
from datetime import date, datetime, timedelta

# ── Helpers ──────────────────────────────────────────────────────

def _today() -> str:
    return date.today().isoformat()


def _days_ago(n: int) -> str:
    return (date.today() - timedelta(days=n)).isoformat()


def _ts_today(hour: int, minute: int = 0) -> str:
    return f"{_today()}T{hour:02d}:{minute:02d}:00"


def _unix_days_ago(n: int, jitter_hours: int = 0) -> float:
    dt = datetime.now() - timedelta(days=n, hours=random.randint(0, max(0, jitter_hours)))
    return dt.timestamp()


# ── Profile ──────────────────────────────────────────────────────

DEMO_IDENTITY = {
    "codename": "赛博浪人",
    "long_term_goal": "让机器人理解物理世界，像人一样感知、思考、行动",
    "research_field": "Embodied Intelligence / Robotics",
    "affiliation": "",
}

DEMO_MOTTO = {
    "date": _today(),
    "motto": "存在先于本质——但代码先于存在。",
    "description": "精力充沛，研究方向清晰，偶尔陷入关于意义的沉思。",
}


# ── Six Dimensions ───────────────────────────────────────────────

def _dim(score: int, raw: dict) -> dict:
    grades = {80: "A", 60: "B", 40: "C", 20: "D", 0: "E"}
    grade = "E"
    for threshold, g in sorted(grades.items(), reverse=True):
        if score >= threshold:
            grade = g
            break
    return {"score": score, "grade": grade, "raw": raw}


DEMO_STATS = {
    "research":  _dim(72, {"lit_count": 18, "arxiv_stars": 12}),
    "output":    _dim(58, {"meeting_count": 3, "idea_count": 5}),
    "health":    _dim(65, {"note": "羽毛球+徒步, 偶尔熬夜"}),
    "learning":  _dim(81, {"podcast_done": 6, "trend_deep": 5}),
    "san":       _dim(63, {"san_7d_avg": 6.3}),
    "happiness": _dim(74, {"happiness_today": 7.2, "energy_today": 68}),
}


# ── Skills & Achievements ───────────────────────────────────────

DEMO_SKILLS = {
    "research_explorer": {"unlocked_at": "2026-03-15T10:00:00"},
    "paper_diver":       {"unlocked_at": "2026-03-20T14:30:00"},
    "content_creator":   {"unlocked_at": "2026-03-25T09:00:00"},
    "idea_spark":        {"unlocked_at": "2026-04-01T16:00:00"},
    "podcast_listener":  {"unlocked_at": "2026-03-18T20:00:00"},
    "deep_reader":       {"unlocked_at": "2026-04-05T11:00:00"},
    "daily_streaker":    {"unlocked_at": "2026-04-02T08:00:00"},
}

DEMO_ACHIEVEMENTS = [
    {"id": "deep_read",  "name": "深度阅读者",  "unlocked_at": "2026-04-03T10:00:00"},
    {"id": "loop",       "name": "循环不止",    "unlocked_at": "2026-04-08T09:00:00"},
    {"id": "night_owl",  "name": "夜猫子",     "unlocked_at": "2026-03-28T02:30:00"},
]


# ── Todos ────────────────────────────────────────────────────────

def get_demo_todos() -> list:
    return [
        {"id": "t1", "text": "整理 RT-2 论文笔记", "done": True},
        {"id": "t2", "text": "练吉他 30min — Autumn Leaves", "done": True},
        {"id": "t3", "text": "写科普视频脚本：具身智能是什么", "done": False},
        {"id": "t4", "text": "羽毛球约战 @小王", "done": True},
        {"id": "t5", "text": "日语 N2 语法复习 — て形", "done": False},
        {"id": "t6", "text": "提交 ICRA workshop 论文初稿", "done": False},
        {"id": "t7", "text": "看完《银翼杀手2049》影评", "done": True},
    ]


# ── Feed Cards ───────────────────────────────────────────────────

def get_demo_cards() -> list[dict]:
    """Return demo cards with dynamic timestamps."""
    cards = [
        # ── arxiv-tracker ────────────────────────────────────────
        {"id": "demo-arxiv-001", "module_id": "arxiv-tracker",
         "title": "RT-2: Vision-Language-Action Models Transfer Web Knowledge to Robotic Control",
         "summary": "提出视觉-语言-动作模型，将互联网预训练知识迁移到机器人操控中，在真实机器人上实现复杂指令跟随。",
         "tags": ["Embodied AI", "VLA", "Robot Manipulation"], "score": 0.94,
         "source_url": "https://arxiv.org/abs/2307.15818", "days_ago": 0, "feedback": "star"},
        {"id": "demo-arxiv-002", "module_id": "arxiv-tracker",
         "title": "Embodied Chain-of-Thought Reasoning for Robotic Manipulation",
         "summary": "将思维链推理引入具身智能，让机器人在操作前进行分步规划推理，显著提升复杂任务成功率。",
         "tags": ["具身智能", "Chain-of-Thought", "Manipulation"], "score": 0.91,
         "source_url": "https://arxiv.org/abs/2410.00001", "days_ago": 0, "feedback": "save"},
        {"id": "demo-arxiv-003", "module_id": "arxiv-tracker",
         "title": "Diffusion Policy: Visuomotor Policy Learning via Action Diffusion",
         "summary": "将扩散模型应用于机器人策略学习，生成连续动作序列，在接触密集任务上超越现有方法。",
         "tags": ["Diffusion Policy", "Visuomotor", "Robot Learning"], "score": 0.89,
         "source_url": "https://arxiv.org/abs/2303.04137", "days_ago": 1, "feedback": "like"},
        {"id": "demo-arxiv-004", "module_id": "arxiv-tracker",
         "title": "Open X-Embodiment: Robotic Learning Datasets and RT-X Models",
         "summary": "来自 33 个机器人实验室的联合数据集，训练出可跨平台迁移的通用操作模型 RT-X。",
         "tags": ["Open X-Embodiment", "RT-X", "大规模数据"], "score": 0.92,
         "source_url": "https://arxiv.org/abs/2310.08864", "days_ago": 1},
        {"id": "demo-arxiv-005", "module_id": "arxiv-tracker",
         "title": "VoxPoser: Composable 3D Value Maps for Robotic Manipulation",
         "summary": "利用 LLM 和视觉基础模型在 3D 空间中合成价值图，实现零样本机器人操控。",
         "tags": ["VoxPoser", "3D Value Maps", "Zero-shot"], "score": 0.86,
         "source_url": "https://arxiv.org/abs/2307.05973", "days_ago": 2},
        {"id": "demo-arxiv-006", "module_id": "arxiv-tracker",
         "title": "Learning Dexterous Manipulation from Human Demonstration Videos",
         "summary": "从人类演示视频中学习灵巧操作技能，无需遥操作数据，在多种抓取任务上验证。",
         "tags": ["Dexterous", "Video Learning", "Human Demo"], "score": 0.84,
         "source_url": "https://arxiv.org/abs/2410.00002", "days_ago": 2},
        {"id": "demo-arxiv-007", "module_id": "arxiv-tracker",
         "title": "Foundation Models for Sim-to-Real Transfer in Robotics",
         "summary": "综述基础模型在仿真到真实迁移中的应用，提出域随机化与视觉基础模型结合的新范式。",
         "tags": ["Sim-to-Real", "Foundation Models", "Domain Adaptation"], "score": 0.82,
         "source_url": "https://arxiv.org/abs/2410.00003", "days_ago": 3},
        {"id": "demo-arxiv-008", "module_id": "arxiv-tracker",
         "title": "Language-Conditioned Robotic Manipulation with Multi-Modal Prompts",
         "summary": "支持自然语言、图像和视频作为多模态提示输入的机器人操控框架。",
         "tags": ["Multi-Modal", "Language-Conditioned", "Robotics"], "score": 0.80,
         "source_url": "https://arxiv.org/abs/2410.00004", "days_ago": 3},
        {"id": "demo-arxiv-009", "module_id": "arxiv-tracker",
         "title": "Scaling Robot Learning with Semantically Imagined Experience",
         "summary": "用生成模型「想象」语义丰富的训练场景，以极低成本扩展机器人训练数据。",
         "tags": ["Data Augmentation", "Generative", "Robot Learning"], "score": 0.78,
         "source_url": "https://arxiv.org/abs/2410.00005", "days_ago": 4},
        {"id": "demo-arxiv-010", "module_id": "arxiv-tracker",
         "title": "RoboAgent: Generalizable Robot Policy from Internet Videos",
         "summary": "从互联网视频中训练通用机器人策略，实现跨任务跨场景的泛化能力。",
         "tags": ["RoboAgent", "Internet Video", "Generalization"], "score": 0.83,
         "source_url": "https://arxiv.org/abs/2410.00006", "days_ago": 5},

        # ── semantic-scholar-tracker ─────────────────────────────
        {"id": "demo-ss-001", "module_id": "semantic-scholar-tracker",
         "title": "A Survey of Embodied AI: From Simulators to Foundation Models",
         "summary": "全面综述具身智能的演进：从仿真平台到视觉-语言-动作基础模型，梳理核心挑战与未来方向。",
         "tags": ["Embodied AI", "Survey", "Foundation Models"], "score": 0.93,
         "source_url": "https://www.semanticscholar.org/paper/ea001", "days_ago": 1, "feedback": "save"},
        {"id": "demo-ss-002", "module_id": "semantic-scholar-tracker",
         "title": "Bridging Language and Action: LLM-based Robot Planning",
         "summary": "综述大语言模型在机器人任务规划中的应用，包括代码生成、子目标分解和常识推理。",
         "tags": ["LLM Planning", "Robot", "Task Decomposition"], "score": 0.88,
         "source_url": "https://www.semanticscholar.org/paper/ea002", "days_ago": 2},
        {"id": "demo-ss-003", "module_id": "semantic-scholar-tracker",
         "title": "Tactile Sensing for Dexterous In-Hand Manipulation",
         "summary": "触觉传感在灵巧手内操作中的最新进展，涵盖传感器设计、信号处理和策略学习。",
         "tags": ["Tactile", "Dexterous Manipulation", "Sensing"], "score": 0.81,
         "source_url": "https://www.semanticscholar.org/paper/ea003", "days_ago": 3},
        {"id": "demo-ss-004", "module_id": "semantic-scholar-tracker",
         "title": "Towards General-Purpose Robots via Foundation Models",
         "summary": "探讨如何通过视觉-语言基础模型构建通用机器人，分析当前瓶颈和可行路径。",
         "tags": ["General-Purpose", "Foundation Models", "Robotics"], "score": 0.90,
         "source_url": "https://www.semanticscholar.org/paper/ea004", "days_ago": 4},
        {"id": "demo-ss-005", "module_id": "semantic-scholar-tracker",
         "title": "World Models for Autonomous Driving: A Comprehensive Review",
         "summary": "自动驾驶世界模型综述，对比 GAIA-1、DriveDreamer 和 UniSim 等方法。",
         "tags": ["World Models", "Autonomous Driving", "Simulation"], "score": 0.76,
         "source_url": "https://www.semanticscholar.org/paper/ea005", "days_ago": 5},
        {"id": "demo-ss-006", "module_id": "semantic-scholar-tracker",
         "title": "Human-Robot Interaction: A Survey of LLM Integration",
         "summary": "LLM 在人机交互中的集成方式综述，涵盖对话、手势理解和意图推断。",
         "tags": ["HRI", "LLM", "Interaction"], "score": 0.79,
         "source_url": "https://www.semanticscholar.org/paper/ea006", "days_ago": 5},

        # ── xiaohongshu-tracker ──────────────────────────────────
        {"id": "demo-xhs-001", "module_id": "xiaohongshu-tracker",
         "title": "数字游民一年后的真实感受：自由的代价",
         "summary": "在清迈生活一年的数字游民分享：时区差、孤独感、签证焦虑，以及那些意想不到的收获。",
         "tags": ["数字游民", "远程工作", "生活方式"], "score": 0.85,
         "source_url": "https://www.xiaohongshu.com/explore/xhs001", "days_ago": 0, "feedback": "like"},
        {"id": "demo-xhs-002", "module_id": "xiaohongshu-tracker",
         "title": "读博第四年，我终于学会了和焦虑共处",
         "summary": "从 deadline 恐慌到接受不确定性，一个工科博士的心路历程。附正念冥想和运动处方。",
         "tags": ["读博", "焦虑", "心理健康"], "score": 0.88,
         "source_url": "https://www.xiaohongshu.com/explore/xhs002", "days_ago": 1, "feedback": "save"},
        {"id": "demo-xhs-003", "module_id": "xiaohongshu-tracker",
         "title": "日本京都 | 胶片摄影散步记录",
         "summary": "带着 Contax T2 在东山漫步，岚山竹林、哲学之道的光影记录。附胶片选择指南。",
         "tags": ["摄影", "京都", "胶片"], "score": 0.78,
         "source_url": "https://www.xiaohongshu.com/explore/xhs003", "days_ago": 2},
        {"id": "demo-xhs-004", "module_id": "xiaohongshu-tracker",
         "title": "FIRE 运动实践：博士在读也能开始理财",
         "summary": "每月存下奖学金的 40%，用指数基金定投和可转债打底。3 年攒下第一桶金的真实记录。",
         "tags": ["FIRE", "理财", "博士生活"], "score": 0.82,
         "source_url": "https://www.xiaohongshu.com/explore/xhs004", "days_ago": 2, "feedback": "like"},
        {"id": "demo-xhs-005", "module_id": "xiaohongshu-tracker",
         "title": "徒步武功山 | 云海日出太震撼了",
         "summary": "两天一夜武功山穿越攻略：路线、装备、露营点，以及那个让我流泪的日出。",
         "tags": ["徒步", "武功山", "户外"], "score": 0.75,
         "source_url": "https://www.xiaohongshu.com/explore/xhs005", "days_ago": 3},
        {"id": "demo-xhs-006", "module_id": "xiaohongshu-tracker",
         "title": "一个人的吉他练习日常 | 指弹入门第 6 个月",
         "summary": "从零开始学指弹的半年记录。今天终于能完整弹下 Autumn Leaves 了！附练习方法。",
         "tags": ["吉他", "指弹", "音乐"], "score": 0.72,
         "source_url": "https://www.xiaohongshu.com/explore/xhs006", "days_ago": 4},
        {"id": "demo-xhs-007", "module_id": "xiaohongshu-tracker",
         "title": "Obsidian + Zotero：我的论文管理工作流",
         "summary": "用 Obsidian 做读书笔记、Zotero 管参考文献，dataview 自动生成文献综述大纲。",
         "tags": ["Obsidian", "Zotero", "知识管理"], "score": 0.87,
         "source_url": "https://www.xiaohongshu.com/explore/xhs007", "days_ago": 4},
        {"id": "demo-xhs-008", "module_id": "xiaohongshu-tracker",
         "title": "日语 N2 备考 | 在读博期间考过的经验分享",
         "summary": "每天 30 分钟碎片时间备考日语的方法：通勤听力、午休阅读、睡前语法。",
         "tags": ["日语", "N2", "语言学习"], "score": 0.76,
         "source_url": "https://www.xiaohongshu.com/explore/xhs008", "days_ago": 5},

        # ── bilibili-tracker ─────────────────────────────────────
        {"id": "demo-bili-001", "module_id": "bilibili-tracker",
         "title": "【科普】具身智能：让 AI 拥有身体是什么体验",
         "summary": "从 Boston Dynamics 到 Figure 01，用通俗语言讲解具身智能的前世今生和未来展望。",
         "tags": ["科普", "具身智能", "机器人"], "score": 0.92,
         "source_url": "https://www.bilibili.com/video/BV1ea001", "days_ago": 1, "feedback": "like"},
        {"id": "demo-bili-002", "module_id": "bilibili-tracker",
         "title": "Vibe Coding：用自然语言写代码的时代来了",
         "summary": "实测 Claude Code + Cursor，30 分钟做出一个完整的个人网站。编程范式正在改变。",
         "tags": ["Vibe Coding", "AI编程", "Claude"], "score": 0.88,
         "source_url": "https://www.bilibili.com/video/BV1ea002", "days_ago": 1},
        {"id": "demo-bili-003", "module_id": "bilibili-tracker",
         "title": "吉他指弹教学：Autumn Leaves 完整版",
         "summary": "从分解和弦到完整演奏，一步步教你弹爵士经典 Autumn Leaves。附曲谱和伴奏。",
         "tags": ["吉他", "指弹教学", "爵士"], "score": 0.70,
         "source_url": "https://www.bilibili.com/video/BV1ea003", "days_ago": 3},
        {"id": "demo-bili-004", "module_id": "bilibili-tracker",
         "title": "量化投资入门：用 Python 分析 A 股数据",
         "summary": "从 tushare 获取数据到策略回测，手把手教你写第一个量化交易策略。",
         "tags": ["量化投资", "Python", "A股"], "score": 0.79,
         "source_url": "https://www.bilibili.com/video/BV1ea004", "days_ago": 3},
        {"id": "demo-bili-005", "module_id": "bilibili-tracker",
         "title": "加缪《局外人》深度解读：荒诞与反抗",
         "summary": "从莫尔索的冷漠说起，解读加缪的荒诞哲学如何回应「人生有什么意义」这个终极问题。",
         "tags": ["加缪", "存在主义", "文学"], "score": 0.83,
         "source_url": "https://www.bilibili.com/video/BV1ea005", "days_ago": 4, "feedback": "save"},
        {"id": "demo-bili-006", "module_id": "bilibili-tracker",
         "title": "读博生存指南：如何不疯掉地写完毕业论文",
         "summary": "来自过来人的 10 条建议，从选题到答辩，帮你活着毕业。",
         "tags": ["读博", "毕业论文", "生存指南"], "score": 0.85,
         "source_url": "https://www.bilibili.com/video/BV1ea006", "days_ago": 5},
        {"id": "demo-bili-007", "module_id": "bilibili-tracker",
         "title": "【4K】冰岛徒步 | 兰道曼纳劳卡高地纪录片",
         "summary": "穿越彩色火山地貌、冰川和温泉，冰岛高地 Laugavegur 步道全记录。",
         "tags": ["徒步", "冰岛", "纪录片"], "score": 0.74,
         "source_url": "https://www.bilibili.com/video/BV1ea007", "days_ago": 6},
        {"id": "demo-bili-008", "module_id": "bilibili-tracker",
         "title": "日语听力练习 | NHK 新闻每日一听",
         "summary": "精选 NHK 新闻片段，配合逐句翻译和语法解析，适合 N3-N2 水平。",
         "tags": ["日语", "听力", "NHK"], "score": 0.68,
         "source_url": "https://www.bilibili.com/video/BV1ea008", "days_ago": 6},

        # ── zhihu-tracker ────────────────────────────────────────
        {"id": "demo-zhihu-001", "module_id": "zhihu-tracker",
         "title": "具身智能的未来 5 年会怎样发展？",
         "summary": "知乎高赞回答：从数据、模型、硬件三个维度分析具身智能的突破点和投资方向。",
         "tags": ["具身智能", "行业分析", "未来趋势"], "score": 0.93,
         "source_url": "https://www.zhihu.com/question/ea001", "days_ago": 0, "feedback": "save"},
        {"id": "demo-zhihu-002", "module_id": "zhihu-tracker",
         "title": "读博期间如何保持心理健康？",
         "summary": "导师 PUA、论文被拒、同伴压力……过来人分享走出学术抑郁的真实经验。",
         "tags": ["读博", "心理健康", "学术压力"], "score": 0.86,
         "source_url": "https://www.zhihu.com/question/ea002", "days_ago": 1},
        {"id": "demo-zhihu-003", "module_id": "zhihu-tracker",
         "title": "FIRE 运动在中国可行吗？多少钱才能退休？",
         "summary": "从 4% 法则到中国国情调整，计算不同城市实现 FIRE 所需的最低资产。",
         "tags": ["FIRE", "理财", "早退休"], "score": 0.80,
         "source_url": "https://www.zhihu.com/question/ea003", "days_ago": 2, "feedback": "like"},
        {"id": "demo-zhihu-004", "module_id": "zhihu-tracker",
         "title": "人生的意义到底是什么？——一个理工科博士的思考",
         "summary": "从热力学第二定律到加缪的西西弗斯，一个物理博士试图用科学和哲学回答这个永恒问题。",
         "tags": ["存在主义", "哲学", "意义"], "score": 0.89,
         "source_url": "https://www.zhihu.com/question/ea004", "days_ago": 3, "feedback": "save"},
        {"id": "demo-zhihu-005", "module_id": "zhihu-tracker",
         "title": "Vibe Coding 会取代传统编程吗？",
         "summary": "对比手写代码与 AI 辅助编程的效率和质量差异，讨论程序员的未来角色。",
         "tags": ["Vibe Coding", "AI编程", "未来"], "score": 0.81,
         "source_url": "https://www.zhihu.com/question/ea005", "days_ago": 4},
        {"id": "demo-zhihu-006", "module_id": "zhihu-tracker",
         "title": "摄影到底是记录还是创造？",
         "summary": "从纪实摄影到街拍美学，探讨按下快门那一刻的主观性和客观性。",
         "tags": ["摄影", "美学", "创造"], "score": 0.72,
         "source_url": "https://www.zhihu.com/question/ea006", "days_ago": 5},
        {"id": "demo-zhihu-007", "module_id": "zhihu-tracker",
         "title": "作为科研人如何看待数字游民生活方式？",
         "summary": "几位已经实现远程科研的学者分享经验：哪些研究方向适合，工具链和日程管理。",
         "tags": ["数字游民", "远程科研", "生活方式"], "score": 0.78,
         "source_url": "https://www.zhihu.com/question/ea007", "days_ago": 6},
        {"id": "demo-zhihu-008", "module_id": "zhihu-tracker",
         "title": "加缪、萨特、存在主义：对当代青年的意义",
         "summary": "当代人的精神困境与存在主义哲学的对话，为什么「荒诞的反抗」比「虚无的摆烂」更有力量。",
         "tags": ["存在主义", "加缪", "萨特"], "score": 0.84,
         "source_url": "https://www.zhihu.com/question/ea008", "days_ago": 6},

        # ── xiaoyuzhou-tracker ───────────────────────────────────
        {"id": "demo-xyz-001", "module_id": "xiaoyuzhou-tracker",
         "title": "随机波动 | AI 时代，人还需要身体吗？",
         "summary": "从现象学和具身认知出发，讨论身体经验对智能的不可替代性。嘉宾是一位具身智能研究者。",
         "tags": ["具身认知", "AI", "哲学"], "score": 0.90,
         "source_url": "https://www.xiaoyuzhoufm.com/episode/ea001", "days_ago": 1, "feedback": "save"},
        {"id": "demo-xyz-002", "module_id": "xiaoyuzhou-tracker",
         "title": "不合时宜 | 数字游民：逃离还是奔赴？",
         "summary": "采访三位不同阶段的数字游民，讨论自由的真实成本和精神回报。",
         "tags": ["数字游民", "自由", "生活方式"], "score": 0.82,
         "source_url": "https://www.xiaoyuzhoufm.com/episode/ea002", "days_ago": 2},
        {"id": "demo-xyz-003", "module_id": "xiaoyuzhou-tracker",
         "title": "科技早知道 | 具身智能赛道全解析",
         "summary": "从 Figure AI 到特斯拉 Optimus，解析具身智能赛道的商业化前景和技术瓶颈。",
         "tags": ["具身智能", "创业", "行业分析"], "score": 0.87,
         "source_url": "https://www.xiaoyuzhoufm.com/episode/ea003", "days_ago": 3},
        {"id": "demo-xyz-004", "module_id": "xiaoyuzhou-tracker",
         "title": "文化有限 | 读村上春树的日子",
         "summary": "聊聊村上春树的小说世界、爵士乐品味和跑步哲学。为什么他能一直写下去？",
         "tags": ["村上春树", "文学", "日本文化"], "score": 0.75,
         "source_url": "https://www.xiaoyuzhoufm.com/episode/ea004", "days_ago": 4},
        {"id": "demo-xyz-005", "module_id": "xiaoyuzhou-tracker",
         "title": "声东击西 | 为什么我们越来越难感到幸福",
         "summary": "从多巴胺陷阱到积极心理学，讨论现代人的幸福悖论和可能的解法。",
         "tags": ["幸福", "心理学", "思考"], "score": 0.83,
         "source_url": "https://www.xiaoyuzhoufm.com/episode/ea005", "days_ago": 5},
        {"id": "demo-xyz-006", "module_id": "xiaoyuzhou-tracker",
         "title": "日谈公园 | 一个博士的财务自由之路",
         "summary": "从月薪 3000 的博士生到 30 岁实现 coastFIRE，他怎么做到的？",
         "tags": ["FIRE", "博士", "理财"], "score": 0.77,
         "source_url": "https://www.xiaoyuzhoufm.com/episode/ea006", "days_ago": 6},

        # ── folder-monitor ───────────────────────────────────────
        {"id": "demo-fm-001", "module_id": "folder-monitor",
         "title": "[PDF] RT-2_paper_annotated.pdf",
         "summary": "检测到下载目录新增带批注的 RT-2 论文 PDF，23 页，3.8MB。",
         "tags": ["文件监控", "PDF", "论文"], "score": 0.95,
         "source_url": "", "days_ago": 0},
        {"id": "demo-fm-002", "module_id": "folder-monitor",
         "title": "[PDF] 日语N2语法总结.pdf",
         "summary": "检测到 Zotero 同步目录新增日语语法总结文档，42 页，1.2MB。",
         "tags": ["文件监控", "日语", "PDF"], "score": 0.62,
         "source_url": "", "days_ago": 2},
        {"id": "demo-fm-003", "module_id": "folder-monitor",
         "title": "[MD] 2026-04-reading-journal.md",
         "summary": "Obsidian Vault 中的阅读日记被修改，新增关于《局外人》的读书笔记。",
         "tags": ["文件监控", "日记", "Obsidian"], "score": 0.55,
         "source_url": "", "days_ago": 3},
        {"id": "demo-fm-004", "module_id": "folder-monitor",
         "title": "[RAW] 京都_樱花_001.CR3",
         "summary": "检测到摄影目录新增 Canon RAW 文件，京都樱花系列第 1 张。",
         "tags": ["文件监控", "摄影", "RAW"], "score": 0.42,
         "source_url": "", "days_ago": 5},
    ]

    # Build final card dicts with dynamic timestamps
    result = []
    for c in cards:
        result.append({
            "id": c["id"],
            "module_id": c["module_id"],
            "title": c["title"],
            "summary": c["summary"],
            "tags": c["tags"],
            "score": c["score"],
            "source_url": c.get("source_url", ""),
            "obsidian_path": f"Demo/{c['id']}.md",
            "created_at": _unix_days_ago(c.get("days_ago", 0), jitter_hours=8),
            "read": c.get("feedback") is not None,
            "feedback": c.get("feedback"),
            "metadata": {"demo": True},
        })
    return result


# ── Keyword Preferences ─────────────────────────────────────────

DEMO_KEYWORD_PREFS = {
    "Embodied Intelligence": {"score": 0.95, "count": 28, "source_modules": ["arxiv-tracker", "semantic-scholar-tracker", "zhihu-tracker"]},
    "具身智能":              {"score": 0.93, "count": 25, "source_modules": ["zhihu-tracker", "bilibili-tracker", "xiaoyuzhou-tracker"]},
    "Robot Manipulation":    {"score": 0.88, "count": 19, "source_modules": ["arxiv-tracker", "semantic-scholar-tracker"]},
    "Sim-to-Real":           {"score": 0.82, "count": 12, "source_modules": ["arxiv-tracker", "semantic-scholar-tracker"]},
    "Foundation Models":     {"score": 0.85, "count": 16, "source_modules": ["arxiv-tracker", "semantic-scholar-tracker"]},
    "Diffusion Policy":      {"score": 0.80, "count": 10, "source_modules": ["arxiv-tracker"]},
    "Vibe Coding":           {"score": 0.77, "count": 9,  "source_modules": ["bilibili-tracker", "zhihu-tracker"]},
    "数字游民":              {"score": 0.75, "count": 11, "source_modules": ["xiaohongshu-tracker", "zhihu-tracker", "xiaoyuzhou-tracker"]},
    "FIRE":                  {"score": 0.72, "count": 8,  "source_modules": ["xiaohongshu-tracker", "zhihu-tracker", "xiaoyuzhou-tracker"]},
    "读博":                  {"score": 0.73, "count": 14, "source_modules": ["xiaohongshu-tracker", "zhihu-tracker", "bilibili-tracker"]},
    "存在主义":              {"score": 0.70, "count": 7,  "source_modules": ["zhihu-tracker", "bilibili-tracker"]},
    "日语":                  {"score": 0.68, "count": 9,  "source_modules": ["xiaohongshu-tracker", "bilibili-tracker"]},
    "摄影":                  {"score": 0.65, "count": 6,  "source_modules": ["xiaohongshu-tracker"]},
    "吉他":                  {"score": 0.62, "count": 5,  "source_modules": ["xiaohongshu-tracker", "bilibili-tracker"]},
    "科普":                  {"score": 0.71, "count": 8,  "source_modules": ["bilibili-tracker"]},
    "Robotics":              {"score": 0.90, "count": 22, "source_modules": ["arxiv-tracker", "semantic-scholar-tracker"]},
    "徒步":                  {"score": 0.60, "count": 5,  "source_modules": ["xiaohongshu-tracker", "bilibili-tracker"]},
    "文学":                  {"score": 0.66, "count": 6,  "source_modules": ["bilibili-tracker", "xiaoyuzhou-tracker"]},
    "量化投资":              {"score": 0.63, "count": 4,  "source_modules": ["bilibili-tracker", "zhihu-tracker"]},
}


# ── Activity Timeline ───────────────────────────────────────────

def get_demo_activities() -> list[dict]:
    """Return today's demo activity timeline."""
    return [
        {"id": "a01", "type": "card_view",  "timestamp": _ts_today(8, 15), "card_title": "RT-2: Vision-Language-Action Models", "module_id": "arxiv-tracker", "metadata": {}},
        {"id": "a02", "type": "card_like",   "timestamp": _ts_today(8, 22), "card_title": "RT-2: Vision-Language-Action Models", "module_id": "arxiv-tracker", "metadata": {"action": "star"}},
        {"id": "a03", "type": "card_save",   "timestamp": _ts_today(8, 45), "card_title": "Embodied Chain-of-Thought Reasoning", "module_id": "arxiv-tracker", "metadata": {}},
        {"id": "a04", "type": "card_view",   "timestamp": _ts_today(9, 10), "card_title": "数字游民一年后的真实感受", "module_id": "xiaohongshu-tracker", "metadata": {}},
        {"id": "a05", "type": "card_like",   "timestamp": _ts_today(9, 15), "card_title": "数字游民一年后的真实感受", "module_id": "xiaohongshu-tracker", "metadata": {}},
        {"id": "a06", "type": "chat_start",  "timestamp": _ts_today(9, 30), "card_title": None, "module_id": None, "metadata": {"topic": "讨论 Diffusion Policy 在机械臂上的应用"}},
        {"id": "a07", "type": "chat_message","timestamp": _ts_today(9, 45), "card_title": None, "module_id": None, "metadata": {"topic": "对比 RT-2 和 Diffusion Policy 的优劣"}},
        {"id": "a08", "type": "card_view",   "timestamp": _ts_today(10, 5), "card_title": "读博第四年的焦虑共处", "module_id": "xiaohongshu-tracker", "metadata": {}},
        {"id": "a09", "type": "card_save",   "timestamp": _ts_today(10, 8), "card_title": "读博第四年的焦虑共处", "module_id": "xiaohongshu-tracker", "metadata": {}},
        {"id": "a10", "type": "module_run",  "timestamp": _ts_today(10, 30), "card_title": None, "module_id": "arxiv-tracker", "metadata": {"status": "success", "cards_count": 10}},
        {"id": "a11", "type": "card_view",   "timestamp": _ts_today(11, 0), "card_title": "具身智能：让 AI 拥有身体", "module_id": "bilibili-tracker", "metadata": {}},
        {"id": "a12", "type": "card_like",   "timestamp": _ts_today(11, 5), "card_title": "具身智能：让 AI 拥有身体", "module_id": "bilibili-tracker", "metadata": {}},
        {"id": "a13", "type": "checkin",     "timestamp": _ts_today(11, 20), "card_title": None, "module_id": None, "metadata": {"san": 65, "happiness": 72}},
        {"id": "a14", "type": "card_view",   "timestamp": _ts_today(13, 0), "card_title": "具身智能的未来5年", "module_id": "zhihu-tracker", "metadata": {}},
        {"id": "a15", "type": "card_save",   "timestamp": _ts_today(13, 10), "card_title": "具身智能的未来5年", "module_id": "zhihu-tracker", "metadata": {}},
        {"id": "a16", "type": "card_view",   "timestamp": _ts_today(14, 30), "card_title": "FIRE运动在中国可行吗", "module_id": "zhihu-tracker", "metadata": {}},
        {"id": "a17", "type": "card_like",   "timestamp": _ts_today(14, 35), "card_title": "FIRE运动在中国可行吗", "module_id": "zhihu-tracker", "metadata": {}},
        {"id": "a18", "type": "card_view",   "timestamp": _ts_today(15, 20), "card_title": "加缪《局外人》深度解读", "module_id": "bilibili-tracker", "metadata": {}},
        {"id": "a19", "type": "card_save",   "timestamp": _ts_today(15, 30), "card_title": "加缪《局外人》深度解读", "module_id": "bilibili-tracker", "metadata": {}},
    ]


# ── SAN / Happiness / Energy History ─────────────────────────────

def get_demo_san_history() -> list[dict]:
    """30-day SAN history — realistic fluctuation for a PhD student."""
    # Pattern: generally 55-75, dips on thesis stress days, peaks on weekends
    base = [
        62, 58, 55, 60, 65, 72, 75,  # week 1: Monday dip, weekend recovery
        68, 63, 52, 48, 58, 70, 73,  # week 2: midweek crisis (rejection?)
        70, 65, 60, 62, 68, 74, 78,  # week 3: stable recovery
        72, 68, 55, 60, 63, 71, 76,  # week 4: another dip then up
        65, 63,                       # current week
    ]
    result = []
    for i, score in enumerate(base):
        d = 29 - i
        result.append({"date": _days_ago(d), "score": score})
    return result


def get_demo_happiness_history() -> list[dict]:
    """30-day happiness history."""
    base = [
        68, 65, 62, 70, 72, 78, 80,  # week 1
        75, 70, 58, 55, 65, 76, 82,  # week 2: follows SAN pattern loosely
        78, 72, 68, 70, 75, 80, 85,  # week 3
        80, 74, 60, 68, 72, 78, 82,  # week 4
        72, 70,                       # current
    ]
    result = []
    for i, score in enumerate(base):
        d = 29 - i
        result.append({"date": _days_ago(d), "score": score})
    return result


def get_demo_energy_history() -> list[dict]:
    """30-day energy history."""
    base = [
        72, 65, 58, 62, 70, 75, 80,
        68, 60, 50, 45, 62, 72, 78,
        75, 70, 65, 68, 72, 78, 82,
        76, 70, 55, 60, 68, 75, 80,
        68, 65,
    ]
    result = []
    for i, val in enumerate(base):
        d = 29 - i
        result.append({"date": _days_ago(d), "energy": val})
    return result


# ── Insights: Overview ───────────────────────────────────────────

def get_demo_overview() -> dict:
    """Dashboard overview data."""
    daily_trend = []
    for i in range(30):
        d = _days_ago(29 - i)
        # Weekday pattern: more cards on Mon-Fri, fewer on weekends
        day_of_week = (date.today() - timedelta(days=29 - i)).weekday()
        base = random.randint(5, 12) if day_of_week < 5 else random.randint(1, 5)
        daily_trend.append({"date": d, "count": base})

    return {
        "totalCards": 247,
        "thisWeek": 38,
        "lastWeek": 42,
        "dailyTrend": daily_trend,
        "byModule": {
            "arxiv-tracker": 85,
            "semantic-scholar-tracker": 52,
            "xiaohongshu-tracker": 38,
            "bilibili-tracker": 30,
            "zhihu-tracker": 24,
            "xiaoyuzhou-tracker": 12,
            "folder-monitor": 6,
        },
        "topTags": [
            ["Embodied AI", 32], ["具身智能", 28], ["Robot Manipulation", 22],
            ["读博", 18], ["Foundation Models", 16], ["Sim-to-Real", 14],
            ["数字游民", 12], ["Vibe Coding", 10], ["存在主义", 9],
            ["FIRE", 8],
        ],
        "readingStreak": 12,
    }


# ── Insights: Today ─────────────────────────────────────────────

def get_demo_today() -> dict:
    """Today snapshot for dashboard."""
    activities = get_demo_activities()

    # Count by type
    views = sum(1 for a in activities if a["type"] == "card_view")
    likes = sum(1 for a in activities if a["type"] == "card_like")
    saves = sum(1 for a in activities if a["type"] == "card_save")
    chats = sum(1 for a in activities if a["type"] in ("chat_start", "chat_message"))
    module_runs = sum(1 for a in activities if a["type"] == "module_run")

    # Hourly heatmap
    hourly = {h: 0 for h in range(24)}
    for a in activities:
        try:
            h = int(a["timestamp"].split("T")[1].split(":")[0])
            hourly[h] = hourly.get(h, 0) + 1
        except (ValueError, IndexError):
            pass

    todos = get_demo_todos()
    done = sum(1 for t in todos if t["done"])

    return {
        "date": _today(),
        "activityCounts": {
            "total": len(activities),
            "views": views,
            "likes": likes,
            "saves": saves,
            "dislikes": 0,
            "chats": chats,
            "module_runs": module_runs,
        },
        "hourlyHeatmap": [{"hour": h, "count": hourly.get(h, 0)} for h in range(24)],
        "todoProgress": {"total": len(todos), "done": done, "rate": round(done / len(todos), 2) if todos else 0},
        "wellness": {"energy": 68, "san": 6.3, "happiness": 7.2},
        "summary": None,
        "topInteractions": [
            {"id": "demo-arxiv-001", "title": "RT-2: Vision-Language-Action Models", "action": "star"},
            {"id": "demo-arxiv-002", "title": "Embodied Chain-of-Thought Reasoning", "action": "save"},
            {"id": "demo-zhihu-001", "title": "具身智能的未来5年", "action": "save"},
            {"id": "demo-bili-005", "title": "加缪《局外人》深度解读", "action": "save"},
            {"id": "demo-xhs-001", "title": "数字游民一年后的真实感受", "action": "like"},
        ],
    }


# ── Insights: Wellness ───────────────────────────────────────────

def get_demo_wellness() -> dict:
    san = get_demo_san_history()
    happiness = get_demo_happiness_history()
    energy = get_demo_energy_history()

    san_map = {e["date"]: e["score"] for e in san}
    hap_map = {e["date"]: e["score"] for e in happiness}
    eng_map = {e["date"]: e["energy"] for e in energy}

    daily = []
    for i in range(30):
        d = _days_ago(29 - i)
        daily.append({
            "date": d,
            "san": san_map.get(d),
            "happiness": hap_map.get(d),
            "energy": eng_map.get(d),
        })

    # This week avg (last 7 days)
    tw_san = [s["score"] for s in san[-7:]]
    tw_hap = [h["score"] for h in happiness[-7:]]
    tw_eng = [e["energy"] for e in energy[-7:]]

    lw_san = [s["score"] for s in san[-14:-7]]
    lw_hap = [h["score"] for h in happiness[-14:-7]]
    lw_eng = [e["energy"] for e in energy[-14:-7]]

    def _avg(lst: list) -> float:
        return round(sum(lst) / len(lst), 1) if lst else 0.0

    return {
        "daily": daily,
        "thisWeekAvg": {"san": _avg(tw_san), "happiness": _avg(tw_hap), "energy": _avg(tw_eng)},
        "lastWeekAvg": {"san": _avg(lw_san), "happiness": _avg(lw_hap), "energy": _avg(lw_eng)},
    }


# ── Insights: Engagement ────────────────────────────────────────

def get_demo_engagement() -> dict:
    daily_trend = []
    for i in range(30):
        d = _days_ago(29 - i)
        viewed = random.randint(6, 18)
        deep = random.randint(2, min(8, viewed))
        rate = round(deep / viewed, 3) if viewed else 0
        daily_trend.append({"date": d, "viewed": viewed, "deepRead": deep, "rate": rate})

    return {
        "overall": {
            "totalViewed": 247,
            "liked": 68,
            "saved": 45,
            "starred": 12,
            "disliked": 8,
            "skipped": 114,
        },
        "dailyTrend": daily_trend,
        "weekComparison": {
            "thisWeek": {"totalViewed": 38, "liked": 12, "saved": 8, "starred": 3, "disliked": 1, "skipped": 14},
            "lastWeek": {"totalViewed": 42, "liked": 14, "saved": 10, "starred": 2, "disliked": 2, "skipped": 14},
            "cardsDelta": -4,
            "engagementRateDelta": -0.012,
        },
    }


# ── Modules Dashboard ───────────────────────────────────────────

def get_demo_modules_dashboard() -> dict:
    """Module status for dashboard — all healthy and active."""
    now = datetime.utcnow()
    modules = [
        {
            "id": "arxiv-tracker", "name": "arXiv 论文追踪",
            "description": "追踪 arXiv 上符合关键词的最新论文",
            "icon": "book-open", "status": "active", "schedule": "0 8 * * *",
            "last_run": (now - timedelta(hours=3)).isoformat(),
            "next_run": (now + timedelta(hours=5)).isoformat(),
            "stats": {"total_cards": 85, "this_week": 10, "success_rate": 100.0, "last_error": None, "error_count": 0},
            "config": {"keywords": ["embodied intelligence", "robot manipulation", "sim-to-real", "VLA"]},
            "subscriptions": [],
        },
        {
            "id": "semantic-scholar-tracker", "name": "Semantic Scholar 追踪",
            "description": "追踪 Semantic Scholar 上的最新研究",
            "icon": "graduation-cap", "status": "active", "schedule": "0 10 * * *",
            "last_run": (now - timedelta(hours=1)).isoformat(),
            "next_run": (now + timedelta(hours=7)).isoformat(),
            "stats": {"total_cards": 52, "this_week": 6, "success_rate": 100.0, "last_error": None, "error_count": 0},
            "config": {"keywords": ["embodied AI", "foundation models robotics", "tactile manipulation"]},
            "subscriptions": [],
        },
        {
            "id": "xiaohongshu-tracker", "name": "小红书追踪",
            "description": "追踪小红书上的相关内容",
            "icon": "book-heart", "status": "active", "schedule": "0 10 * * *",
            "last_run": (now - timedelta(hours=1)).isoformat(),
            "next_run": (now + timedelta(hours=7)).isoformat(),
            "stats": {"total_cards": 38, "this_week": 8, "success_rate": 95.0, "last_error": None, "error_count": 0},
            "config": {"keywords": ["数字游民", "读博", "摄影", "吉他", "FIRE理财"]},
            "subscriptions": [],
        },
        {
            "id": "bilibili-tracker", "name": "哔哩哔哩追踪",
            "description": "追踪 B站 上的相关视频",
            "icon": "tv", "status": "active", "schedule": "0 11 * * *",
            "last_run": (now - timedelta(hours=2)).isoformat(),
            "next_run": (now + timedelta(hours=6)).isoformat(),
            "stats": {"total_cards": 30, "this_week": 8, "success_rate": 100.0, "last_error": None, "error_count": 0},
            "config": {"keywords": ["具身智能", "Vibe Coding", "吉他教学", "科普", "存在主义"]},
            "subscriptions": [],
        },
        {
            "id": "xiaoyuzhou-tracker", "name": "小宇宙追踪",
            "description": "追踪小宇宙播客",
            "icon": "podcast", "status": "active", "schedule": "0 10 * * *",
            "last_run": (now - timedelta(hours=1)).isoformat(),
            "next_run": (now + timedelta(hours=7)).isoformat(),
            "stats": {"total_cards": 12, "this_week": 6, "success_rate": 100.0, "last_error": None, "error_count": 0},
            "config": {"keywords": ["AI", "数字游民", "哲学", "科技"]},
            "subscriptions": [],
        },
        {
            "id": "zhihu-tracker", "name": "知乎追踪",
            "description": "追踪知乎上的相关内容",
            "icon": "help-circle", "status": "active", "schedule": "0 13 * * *",
            "last_run": (now - timedelta(hours=4)).isoformat(),
            "next_run": (now + timedelta(hours=4)).isoformat(),
            "stats": {"total_cards": 24, "this_week": 8, "success_rate": 100.0, "last_error": None, "error_count": 0},
            "config": {"keywords": ["具身智能", "读博", "FIRE", "存在主义", "Vibe Coding"]},
            "subscriptions": [],
        },
        {
            "id": "folder-monitor", "name": "文件夹监控",
            "description": "监控指定文件夹的变化",
            "icon": "folder-open", "status": "active", "schedule": "*/5 * * * *",
            "last_run": (now - timedelta(minutes=3)).isoformat(),
            "next_run": (now + timedelta(minutes=2)).isoformat(),
            "stats": {"total_cards": 6, "this_week": 4, "success_rate": 100.0, "last_error": None, "error_count": 0},
            "config": {"keywords": []},
            "subscriptions": [],
        },
    ]

    return {
        "modules": modules,
        "summary": {
            "total": 7,
            "active": 7,
            "paused": 0,
            "error": 0,
            "unconfigured": 0,
            "total_cards_this_week": 50,
        },
        "alerts": [],
    }


# ── Unread Counts ────────────────────────────────────────────────

DEMO_UNREAD_COUNTS = {
    "arxiv-tracker": 4,
    "semantic-scholar-tracker": 2,
    "xiaohongshu-tracker": 3,
    "bilibili-tracker": 3,
    "zhihu-tracker": 2,
    "xiaoyuzhou-tracker": 1,
    "folder-monitor": 1,
}


# ── Game Stats ───────────────────────────────────────────────────

DEMO_GAME_STATS = {
    "happiness": 72,
    "san_7d_avg": 63,
    "energy": 68,
    "todos_completed": 4,
    "achievements": DEMO_ACHIEVEMENTS,
}


# ── Full Profile Response ────────────────────────────────────────

def get_demo_profile() -> dict:
    """Complete profile API response."""
    return {
        "identity": DEMO_IDENTITY,
        "daily_motto": DEMO_MOTTO,
        "stats": DEMO_STATS,
        "skills": DEMO_SKILLS,
        "achievements": DEMO_ACHIEVEMENTS,
        "energy": 68,
        "todos": get_demo_todos(),
    }


# ── Preferences Evolution ───────────────────────────────────────

def get_demo_preferences_evolution() -> dict:
    keywords = []
    for kw, data in sorted(DEMO_KEYWORD_PREFS.items(), key=lambda x: (-x[1]["score"], -x[1]["count"])):
        keywords.append({
            "keyword": kw,
            "score": data["score"],
            "count": data["count"],
        })
    return {"keywords": keywords}


# ── Wiki Demo Data ───────────────────────────────────────────────
# Categories: intel → entity / concept;  lit → paper / topic
# Fields must match frontend: slug, title, category, tags, content,
#   sources, wiki_type, backlinks, created, updated

DEMO_WIKI_PAGES_INTEL = [
    # ━━━━━━━━ ENTITY (兴趣 · 技能 · 工具) ━━━━━━━━
    {
        "slug": "japanese-learning",
        "title": "日语学习",
        "category": "entity",
        "tags": ["日语", "JLPT", "N2", "语言学习"],
        "wiki_type": "intel",
        "backlinks": ["norwegian-wood"],
        "created": _days_ago(120),
        "updated": _days_ago(2),
        "sources": ["xiaohongshu-tracker"],
        "content": """# 日语学习

从大二开始学日语，目前 N2 水平，目标是 N1。

## 学习历程

| 阶段 | 时间 | 内容 |
|------|------|------|
| 入门 | 2022 | 五十音 + 标日初级 |
| 进阶 | 2023 | 标日中级 + N3 通过 |
| 当前 | 2024-now | N2 通过，准备 N1 |

## 学习方法

### 输入
- **阅读**: 村上春树原版小说（[[norwegian-wood]] 是第一本读完的）
- **听力**: NHK 新闻 + 日剧（最近在看《重启人生》）
- **播客**: 「ゆる言語学ラジオ」学语言学知识

### 输出
- **会话**: italki 上每周 1-2 次会话练习
- **写作**: 用日语写简短的日记
- **翻译**: 偶尔翻译技术博客练手

## 与研究的交叉

日本在机器人领域有深厚积累（Honda ASIMO、SoftBank Pepper、Unitree 的一些合作伙伴）。能读日语论文和技术文档是一个小优势。

## 资源推荐

- Anki 记忆卡：核心 2000 汉字 + N1 词汇
- 「毎日のニュース」NHK 简易新闻
- 村上春树全集（日语原版）

## 和 [[digital-nomad]] 的关系

日语是数字游民生活的关键技能之一——日本是理想的游牧基地：安全、便利、文化丰富、签证友好。
"""
    },
    {
        "slug": "guitar",
        "title": "吉他",
        "category": "entity",
        "tags": ["吉他", "音乐", "指弹", "创作"],
        "wiki_type": "intel",
        "backlinks": ["norwegian-wood"],
        "created": _days_ago(200),
        "updated": _days_ago(5),
        "sources": ["bilibili-tracker"],
        "content": """# 吉他

高中开始弹吉他，从弹唱到指弹到即兴，现在是日常减压的主要方式。

## 现在在练什么

- **指弹**: 押尾光太郎的《Fight》《翼》
- **弹唱**: 最近在练几首 Radiohead
- **即兴**: 五声音阶 + Blues scale 的即兴练习
- **乐理**: 和声分析，学习 jazz voicings

## 设备

| 类型 | 型号 | 用途 |
|------|------|------|
| 民谣 | Taylor 214ce | 主力弹唱/指弹 |
| 电吉他 | Fender Player Strat | 周末玩 |
| 效果器 | Boss Katana Mini | 宿舍用 |

## 音乐与研究的平行

弹吉他和做研究有一个共同点：**刻意练习**。两者都需要持续重复、及时反馈、逐步提升难度。差别在于吉他的反馈是即时的（音对不对立刻知道），而论文的反馈周期可能长达数月。

## 音乐品味

- **最爱**: Radiohead, 坂本龙一, 押尾光太郎
- **最近发现**: Ichika Nito (B站看到的), toe
- **古典**: 巴赫无伴奏大提琴组曲（偶尔改编到吉他上）

## 与 [[norwegian-wood]] 的连接

Beatles 的 Norwegian Wood 是我学吉他时练的第一首英文歌。后来读了村上的小说，才发现音乐和文学可以这样交织。
"""
    },
    {
        "slug": "photography",
        "title": "摄影",
        "category": "entity",
        "tags": ["摄影", "街拍", "胶片", "风光"],
        "wiki_type": "intel",
        "backlinks": ["hiking"],
        "created": _days_ago(150),
        "updated": _days_ago(3),
        "sources": ["xiaohongshu-tracker"],
        "content": """# 摄影

从手机拍照开始，到微单，再到偶尔玩胶片。摄影是我记录生活和 [[hiking]] 的主要方式。

## 设备

- **主力**: Fujifilm X-T4 + 23mm f/1.4 + 56mm f/1.2
- **胶片**: Olympus MJU II (口袋机)
- **手机**: iPhone (日常记录)

## 风格偏好

- **街拍**: 光影 + 几何构图，受 Fan Ho 影响
- **风光**: 山野、雾、极简构图
- **日常**: 食物、咖啡、书桌、散步路上
- **后期**: Fuji 直出为主，偶尔 Lightroom 微调

## 胶片笔记

最近在用 Kodak Gold 200 和 Fujifilm C200。胶片的不可预测性反而带来惊喜——你永远不知道冲扫出来会是什么效果。

这种「放弃控制」的感觉很有禅意。和 [[existentialism]] 的思考有点像：不追求完美，接受偶然。

## 分享

- 小红书上发风光和街拍
- B站偶尔发摄影 vlog
- 打算整理一个「城市散步」系列
"""
    },
    {
        "slug": "stock-trading",
        "title": "炒股 / 投资",
        "category": "entity",
        "tags": ["投资", "炒股", "指数基金", "FIRE"],
        "wiki_type": "intel",
        "backlinks": ["digital-nomad"],
        "created": _days_ago(100),
        "updated": _days_ago(1),
        "sources": ["zhihu-tracker"],
        "content": """# 炒股 / 投资

作为 [[digital-nomad]] 计划的一部分，投资是被动收入的重要来源。

## 投资策略

### 核心仓位 (80%)
- **A股指数基金**: 沪深300 + 中证500，每月定投
- **美股 ETF**: VTI + VXUS (全球配置)
- **日本市场**: 最近在关注日经225 ETF

### 卫星仓位 (20%)
- 个股（主要是科技股）
- 偶尔做做短线，但发现自己不适合

## 投资哲学

> 投资最大的敌人是自己的情绪。

经历过几次追涨杀跌之后，现在信奉：
1. **定投不择时**
2. **分散不集中**
3. **长期不短炒**
4. **被动大于主动**

## FIRE 计算

目标：35 岁前达到 lean FIRE
- 所需资产：年支出 × 25 ≈ ¥240 万（月支出 ¥8,000 × 12 × 25）
- 当前进度：保密 :)
- 缺口：还需要 [[vibe-coding]] 等副业收入

## 学习资源

- 知乎关注的投资大V
- 播客「知行小酒馆」
- 书：《漫步华尔街》《穷查理宝典》
"""
    },
    {
        "slug": "badminton",
        "title": "羽毛球",
        "category": "entity",
        "tags": ["羽毛球", "运动", "健康"],
        "wiki_type": "intel",
        "backlinks": [],
        "created": _days_ago(180),
        "updated": _days_ago(7),
        "sources": [],
        "content": """# 羽毛球

每周打 2-3 次，是我最主要的运动方式。

## 当前水平

- 业余中上，偶尔参加校内比赛
- 正手高远球和杀球比较稳定
- 反手还需要加强
- 步伐移动是最大短板

## 装备

- **球拍**: YONEX ARC 11 (进攻偏控制)
- **球鞋**: YONEX 65Z3
- **球**: 尤尼克斯 AS-05

## 训练计划

| 项目 | 频率 | 内容 |
|------|------|------|
| 双打 | 2次/周 | 和实验室同学打 |
| 练球 | 1次/周 | 高远球/杀球/网前 |
| 体能 | 2次/周 | 跑步 + 跳绳 |

## 运动与科研

打球是实验室社交的重要方式。很多学术讨论其实发生在球场而不是办公室。

运动对 SAN 值和精力的恢复效果是最显著的——打完球之后整个人会清醒很多，写代码效率也更高。
"""
    },
    {
        "slug": "hiking",
        "title": "徒步",
        "category": "entity",
        "tags": ["徒步", "户外", "风光", "自然"],
        "wiki_type": "intel",
        "backlinks": ["photography", "digital-nomad"],
        "created": _days_ago(160),
        "updated": _days_ago(10),
        "sources": ["xiaohongshu-tracker"],
        "content": """# 徒步

城市徒步和山野徒步都喜欢。徒步是和 [[photography]] 结合最好的活动。

## 已完成路线

### 山野
- 武功山（2天1夜，云海日出）
- 四姑娘山大峰（5,025m，目前最高海拔）
- 雨崩村（4天徒步，梅里雪山）

### 城市散步
- 上海法租界（最喜欢的城市散步路线）
- 京都哲学之道（赏樱季，和 [[japanese-learning]] 相关）
- 香港龙脊（海边山脊，绝美）

## 装备清单

轻量化路线：
- 背包: Osprey Exos 58
- 帐篷: MSR Hubba Hubba NX
- 睡袋: Sea to Summit Spark III
- 相机: [[photography]] X-T4 + 23mm

## 计划中的路线

- [ ] 尼泊尔 ABC (Annapurna Base Camp)
- [ ] 日本熊野古道
- [ ] 新西兰 Milford Track
- [ ] 秘鲁印加古道

## 与 [[existentialism]] 的连接

在山里走的时候，很多关于「意义」的思考会自然消散。脚踩在地上的实感、风吹过脸的触觉、远处山峦的轮廓——这些比任何哲学论述都更有说服力。

> 存在的实感，不在书里，在脚下。
"""
    },
    {
        "slug": "bilibili-up",
        "title": "B站科普UP主",
        "category": "entity",
        "tags": ["B站", "科普", "视频创作", "内容创作"],
        "wiki_type": "intel",
        "backlinks": ["vibe-coding", "digital-nomad"],
        "created": _days_ago(60),
        "updated": _days_ago(3),
        "sources": ["bilibili-tracker"],
        "content": """# B站科普UP主

作为一个具身智能方向的博士生，我想把自己学到的东西用通俗的方式分享出去。

## 内容方向

### 已发布系列
- **「机器人能做什么」**: 每期介绍一个有趣的机器人研究成果
- **「论文速读」**: 5分钟讲清一篇顶会论文的核心 idea
- **「实验室日常」**: 读博生活 vlog

### 计划中
- **「从零搭建机器人」**: 用开源硬件搭一个简单的操控机器人
- **「AI/机器人行业地图」**: 梳理整个行业的公司和技术路线

## 数据

- 粉丝：~2,000（起步阶段）
- 播放最高的一期：RT-2 论文解读（8,000+ 播放）
- 更新频率：月更 2-3 期

## 创作流程

1. 选题（关注 arxiv/Twitter 趋势）
2. 写脚本（Markdown，然后转 teleprompter）
3. 录制（家里简单布光 + 录屏）
4. 剪辑（DaVinci Resolve）
5. 封面（Figma 出图）

## 为什么做这个

1. **输出倒逼输入**: 要讲清楚一个东西，你得先真正理解它
2. **建立影响力**: 对未来的 [[digital-nomad]] 和 [[vibe-coding]] 路线有帮助
3. **回馈社区**: 自己从 B 站学了很多，也想贡献一些
"""
    },
    {
        "slug": "film",
        "title": "电影",
        "category": "entity",
        "tags": ["电影", "观影", "科幻", "文艺"],
        "wiki_type": "intel",
        "backlinks": ["existentialism"],
        "created": _days_ago(140),
        "updated": _days_ago(4),
        "sources": ["bilibili-tracker"],
        "content": """# 电影

每周至少看一部电影。电影是我理解世界的另一种方式。

## 最爱导演

- **王家卫**: 视觉诗人，每一帧都是摄影作品
- **是枝裕和**: 日常中的诗意，安静但有力量
- **诺兰**: 时间叙事的大师
- **塔可夫斯基**: 影像的哲学

## 年度 Top (2025)

1. 《完美的日子》(Wim Wenders) — 关于简单生活的美
2. 《奥本海默》— 科学家的道德困境
3. 《坠落的审判》— 真相的不可知性

## 与 [[existentialism]] 的交集

- 《第七封印》(伯格曼): 死亡面前的意义追问
- 《潜行者》(塔可夫斯基): 信仰与怀疑
- 《银翼杀手 2049》: 什么是「真实」的存在？

## 科幻电影与研究

做机器人研究的人看科幻电影会有不一样的感受：
- 《她》(Her): 我们在做的 AI 对话系统的极端形态
- 《机械姬》(Ex Machina): 具身智能的伦理问题
- 《星际穿越》: 引力和时间——物理世界的诗意

## 观影笔记

在 Obsidian 里有一个「观影笔记」文件夹，每部电影写 200-500 字的感想。不是影评，是个人共鸣。
"""
    },

    # ━━━━━━━━ CONCEPT (思考 · 生活方式) ━━━━━━━━
    {
        "slug": "digital-nomad",
        "title": "数字游民与 FIRE",
        "category": "concept",
        "tags": ["数字游民", "FIRE", "远程工作", "自由", "生活方式"],
        "wiki_type": "intel",
        "backlinks": ["vibe-coding", "stock-trading", "japanese-learning", "hiking"],
        "created": _days_ago(20),
        "updated": _days_ago(2),
        "sources": ["xiaohongshu-tracker", "zhihu-tracker"],
        "content": """# 数字游民与 FIRE

数字游民 (Digital Nomad) + 财务自由/提前退休 (FIRE) 是我的长期生活方式目标。

## 为什么想做数字游民

1. **自由度**: 不被地理位置束缚
2. **成本套利**: 低成本地区生活，赚发达地区的钱
3. **体验**: [[hiking]]、[[photography]] 都需要移动自由
4. **专注**: 远离办公室政治

## FIRE 路线

### 收入来源规划
1. **独立开发** ([[vibe-coding]] 加持)
2. **技术内容创作** ([[bilibili-up]])
3. **投资** ([[stock-trading]])
4. **兼职咨询**

### 支出控制
- 目标：月支出 < 8,000 (东南亚/日本乡下)
- 住宿：长租公寓 / Coliving
- 交通：公共交通 + 步行

## 理想基地

1. **清迈** (泰国): 成本低、数字游民社区成熟
2. **日本乡下** ([[japanese-learning]]): 安全、干净、文化丰富
3. **里斯本** (葡萄牙): 欧洲最友好的游牧签证
4. **巴厘岛** (印尼): 冲浪 + 瑜伽 + 便宜

## 心理建设

> 「存在先于本质」—— [[existentialism]]

不需要先找到人生意义才开始活。读博不是目的，是手段。
"""
    },
    {
        "slug": "vibe-coding",
        "title": "Vibe Coding",
        "category": "concept",
        "tags": ["Vibe Coding", "AI 编程", "Claude", "副业"],
        "wiki_type": "intel",
        "backlinks": ["digital-nomad", "bilibili-up"],
        "created": _days_ago(15),
        "updated": _days_ago(1),
        "sources": ["xiaohongshu-tracker", "zhihu-tracker"],
        "content": """# Vibe Coding

用 AI 辅助编程，边听音乐边写代码，享受心流。Andrej Karpathy 2025 年初提出的概念。

## 我的理解

1. **你负责思考和设计**（架构、需求、审美）
2. **AI 负责实现**（写代码、调试、重构）
3. **你负责审核和迭代**

本质上是把编程从「手工活」变成了「导演活」。

## 我的实践

这个 ABO 项目本身就是 Vibe Coding 的产物。整个系统——前端 React + 后端 FastAPI + Tauri 桌面应用——都是通过 Claude Code 协作完成的。

### 工具链
- **Claude Code**: 主力 AI 编程助手
- **Cursor**: 日常代码编辑
- **GitHub Copilot**: 补全和小修改

### 心得
- 把需求拆成小任务，一次只做一件事
- 先写清楚 spec，再让 AI 实现
- 审代码比写代码重要
- 保持良好的 git 习惯，随时可以回滚

## 与 [[digital-nomad]] 的关系

Vibe Coding 大幅降低了独立开发的门槛。一个人 + AI 就能做出以前需要小团队的产品。你可以在咖啡馆里做出一个完整的产品。
"""
    },
    {
        "slug": "existentialism",
        "title": "存在主义思考",
        "category": "concept",
        "tags": ["存在主义", "加缪", "萨特", "哲学", "人生"],
        "wiki_type": "intel",
        "backlinks": ["the-outsider", "myth-of-sisyphus", "digital-nomad", "film", "hiking", "photography"],
        "created": _days_ago(80),
        "updated": _days_ago(2),
        "sources": [],
        "content": """# 存在主义思考

关于「存在」「意义」和「如何生活」的个人思考框架。

## 三位老师

### 加缪：荒诞的反抗
世界没有意义，所以要活得更加热烈。推石头本身就是反抗。
→ 论文被拒就是巨石滚落，然后你再推一次。详见 [[myth-of-sisyphus]]。

### 萨特：存在先于本质
你通过选择和行动**成为**自己。不是因为读博有意义才读，而是你的行动赋予了它意义。

### 克尔凯郭尔：焦虑即自由
焦虑意味着你面前有选择，选择意味着自由。

## 日常实践

1. **写日记** ([[journal]]): 记录思考，对抗遗忘
2. **弹吉他** ([[guitar]]): 用身体对抗虚无
3. **徒步** ([[hiking]]): 在自然中找到存在的实感
4. **摄影** ([[photography]]): 捕捉「当下」
5. **读文学**: [[the-outsider]]、[[norwegian-wood]]

## 一个悖论

我在教机器人理解物理世界——但我自己理解这个世界了吗？

> 存在先于本质——但代码先于存在。
"""
    },
    {
        "slug": "journal",
        "title": "日记与写作",
        "category": "concept",
        "tags": ["日记", "写作", "Obsidian", "反思"],
        "wiki_type": "intel",
        "backlinks": ["existentialism"],
        "created": _days_ago(100),
        "updated": _days_ago(1),
        "sources": [],
        "content": """# 日记与写作

每天在 Obsidian 中写日记，是我最持续的习惯之一。

## 日记模板

```markdown
# YYYY-MM-DD 周X

## 今天做了什么
- ...

## 心情/能量 (1-10)
- 心情: X/10
- 精力: X/10
- SAN: X/10

## 思考
（自由书写，不限主题）

## 明天计划
- ...
```

## 写作作为思考工具

写作不是记录思考的结果，而是思考本身。很多时候，我在写日记的过程中才发现自己真正在想什么。

## 与 Obsidian 的关系

日记是 Obsidian Vault 的核心内容。通过 `[[wikilink]]` 和标签，日记条目自然地连接到其他笔记（书评、论文笔记、项目记录）。

Obsidian 的 Graph View 可以看到日记和各种笔记之间的关联网络——这比线性的日记本强大太多了。

## 与 [[existentialism]] 的关系

加缪说过：「如果世界是清楚的，艺术就不会存在。」写日记是我面对不确定性的方式——把混沌的思绪变成可审视的文字。
"""
    },
    {
        "slug": "the-outsider",
        "title": "局外人 — 加缪",
        "category": "concept",
        "tags": ["加缪", "存在主义", "法国文学", "读书笔记"],
        "wiki_type": "intel",
        "backlinks": ["existentialism", "myth-of-sisyphus"],
        "created": _days_ago(90),
        "updated": _days_ago(4),
        "sources": [],
        "content": """# 局外人 (L'Etranger)

**作者**: 阿尔贝·加缪 | **年份**: 1942

## 读书笔记

莫尔索的「冷漠」不是无情，而是对虚伪社会仪式的拒绝。他被判死刑不是因为杀了人，而是因为「在母亲的葬礼上没有哭」。

> 我知道这个世界我无处容身，只是，你凭什么审判我的灵魂？

## 与 [[existentialism]] 的关系

莫尔索活在当下、拒绝虚伪、接受荒诞——加缪所倡导的生活态度。

## 个人共鸣

学术圈里有太多虚伪的「葬礼」——无意义的会议、形式化的报告、为引用数而写的论文。莫尔索会怎么做？他大概会直接走出会议室，去海边晒太阳。

## 相关

- [[myth-of-sisyphus]] — 加缪的哲学随笔，和局外人互为表里
- [[norwegian-wood]] — 另一种面对「失去」的方式
"""
    },
    {
        "slug": "norwegian-wood",
        "title": "挪威的森林 — 村上春树",
        "category": "concept",
        "tags": ["村上春树", "日本文学", "音乐", "读书笔记"],
        "wiki_type": "intel",
        "backlinks": ["existentialism", "japanese-learning", "guitar"],
        "created": _days_ago(85),
        "updated": _days_ago(5),
        "sources": ["xiaoyuzhou-tracker"],
        "content": """# 挪威的森林 (ノルウェイの森)

**作者**: 村上春树 | **年份**: 1987

## 阅读感想

学 [[japanese-learning]] 的过程中重读了原版。日语原文里有中译本无法传达的东西：语尾的微妙变化、敬语和平语的切换、省略带来的余韵。

## 音乐意象

Beatles 的 Norwegian Wood 贯穿全书。作为弹 [[guitar]] 的人，我特别能感受到音乐在村上世界里的分量。音乐不只是背景，它是一种情感语言。

## 播客笔记

「文化有限」播客关于村上春树的一期：村上的跑步哲学和写作哲学是一回事——都是通过重复性的身体行为来对抗虚无。

> 死并非生的对立面，而作为生的一部分永存。
"""
    },
    {
        "slug": "myth-of-sisyphus",
        "title": "西西弗斯神话 — 加缪",
        "category": "concept",
        "tags": ["加缪", "荒诞", "哲学", "读书笔记"],
        "wiki_type": "intel",
        "backlinks": ["existentialism", "the-outsider"],
        "created": _days_ago(75),
        "updated": _days_ago(8),
        "sources": [],
        "content": """# 西西弗斯神话

**作者**: 阿尔贝·加缪 | **年份**: 1942

## 核心论点

> 真正严肃的哲学问题只有一个：自杀。

加缪不是在鼓励自杀，而是在追问：在无意义的世界里，为什么要继续活着？

## 答案：荒诞的反抗

明知巨石会滚落，仍然选择推上去。

> 应当想象西西弗斯是幸福的。

## 与读博的类比

| 西西弗斯 | 博士生 |
|----------|--------|
| 推巨石上山 | 写论文投稿 |
| 巨石滚落 | 论文被拒 |
| 再推一次 | 修改重投 |

关键不在于石头最终留不留在山顶（答案是不会），而在于**你推石头时的姿态**。

## 相关
- [[the-outsider]] — 加缪的文学表述
- [[existentialism]] — 整体思考框架
"""
    },
]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#                    LIT WIKI (文献库 — 全部科研内容)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DEMO_WIKI_PAGES_LIT = [
    # ━━━━━━━━ PAPER (单篇论文) ━━━━━━━━
    {
        "slug": "rt-2",
        "title": "RT-2: Vision-Language-Action Models",
        "category": "paper",
        "tags": ["RT-2", "VLA", "Google DeepMind", "CoRL 2023"],
        "wiki_type": "lit",
        "backlinks": ["vla-models", "embodied-intelligence", "open-x-embodiment"],
        "created": _days_ago(60),
        "updated": _days_ago(2),
        "sources": ["url:https://arxiv.org/abs/2307.15818"],
        "content": """# RT-2: Vision-Language-Action Models

**作者**: Anthony Brohan + 53 位共同作者 (Google DeepMind)
**发表**: 2023.07, CoRL 2023 | arXiv:2307.15818

## 核心贡献

将视觉-语言模型 (VLM) 扩展为 VLA，首次证明**网络规模预训练知识可迁移到机器人控制**。把机器人动作编码为 token（如 `1 128 91 241 5 101 127 217`），和文字 token 在同一个 Transformer 处理。

## 关键实验

- 6,000+ 次真实机器人评估
- 能操控训练中从未见过的物体
- 能执行多步推理（"拿起不属于这里的东西"）
- RT-2-X 在 [[open-x-embodiment]] 上训练，泛化提升 50%

## 个人思考

> 这篇论文让我确信：具身智能的突破不在于更好的控制算法，而在于更好的**表示学习**。
"""
    },
    {
        "slug": "diffusion-policy",
        "title": "Diffusion Policy",
        "category": "paper",
        "tags": ["Diffusion Policy", "扩散模型", "RSS 2023", "Columbia"],
        "wiki_type": "lit",
        "backlinks": ["vla-models", "embodied-intelligence", "imitation-learning"],
        "created": _days_ago(50),
        "updated": _days_ago(3),
        "sources": ["url:https://arxiv.org/abs/2303.04137"],
        "content": """# Diffusion Policy

**作者**: Cheng Chi 等 | **机构**: Columbia / Toyota / MIT
**发表**: RSS 2023, IJRR 2024 | arXiv:2303.04137

## 核心思想

用扩散去噪生成机器人动作轨迹——把「生成图像」变成「生成动作」。天然支持多模态动作分布。

## 关键结果

- 12 个任务 / 4 个 benchmark 超越 SOTA **46.9%**
- 后续: 3D Diffusion Policy (DP3), Diffusion Meets DAgger (DMD)
- 已成为机器人学习的主流 action backbone

## 与 VLA 的互补

VLA 擅长 high-level reasoning，Diffusion Policy 擅长 fine-grained manipulation。未来可能结合：VLA 做高层规划，Diffusion 做底层执行。
"""
    },
    {
        "slug": "palm-e",
        "title": "PaLM-E: 具身多模态语言模型",
        "category": "paper",
        "tags": ["PaLM-E", "多模态", "Google", "ICML 2023"],
        "wiki_type": "lit",
        "backlinks": ["foundation-models-robotics", "vla-models"],
        "created": _days_ago(55),
        "updated": _days_ago(10),
        "sources": ["url:https://arxiv.org/abs/2303.03378"],
        "content": """# PaLM-E: An Embodied Multimodal Language Model

**作者**: Danny Driess 等 | **机构**: Google / TU Berlin
**发表**: 2023.03, ICML 2023

## 核心贡献

562B 参数多模态语言模型，直接整合连续传感器信号。关键发现：**跨域联合训练产生正迁移**——语言、视觉、机器人三个域互相增强。
"""
    },
    {
        "slug": "voxposer",
        "title": "VoxPoser",
        "category": "paper",
        "tags": ["VoxPoser", "LLM", "零样本", "Stanford"],
        "wiki_type": "lit",
        "backlinks": ["language-conditioned-manipulation"],
        "created": _days_ago(45),
        "updated": _days_ago(7),
        "sources": ["url:https://arxiv.org/abs/2307.05973"],
        "content": """# VoxPoser

**作者**: Wenlong Huang 等 | **机构**: Stanford
**发表**: 2023.07, CoRL 2023

## 核心思想

LLM 写代码 → 调用 VLM 定位物体 → 合成 3D 体素价值图 → MPC 规划。**完全零样本**，真实 Franka Panda 上 70-90% 成功率。

代表了和 VLA 完全不同的范式：不是端到端学习，而是利用 LLM 推理做组合式规划。可解释、零样本，但依赖 LLM 代码生成质量。
"""
    },
    {
        "slug": "open-x-embodiment",
        "title": "Open X-Embodiment",
        "category": "paper",
        "tags": ["OXE", "数据集", "RT-X", "跨机器人"],
        "wiki_type": "lit",
        "backlinks": ["foundation-models-robotics", "rt-2"],
        "created": _days_ago(50),
        "updated": _days_ago(4),
        "sources": ["url:https://arxiv.org/abs/2310.08864"],
        "content": """# Open X-Embodiment

**机构**: Google DeepMind + 21 家机构 (34 个实验室)
**发表**: 2023.10

最大开源真实机器人数据集：100 万+ 轨迹、22 种机器人、527 种技能。RT-2-X 泛化提升 50%。RLDS 格式已成为数据共享的事实标准。
"""
    },
    {
        "slug": "saycan",
        "title": "SayCan",
        "category": "paper",
        "tags": ["SayCan", "语言接地", "affordance", "Google"],
        "wiki_type": "lit",
        "backlinks": ["language-conditioned-manipulation"],
        "created": _days_ago(70),
        "updated": _days_ago(15),
        "sources": ["url:https://arxiv.org/abs/2204.01691"],
        "content": """# SayCan: Do As I Can, Not As I Say

**机构**: Google Robotics | **发表**: 2022, CoRL 2022

LLM 评估「有用性」× affordance 模型评估「可行性」= 接地的动作选择。PaLM-SayCan: 84% 技能序列正确率，74% 执行成功率。[[language-conditioned-manipulation]] 的奠基之作。
"""
    },
    {
        "slug": "pi0-paper",
        "title": "pi0: VLA Flow Model",
        "category": "paper",
        "tags": ["pi0", "Physical Intelligence", "通用机器人"],
        "wiki_type": "lit",
        "backlinks": ["physical-intelligence", "vla-models", "foundation-models-robotics"],
        "created": _days_ago(25),
        "updated": _days_ago(1),
        "sources": ["url:https://arxiv.org/abs/2410.24164"],
        "content": """# pi0: A Vision-Language-Action Flow Model

**机构**: Physical Intelligence | **发表**: 2024.10

3B 参数 VLA flow model，10,000+ 小时真实数据，7 种机器人，68 个任务。第一个真正的通用机器人基础模型：叠衣服、组装盒子、收拾桌面。2025.02 通过 openpi 完全开源。

关键 insight：不需要巨大参数量，3B 够了——关键是**高质量数据**。
"""
    },
    {
        "slug": "robocasa",
        "title": "RoboCasa",
        "category": "paper",
        "tags": ["RoboCasa", "仿真", "benchmark"],
        "wiki_type": "lit",
        "backlinks": ["sim-to-real"],
        "created": _days_ago(20),
        "updated": _days_ago(5),
        "sources": ["url:https://arxiv.org/abs/2406.02523"],
        "content": """# RoboCasa

**机构**: UT Austin | **发表**: 2024

大规模家庭机器人仿真框架。RoboCasa365: 365 个任务、2,500 个环境、2,200+ 小时示教。仿真+少量真实数据协同训练显著优于纯仿真。
"""
    },

    # ━━━━━━━━ TOPIC (研究方向 · 技术概念 · 公司/平台) ━━━━━━━━
    {
        "slug": "embodied-intelligence",
        "title": "具身智能 (Embodied Intelligence)",
        "category": "topic",
        "tags": ["具身智能", "机器人", "AI", "核心研究方向"],
        "wiki_type": "lit",
        "backlinks": [],
        "created": _days_ago(60),
        "updated": _days_ago(1),
        "sources": ["arxiv-tracker", "semantic-scholar-tracker"],
        "content": """# 具身智能 (Embodied Intelligence)

我的博士研究核心领域：将 AI 与物理实体结合，使其在真实环境中感知、推理和行动。

## 技术路线图

1. **VLA 路线** ([[vla-models]]): RT-2, OpenVLA, pi0 — 端到端
2. **扩散策略** ([[diffusion-policy]]): 多模态动作生成
3. **世界模型** ([[world-models]]): 在想象中规划
4. **语言接地** ([[language-conditioned-manipulation]]): 自然语言指定任务

## 行业格局

| 玩家 | 路线 | 特点 |
|------|------|------|
| [[google-deepmind-robotics]] | VLA + 数据 | 研究最前沿 |
| [[physical-intelligence]] | 通用基础模型 | 完全开源，融资 $11B |
| [[figure-ai]] | 人形 + 工厂 | 唯一有商业部署 |
| [[unitree]] | 低成本硬件 | 最便宜的研究平台 |
| [[nvidia-isaac]] | 仿真 + 基础模型 | 生态位 |

## 我的研究定位

VLA + [[sim-to-real]] 交叉点：让仿真训练的 VLA 模型在真实机器人上可靠运行。
"""
    },
    {
        "slug": "vla-models",
        "title": "Vision-Language-Action 模型",
        "category": "topic",
        "tags": ["VLA", "RT-2", "OpenVLA", "pi0", "基础模型"],
        "wiki_type": "lit",
        "backlinks": ["embodied-intelligence"],
        "created": _days_ago(40),
        "updated": _days_ago(2),
        "sources": ["arxiv-tracker"],
        "content": """# Vision-Language-Action 模型 (VLA)

把机器人动作编码为 token，让一个 Transformer 同时处理「看」「说」「做」。

## 时间线

| 模型 | 团队 | 日期 | 参数 | 贡献 |
|------|------|------|------|------|
| RT-1 | Google | 2022 | - | 第一个大规模 Robotics Transformer |
| [[rt-2]] | Google | 2023.07 | 55B | 首个 VLA |
| [[palm-e]] | Google | 2023.03 | 562B | 最大多模态具身模型 |
| Octo | Berkeley | 2024 | 93M | 开源 |
| OpenVLA | Stanford | 2024.06 | 7B | 开源，超越 RT-2-X |
| [[pi0-paper]] | PI | 2024.10 | 3B | 首个通用型 |

## 个人笔记

我的直觉：**7B 左右的开源模型 + 高质量领域数据** 是最实用的路线。OpenVLA 已经证明了：数据 > 模型大小。
"""
    },
    {
        "slug": "sim-to-real",
        "title": "Sim-to-Real 迁移",
        "category": "topic",
        "tags": ["Sim-to-Real", "仿真", "Domain Randomization"],
        "wiki_type": "lit",
        "backlinks": ["embodied-intelligence", "nvidia-isaac"],
        "created": _days_ago(55),
        "updated": _days_ago(3),
        "sources": ["arxiv-tracker"],
        "content": """# Sim-to-Real 迁移

在仿真中训练，在真实世界中部署——我的博士研究重点方向。

## 方法

1. **Domain Randomization**: 随机化仿真参数（质量、摩擦、光照）
2. **System Identification**: 测量真实参数校准仿真器
3. **视觉基础模型**: CLIP/DINOv2 提取域无关特征
4. **Real-to-Sim-to-Real**: 真实数据校准仿真 → 训练 → 迁移

## 我的研究

聚焦 **progressive domain randomization**：随策略变强逐步扩大随机化范围。初步实验比 uniform DR 收敛更快。
"""
    },
    {
        "slug": "world-models",
        "title": "世界模型 (World Models)",
        "category": "topic",
        "tags": ["World Models", "DreamerV3", "UniSim", "Genie"],
        "wiki_type": "lit",
        "backlinks": ["embodied-intelligence", "nvidia-isaac"],
        "created": _days_ago(20),
        "updated": _days_ago(4),
        "sources": ["arxiv-tracker"],
        "content": """# 世界模型

学习环境动力学，在「想象」中规划行动。

## 关键模型

- **DreamerV3** (Nature 2025): 单一算法 150+ 种任务
- **UniSim** (ICLR 2024 Outstanding): 交互式真实世界模拟器
- **Genie 3** (2025): 实时 24fps、720p 生成可控 3D 环境
- **NVIDIA Cosmos** (2025): 开源世界基础模型

世界模型可能是具身智能的「最终形态」——真正理解物理世界的因果结构。
"""
    },
    {
        "slug": "dexterous-manipulation",
        "title": "灵巧操控",
        "category": "topic",
        "tags": ["灵巧操控", "灵巧手", "DexGraspNet"],
        "wiki_type": "lit",
        "backlinks": ["embodied-intelligence", "tactile-sensing"],
        "created": _days_ago(30),
        "updated": _days_ago(5),
        "sources": ["arxiv-tracker"],
        "content": """# 灵巧操控

让机器人像人手一样灵巧——最难的子问题之一。

## 近期突破

- **DexGraspNet 2.0** (CoRL 2024): 杂乱场景 90.7% 成功率
- **DexGrasp Anything** (CVPR 2025): 通用灵巧抓取 SOTA
- **RotateIt** (CoRL 2023): 视触融合指尖旋转，sim→real 零样本

灵巧操控几乎必然需要 [[tactile-sensing]]。视觉→「在哪里抓」，触觉→「抓得对不对」。
"""
    },
    {
        "slug": "tactile-sensing",
        "title": "触觉感知",
        "category": "topic",
        "tags": ["触觉", "GelSight", "DIGIT", "Sparsh"],
        "wiki_type": "lit",
        "backlinks": ["dexterous-manipulation"],
        "created": _days_ago(25),
        "updated": _days_ago(6),
        "sources": ["arxiv-tracker"],
        "content": """# 触觉感知

视觉无法感知接触力、滑动、纹理。触觉是精细 [[dexterous-manipulation]] 的关键。

## 关键传感器

- **GelSight**: 光学触觉，微米级精度，~$500
- **DIGIT** (Meta): 紧凑低成本 $350，开源
- **Digit 360** (2024): 18+ 模态，人类级精度

## 触觉基础模型

**Sparsh** (Meta, 2024): 46 万+ 触觉图像自监督训练，比特化模型提升 95.1%。2024-2025 是触觉的「ImageNet 时刻」。
"""
    },
    {
        "slug": "foundation-models-robotics",
        "title": "机器人基础模型",
        "category": "topic",
        "tags": ["基础模型", "Scaling", "通用机器人"],
        "wiki_type": "lit",
        "backlinks": ["embodied-intelligence", "vla-models"],
        "created": _days_ago(35),
        "updated": _days_ago(3),
        "sources": ["arxiv-tracker"],
        "content": """# 机器人基础模型

从「一个任务一个模型」到「一个模型所有任务」——机器人学的 GPT 时刻。

## 路线

1. **VLA** ([[vla-models]]): 端到端
2. **LLM as Planner**: [[saycan]], Code as Policies
3. **世界模型** ([[world-models]]): 想象中规划
4. **多模态感知**: [[palm-e]], Sparsh

## 核心挑战

数据稀缺 > 安全 > 实时性 > 跨形态泛化。谁能高效收集高质量机器人数据，谁就能赢。
"""
    },
    {
        "slug": "imitation-learning",
        "title": "模仿学习",
        "category": "topic",
        "tags": ["模仿学习", "BC", "DAgger"],
        "wiki_type": "lit",
        "backlinks": ["diffusion-policy"],
        "created": _days_ago(55),
        "updated": _days_ago(3),
        "sources": ["arxiv-tracker"],
        "content": """# 模仿学习

从专家示教中学习，当前机器人学习最主流的范式。

## 方法

- **BC**: 监督学习 obs→action，简单但有分布偏移
- **DAgger**: 迭代收集专家纠正，需在线专家
- **[[diffusion-policy]]**: 扩散模型 BC，克服模式崩塌

## 前沿

- **DMD** (RSS 2024): 扩散合成纠正数据，8 demo → 80%
- **Instant Policy** (ICLR 2025): 单条 demo 即时推理

我的实验主要用 IL。纯 RL 在真实机器人上太危险。
"""
    },
    {
        "slug": "language-conditioned-manipulation",
        "title": "语言条件操控",
        "category": "topic",
        "tags": ["语言接地", "LLM", "机器人控制"],
        "wiki_type": "lit",
        "backlinks": ["embodied-intelligence"],
        "created": _days_ago(45),
        "updated": _days_ago(5),
        "sources": ["arxiv-tracker"],
        "content": """# 语言条件操控

用自然语言指定机器人任务。

## 发展路线

1. **模块化** (2022): [[saycan]] (LLM × affordance), Code as Policies
2. **组合式** (2023): [[voxposer]] (3D 价值图), CLIPort
3. **端到端** (2023-): [[rt-2]], OpenVLA, [[pi0-paper]] — VLA 统一一切

端到端 VLA 成为主流，但组合式方法在可解释性和复杂推理方面仍有优势。
"""
    },
    {
        "slug": "google-deepmind-robotics",
        "title": "Google DeepMind Robotics",
        "category": "topic",
        "tags": ["DeepMind", "Google", "RT-2", "研究机构"],
        "wiki_type": "lit",
        "backlinks": ["embodied-intelligence", "vla-models"],
        "created": _days_ago(45),
        "updated": _days_ago(2),
        "sources": ["arxiv-tracker"],
        "content": """# Google DeepMind Robotics

具身智能领域最具影响力的研究机构。推动了 [[rt-2]]、[[saycan]]、[[open-x-embodiment]]、ALOHA 系列等重大突破。

关键人物：Karol Hausman (后创办 [[physical-intelligence]])、Sergey Levine、Pete Florence、Andy Zeng。

路线：**用互联网规模数据解决机器人智能**。
"""
    },
    {
        "slug": "physical-intelligence",
        "title": "Physical Intelligence (pi)",
        "category": "topic",
        "tags": ["PI", "pi0", "创业公司", "基础模型"],
        "wiki_type": "lit",
        "backlinks": ["foundation-models-robotics", "vla-models"],
        "created": _days_ago(30),
        "updated": _days_ago(1),
        "sources": ["arxiv-tracker"],
        "content": """# Physical Intelligence

2024 成立，通用机器人基础模型创业公司。创始人 Karol Hausman + Sergey Levine。总融资 $11 亿，估值 $5.6B。

核心产品 [[pi0-paper]]: 3B 参数 VLA，10K 小时数据，7 种机器人。2025 完全开源 (openpi)。

如果我毕业后不走学术路线，PI 是 dream company 之一。
"""
    },
    {
        "slug": "figure-ai",
        "title": "Figure AI",
        "category": "topic",
        "tags": ["Figure", "人形机器人", "创业公司"],
        "wiki_type": "lit",
        "backlinks": ["embodied-intelligence"],
        "created": _days_ago(40),
        "updated": _days_ago(5),
        "sources": [],
        "content": """# Figure AI

通用人形机器人。Figure 02 在 BMW 工厂运行 11 个月（90,000+ 零件），是行业第一个有意义的商业验证。2025 放弃 OpenAI 转自研 "Helix"。估值 $39B。
"""
    },
    {
        "slug": "unitree",
        "title": "宇树科技 (Unitree)",
        "category": "topic",
        "tags": ["宇树", "G1", "国产", "开源"],
        "wiki_type": "lit",
        "backlinks": ["embodied-intelligence"],
        "created": _days_ago(35),
        "updated": _days_ago(3),
        "sources": ["bilibili-tracker"],
        "content": """# 宇树科技

G1 (127cm, $13,500 起) 可能是当前性价比最高的人形机器人研究平台。2026 开源 UnifoLM-VLA-0。2025 出货 5,500 台，2026 目标 20,000 台。

如果实验室要买人形机器人，G1 是第一选择。
"""
    },
    {
        "slug": "nvidia-isaac",
        "title": "NVIDIA Isaac & GR00T",
        "category": "topic",
        "tags": ["NVIDIA", "Isaac", "GR00T", "仿真"],
        "wiki_type": "lit",
        "backlinks": ["sim-to-real", "world-models"],
        "created": _days_ago(25),
        "updated": _days_ago(4),
        "sources": [],
        "content": """# NVIDIA Isaac & GR00T

Isaac Lab: GPU 加速仿真。GR00T N1 (2025): 开源人形机器人基础模型，双系统架构 (快系统+慢系统)。Newton 物理引擎 (与 DeepMind/Disney 合作)。

策略：做「卖铲子的人」——不做机器人，提供整个 AI 堆栈。
"""
    },
]


# ── Wiki Helper Functions ────────────────────────────────────────

def get_demo_wiki_pages(wiki_type: str) -> list[dict]:
    if wiki_type == "intel":
        return DEMO_WIKI_PAGES_INTEL
    return DEMO_WIKI_PAGES_LIT


def get_demo_wiki_graph(wiki_type: str) -> dict:
    import re
    pages = get_demo_wiki_pages(wiki_type)
    nodes = [{"id": p["slug"], "label": p["title"], "category": p["category"], "tags": p["tags"]} for p in pages]

    edges = []
    for p in pages:
        content = p["content"]
        links = re.findall(r'\[\[([^\]|]+?)(?:\|[^\]]+?)?\]\]', content)
        for link in links:
            slug = link.strip().lower().replace(" ", "-")
            if any(n["id"] == slug for n in nodes):
                edges.append({"source": p["slug"], "target": slug})

    return {"nodes": nodes, "edges": edges}


def get_demo_wiki_stats(wiki_type: str) -> dict:
    pages = get_demo_wiki_pages(wiki_type)
    by_category: dict[str, int] = {}
    for p in pages:
        cat = p["category"]
        by_category[cat] = by_category.get(cat, 0) + 1

    return {
        "wiki_type": wiki_type,
        "total": len(pages),
        "by_category": by_category,
    }
